const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const dgram = require("node:dgram");
const net = require("node:net");

const DISCOVERY_PORT = 47653;
const DISCOVERY_INTERVAL_MS = 4000;
const DISCOVERY_STALE_MS = 20000;
const INVITE_TTL_MS = 5 * 60 * 1000;
const SOCKET_TIMEOUT_MS = 4000;
const SYNC_RETRY_INTERVAL_MS = 2000;
const SYNC_MAX_ATTEMPTS = 5;
const DEFAULT_KEY_TTL_DAYS = 30;
const MIN_KEY_TTL_DAYS = 1;
const MAX_KEY_TTL_DAYS = 365;
const SYNC_TREND_LIMIT = 120;
const SYNC_TREND_SAMPLE_MS = 5000;

function clampKeyTtlDays(value) {
  const days = Number(value);
  if (!Number.isFinite(days)) {
    return DEFAULT_KEY_TTL_DAYS;
  }
  return Math.max(MIN_KEY_TTL_DAYS, Math.min(MAX_KEY_TTL_DAYS, Math.floor(days)));
}

function daysToMs(days) {
  return clampKeyTtlDays(days) * 24 * 60 * 60 * 1000;
}

function ensureWorkspaceKey(value) {
  const key = String(value || "").trim().toLowerCase();
  if (/^[a-f0-9]{64}$/.test(key)) {
    return key;
  }
  return randomHex(32);
}

function encryptWithWorkspaceKey(workspaceKey, payload) {
  const keyBuffer = Buffer.from(ensureWorkspaceKey(workspaceKey), "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv);
  const json = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    payload: encrypted.toString("base64")
  };
}

function decryptWithWorkspaceKey(workspaceKey, encrypted) {
  const keyBuffer = Buffer.from(ensureWorkspaceKey(workspaceKey), "hex");
  const iv = Buffer.from(String(encrypted?.iv || ""), "base64");
  const tag = Buffer.from(String(encrypted?.tag || ""), "base64");
  const payload = Buffer.from(String(encrypted?.payload || ""), "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, iv);
  decipher.setAuthTag(tag);
  const decoded = Buffer.concat([decipher.update(payload), decipher.final()]);
  return safeJsonParse(decoded.toString("utf8"));
}

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeAddress(value) {
  const raw = String(value || "").trim();
  if (raw.startsWith("::ffff:")) {
    return raw.slice(7);
  }
  return raw || "127.0.0.1";
}

function createReadableInviteCode() {
  const words = [
    "amber", "beacon", "cinder", "drift", "ember", "falcon", "grove", "harbor",
    "ion", "jungle", "kepler", "lotus", "matrix", "nova", "onyx", "pulse",
    "quartz", "raven", "solace", "tidal", "ultra", "vector", "willow", "zenith"
  ];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  const digits = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return `${pick()}-${pick()}-${digits}-${pick()}`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

class P2PLiveService {
  constructor({ storageDir, logger = console, onSyncEvent = null, onPeerTrusted = null }) {
    this.logger = logger;
    this.storageDir = storageDir;
    this.statePath = path.join(storageDir, "p2p-live-state.json");
    this.outboxPath = path.join(storageDir, "p2p-outbox.json");
    this.onSyncEvent = typeof onSyncEvent === "function" ? onSyncEvent : null;
    this.onPeerTrusted = typeof onPeerTrusted === "function" ? onPeerTrusted : null;

    this.discoverySocket = null;
    this.discoveryTimer = null;
    this.discoveryRunning = false;

    this.pairServer = null;
    this.listenPort = 0;

    this.discoveredPeers = new Map();
    this.pendingInvites = new Map();
    this.receivedEventIds = new Set();
    this.syncOutbox = [];
    this.syncRetryTimer = null;
    this.outgoingSyncCounters = new Map();
    this.incomingSyncCounters = new Map();
    this.peerSyncMeta = new Map();
    this.syncTrend = [];
    this.lastSyncTrendAt = 0;

    this.syncStats = {
      queued: 0,
      sent: 0,
      acked: 0,
      retried: 0,
      failed: 0,
      dropped: 0,
      lastAckAt: null,
      lastErrorAt: null,
      lastError: ""
    };

    this.state = {
      deviceId: randomHex(8),
      deviceName: os.hostname() || "Notely Peer",
      trustedPeers: [],
      incomingSyncCounters: {},
      revokedPeers: {},
      keyPolicyDays: DEFAULT_KEY_TTL_DAYS
    };
  }

  init() {
    ensureDir(this.storageDir);
    this.loadState();
    this.loadPersistedOutbox();
    this.startPairServer();
    this.syncRetryTimer = setInterval(() => {
      this.drainSyncOutbox().catch((error) => {
        this.logger.error("[p2p] sync outbox drain failed", error);
      });
    }, SYNC_RETRY_INTERVAL_MS);
  }

  shutdown() {
    this.stopDiscovery();
    if (this.syncRetryTimer) {
      clearInterval(this.syncRetryTimer);
      this.syncRetryTimer = null;
    }
    if (this.pairServer) {
      try {
        this.pairServer.close();
      } catch {
        // Ignore close failures.
      }
      this.pairServer = null;
      this.listenPort = 0;
    }
    this.persistOutbox();
    this.persistState();
  }

  loadState() {
    if (!fs.existsSync(this.statePath)) {
      this.persistState();
      return;
    }

    const parsed = safeJsonParse(fs.readFileSync(this.statePath, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      this.persistState();
      return;
    }

    this.state.deviceId = String(parsed.deviceId || this.state.deviceId);
    this.state.deviceName = String(parsed.deviceName || this.state.deviceName);
    this.state.trustedPeers = Array.isArray(parsed.trustedPeers)
      ? parsed.trustedPeers
        .filter((peer) => peer && typeof peer === "object")
        .map((peer) => ({
          peerId: String(peer.peerId || ""),
          name: String(peer.name || "Unknown peer"),
          address: normalizeAddress(peer.address),
          listenPort: Number(peer.listenPort) || 0,
          workspaceKey: ensureWorkspaceKey(peer.workspaceKey),
          pairedAt: String(peer.pairedAt || new Date().toISOString()),
          lastSeenAt: String(peer.lastSeenAt || ""),
          keyIssuedAt: String(peer.keyIssuedAt || peer.pairedAt || new Date().toISOString()),
          keyExpiresAt: String(
            peer.keyExpiresAt
            || new Date(Date.parse(String(peer.keyIssuedAt || peer.pairedAt || new Date().toISOString()))
              + daysToMs(parsed.keyPolicyDays)).toISOString()
          )
        }))
        .filter((peer) => peer.peerId)
      : [];

    this.state.keyPolicyDays = clampKeyTtlDays(parsed.keyPolicyDays);

    if (parsed.revokedPeers && typeof parsed.revokedPeers === "object") {
      this.state.revokedPeers = Object.fromEntries(
        Object.entries(parsed.revokedPeers)
          .map(([peerId, value]) => [String(peerId || "").trim(), String(value || "")])
          .filter(([peerId, value]) => peerId && value)
      );
    } else {
      this.state.revokedPeers = {};
    }

    if (parsed.incomingSyncCounters && typeof parsed.incomingSyncCounters === "object") {
      this.state.incomingSyncCounters = {};
      for (const [peerId, val] of Object.entries(parsed.incomingSyncCounters)) {
        const n = Number(val);
        if (Number.isInteger(n) && n > 0) {
          this.incomingSyncCounters.set(peerId, n);
          this.state.incomingSyncCounters[peerId] = n;
        }
      }
    }
  }

  persistState() {
    ensureDir(this.storageDir);
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  loadPersistedOutbox() {
    if (!fs.existsSync(this.outboxPath)) {
      return;
    }

    const parsed = safeJsonParse(fs.readFileSync(this.outboxPath, "utf8"));
    if (!Array.isArray(parsed)) {
      return;
    }

    const now = Date.now();
    const restored = parsed
      .filter((item) => item && typeof item === "object" && !item.done && (item.attempt || 0) < SYNC_MAX_ATTEMPTS)
      .map((item) => ({
        id: String(item.id || randomHex(8)),
        peerId: String(item.peerId || ""),
        eventId: String(item.eventId || ""),
        syncEvent: item.syncEvent && typeof item.syncEvent === "object" ? item.syncEvent : null,
        counter: Number(item.counter) || 0,
        attempt: Math.max(0, Number(item.attempt || 0) - 1),
        nextAttemptAt: now,
        lastError: "",
        done: false
      }))
      .filter((item) => item.peerId && item.syncEvent);

    this.syncOutbox.push(...restored);
    this.syncStats.queued += restored.length;
    if (restored.length > 0) {
      this.logger.log(`[p2p] restored ${restored.length} outbox item(s) from disk`);
    }
  }

  persistOutbox() {
    const toSave = this.syncOutbox
      .filter((task) => !task.done)
      .slice(0, 100)
      .map((task) => ({
        id: task.id,
        peerId: task.peerId,
        eventId: task.eventId,
        syncEvent: task.syncEvent,
        counter: task.counter,
        attempt: task.attempt,
        nextAttemptAt: task.nextAttemptAt
      }));

    ensureDir(this.storageDir);
    fs.writeFileSync(this.outboxPath, JSON.stringify(toSave, null, 2), "utf8");
  }

  setDeviceName(name) {
    const next = String(name || "").trim();
    if (!next) {
      throw new Error("Device name cannot be empty.");
    }
    this.state.deviceName = next;
    this.persistState();
    return this.state.deviceName;
  }

  setKeyPolicyDays(days) {
    const nextDays = clampKeyTtlDays(days);
    this.state.keyPolicyDays = nextDays;

    this.state.trustedPeers = this.state.trustedPeers.map((peer) => {
      const issuedAt = String(peer.keyIssuedAt || peer.pairedAt || new Date().toISOString());
      const issuedTs = Date.parse(issuedAt) || Date.now();
      return {
        ...peer,
        keyIssuedAt: new Date(issuedTs).toISOString(),
        keyExpiresAt: new Date(issuedTs + daysToMs(nextDays)).toISOString()
      };
    });

    this.persistState();
    return this.state.keyPolicyDays;
  }

  isKeyExpired(peer) {
    const expiresTs = Date.parse(String(peer?.keyExpiresAt || ""));
    return Number.isFinite(expiresTs) && Date.now() > expiresTs;
  }

  recordSyncTrendSample(force = false) {
    const now = Date.now();
    if (!force && (now - this.lastSyncTrendAt) < SYNC_TREND_SAMPLE_MS) {
      return;
    }

    this.lastSyncTrendAt = now;
    this.syncTrend.push({
      at: new Date(now).toISOString(),
      queued: Number(this.syncStats.queued || 0),
      sent: Number(this.syncStats.sent || 0),
      acked: Number(this.syncStats.acked || 0),
      retried: Number(this.syncStats.retried || 0),
      failed: Number(this.syncStats.failed || 0),
      dropped: Number(this.syncStats.dropped || 0),
      outboxCount: this.syncOutbox.filter((task) => !task.done).length
    });

    if (this.syncTrend.length > SYNC_TREND_LIMIT) {
      this.syncTrend = this.syncTrend.slice(this.syncTrend.length - SYNC_TREND_LIMIT);
    }
  }

  startDiscovery() {
    if (this.discoveryRunning) {
      return true;
    }

    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    socket.on("error", (error) => {
      this.logger.error("[p2p] discovery socket error", error);
    });

    socket.on("message", (message, rinfo) => {
      const data = safeJsonParse(String(message || ""));
      if (!data || data.type !== "hello") {
        return;
      }
      const peerId = String(data.peerId || "").trim();
      if (!peerId || peerId === this.state.deviceId) {
        return;
      }

      const entry = {
        peerId,
        name: String(data.name || "Unknown peer"),
        address: normalizeAddress(rinfo.address),
        listenPort: Number(data.listenPort) || 0,
        updatedAt: Date.now(),
        discoveredAt: this.discoveredPeers.get(peerId)?.discoveredAt || Date.now(),
        trusted: this.state.trustedPeers.some((peer) => peer.peerId === peerId)
      };

      this.discoveredPeers.set(peerId, entry);

      const trustedIndex = this.state.trustedPeers.findIndex((peer) => peer.peerId === peerId);
      if (trustedIndex >= 0) {
        this.state.trustedPeers[trustedIndex] = {
          ...this.state.trustedPeers[trustedIndex],
          name: entry.name,
          address: entry.address,
          listenPort: entry.listenPort,
          lastSeenAt: new Date().toISOString()
        };
        this.persistState();
        if (this.syncOutbox.some((t) => !t.done && t.peerId === peerId)) {
          setImmediate(() => this.drainSyncOutbox().catch(() => {}));
        }
      }
    });

    socket.bind(DISCOVERY_PORT, () => {
      try {
        socket.setBroadcast(true);
      } catch {
        // Ignore broadcast capability errors.
      }
      this.broadcastHello();
    });

    this.discoverySocket = socket;
    this.discoveryRunning = true;
    this.discoveryTimer = setInterval(() => {
      this.pruneDiscovered();
      this.broadcastHello();
      this.pruneInvites();
    }, DISCOVERY_INTERVAL_MS);

    return true;
  }

  stopDiscovery() {
    if (!this.discoveryRunning) {
      return true;
    }

    this.discoveryRunning = false;
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }

    if (this.discoverySocket) {
      try {
        this.discoverySocket.close();
      } catch {
        // Ignore close failures.
      }
      this.discoverySocket = null;
    }

    return true;
  }

  pruneDiscovered() {
    const now = Date.now();
    for (const [peerId, peer] of this.discoveredPeers.entries()) {
      if ((now - Number(peer.updatedAt || 0)) > DISCOVERY_STALE_MS) {
        this.discoveredPeers.delete(peerId);
      }
    }
  }

  pruneInvites() {
    const now = Date.now();
    for (const [inviteId, invite] of this.pendingInvites.entries()) {
      if (invite.used || now > invite.expiresAt) {
        this.pendingInvites.delete(inviteId);
      }
    }
  }

  broadcastHello() {
    if (!this.discoverySocket) {
      return;
    }

    const payload = Buffer.from(JSON.stringify({
      type: "hello",
      peerId: this.state.deviceId,
      name: this.state.deviceName,
      listenPort: this.listenPort,
      timestamp: Date.now()
    }));

    try {
      this.discoverySocket.send(payload, 0, payload.length, DISCOVERY_PORT, "255.255.255.255");
      this.discoverySocket.send(payload, 0, payload.length, DISCOVERY_PORT, "127.0.0.1");
    } catch {
      // Ignore transient UDP failures.
    }
  }

  startPairServer() {
    if (this.pairServer) {
      return;
    }

    const server = net.createServer((socket) => {
      socket.setEncoding("utf8");
      socket.setTimeout(SOCKET_TIMEOUT_MS);

      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += String(chunk || "");
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          this.handlePairMessage(socket, line);
          newlineIndex = buffer.indexOf("\n");
        }
      });

      socket.on("timeout", () => {
        socket.end();
      });
      socket.on("error", () => {
        socket.destroy();
      });
    });

    server.listen(0, "0.0.0.0", () => {
      const address = server.address();
      this.listenPort = address && typeof address !== "string" ? address.port : 0;
      this.logger.log(`[p2p] live server listening on ${this.listenPort}`);
    });

    this.pairServer = server;
  }

  handlePairMessage(socket, line) {
    const message = safeJsonParse(line);
    if (!message || typeof message !== "object") {
      socket.write(`${JSON.stringify({ ok: false, error: "Invalid payload" })}\n`);
      socket.end();
      return;
    }

    if (message.type === "ping") {
      socket.write(`${JSON.stringify({
        ok: true,
        type: "pong",
        peerId: this.state.deviceId,
        name: this.state.deviceName,
        listenPort: this.listenPort
      })}\n`);
      socket.end();
      return;
    }

    if (message.type === "pair-request") {
      const code = String(message.code || "").trim();
      const fromPeerId = String(message.fromPeerId || "").trim();
      const fromName = String(message.fromName || "Unknown peer").trim() || "Unknown peer";
      const fromListenPort = Number(message.fromListenPort) || 0;
      const reauth = Boolean(message.reauth);

      if (this.state.revokedPeers[fromPeerId] && !reauth) {
        socket.write(`${JSON.stringify({ ok: false, error: "Peer was previously removed. Re-auth confirmation is required." })}\n`);
        socket.end();
        return;
      }

      const invite = Array.from(this.pendingInvites.values()).find((entry) => (
        !entry.used
        && Date.now() <= entry.expiresAt
        && entry.code === code
        && (!entry.targetPeerId || entry.targetPeerId === fromPeerId)
      ));

      if (!invite) {
        socket.write(`${JSON.stringify({ ok: false, error: "Invite code invalid or expired." })}\n`);
        socket.end();
        return;
      }

      invite.used = true;
      invite.usedAt = Date.now();
      this.upsertTrustedPeer({
        peerId: fromPeerId,
        name: fromName,
        address: normalizeAddress(socket.remoteAddress),
        listenPort: fromListenPort,
        workspaceKey: ensureWorkspaceKey(invite.workspaceKey),
        pairedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      });

      if (this.onPeerTrusted) {
        setImmediate(() => this.onPeerTrusted(fromPeerId));
      }

      socket.write(`${JSON.stringify({
        ok: true,
        peerId: this.state.deviceId,
        name: this.state.deviceName,
        listenPort: this.listenPort,
        workspaceKey: ensureWorkspaceKey(invite.workspaceKey),
        pairedAt: new Date().toISOString()
      })}\n`);
      socket.end();
      return;
    }

    if (message.type === "sync-event") {
      const fromPeerId = String(message.fromPeerId || "").trim();
      const eventId = String(message.eventId || "").trim();
      const counter = Number(message.counter) || 0;
      if (!fromPeerId || !eventId) {
        socket.write(`${JSON.stringify({ ok: false, error: "Sync event metadata missing." })}\n`);
        socket.end();
        return;
      }

      if (this.receivedEventIds.has(eventId)) {
        socket.write(`${JSON.stringify({ ok: true, duplicate: true })}\n`);
        socket.end();
        return;
      }

      const trustedPeer = this.state.trustedPeers.find((entry) => entry.peerId === fromPeerId);
      if (!trustedPeer || !trustedPeer.workspaceKey) {
        socket.write(`${JSON.stringify({ ok: false, error: "Peer not trusted for sync." })}\n`);
        socket.end();
        return;
      }

      if (this.isKeyExpired(trustedPeer)) {
        socket.write(`${JSON.stringify({ ok: false, error: "Workspace key expired. Re-pair or rotate keys to continue sync." })}\n`);
        socket.end();
        return;
      }

      const lastCounter = Number(this.incomingSyncCounters.get(fromPeerId) || 0);
      if (counter > 0 && counter <= lastCounter) {
        socket.write(`${JSON.stringify({ ok: true, duplicate: true, staleCounter: true })}\n`);
        socket.end();
        return;
      }

      let decrypted = null;
      try {
        decrypted = decryptWithWorkspaceKey(trustedPeer.workspaceKey, message.encrypted);
      } catch {
        decrypted = null;
      }
      if (!decrypted || typeof decrypted !== "object") {
        socket.write(`${JSON.stringify({ ok: false, error: "Unable to decrypt sync payload." })}\n`);
        socket.end();
        return;
      }

      this.receivedEventIds.add(eventId);
      if (counter > 0) {
        this.incomingSyncCounters.set(fromPeerId, counter);
        this.state.incomingSyncCounters = Object.fromEntries(this.incomingSyncCounters);
        this.persistState();
      }
      if (this.receivedEventIds.size > 2000) {
        const ids = Array.from(this.receivedEventIds);
        this.receivedEventIds = new Set(ids.slice(ids.length - 1000));
      }

      if (this.onSyncEvent) {
        Promise.resolve(this.onSyncEvent({
          peerId: fromPeerId,
          peerName: trustedPeer.name,
          event: decrypted
        })).catch((error) => {
          this.logger.error("[p2p] sync apply callback failed", error);
        });
      }

      socket.write(`${JSON.stringify({ ok: true })}\n`);
      socket.end();
      return;
    }

    if (message.type === "rekey-request") {
      const fromPeerId = String(message.fromPeerId || "").trim();
      const trustedPeer = this.state.trustedPeers.find((entry) => entry.peerId === fromPeerId);
      if (!trustedPeer || !trustedPeer.workspaceKey) {
        socket.write(`${JSON.stringify({ ok: false, error: "Peer not trusted for rekey." })}\n`);
        socket.end();
        return;
      }

      if (this.isKeyExpired(trustedPeer)) {
        socket.write(`${JSON.stringify({ ok: false, error: "Workspace key expired. Re-auth is required before rekey." })}\n`);
        socket.end();
        return;
      }

      let decrypted = null;
      try {
        decrypted = decryptWithWorkspaceKey(trustedPeer.workspaceKey, message.encrypted);
      } catch {
        decrypted = null;
      }

      const nextWorkspaceKey = ensureWorkspaceKey(decrypted?.newWorkspaceKey);
      if (!decrypted || !nextWorkspaceKey) {
        socket.write(`${JSON.stringify({ ok: false, error: "Invalid rekey payload." })}\n`);
        socket.end();
        return;
      }

      this.upsertTrustedPeer({
        ...trustedPeer,
        workspaceKey: nextWorkspaceKey,
        lastSeenAt: new Date().toISOString()
      });

      socket.write(`${JSON.stringify({ ok: true })}\n`);
      socket.end();
      return;
    }

    socket.write(`${JSON.stringify({ ok: false, error: "Unsupported message type." })}\n`);
    socket.end();
  }

  async requestPeer({ address, listenPort, payload }) {
    const targetAddress = normalizeAddress(address);
    const targetPort = Number(listenPort) || 0;
    if (!targetAddress || !targetPort) {
      throw new Error("Peer address and port are required.");
    }

    return await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: targetAddress, port: targetPort });
      let buffer = "";
      let done = false;

      const finalize = (fn, value) => {
        if (done) return;
        done = true;
        try {
          socket.end();
        } catch {
          // Ignore close errors.
        }
        fn(value);
      };

      socket.setEncoding("utf8");
      socket.setTimeout(SOCKET_TIMEOUT_MS);

      socket.on("connect", () => {
        socket.write(`${JSON.stringify(payload)}\n`);
      });

      socket.on("data", (chunk) => {
        buffer += String(chunk || "");
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) return;
        const line = buffer.slice(0, newlineIndex).trim();
        const parsed = safeJsonParse(line);
        if (!parsed) {
          finalize(reject, new Error("Invalid response from peer."));
          return;
        }
        finalize(resolve, parsed);
      });

      socket.on("timeout", () => {
        finalize(reject, new Error("Peer request timed out."));
      });

      socket.on("error", (error) => {
        finalize(reject, new Error(error?.message || "Peer connection failed."));
      });
    });
  }

  async manualConnect({ address, listenPort }) {
    const response = await this.requestPeer({
      address,
      listenPort,
      payload: { type: "ping" }
    });

    if (!response?.ok || response?.type !== "pong") {
      throw new Error(response?.error || "Peer did not respond to ping.");
    }

    const peerId = String(response.peerId || "").trim();
    if (!peerId) {
      throw new Error("Peer id missing in response.");
    }

    this.discoveredPeers.set(peerId, {
      peerId,
      name: String(response.name || "Unknown peer"),
      address: normalizeAddress(address),
      listenPort: Number(response.listenPort) || Number(listenPort) || 0,
      updatedAt: Date.now(),
      discoveredAt: Date.now(),
      trusted: this.state.trustedPeers.some((peer) => peer.peerId === peerId)
    });

    if (this.syncOutbox.some((t) => !t.done && t.peerId === peerId)) {
      setImmediate(() => this.drainSyncOutbox().catch(() => {}));
    }

    return {
      ok: true,
      peerId,
      name: String(response.name || "Unknown peer")
    };
  }

  createInvite({ targetPeerId }) {
    const peerId = String(targetPeerId || "").trim();
    const inviteId = randomHex(6);
    const invite = {
      inviteId,
      code: createReadableInviteCode(),
      targetPeerId: peerId || null,
      workspaceKey: randomHex(32),
      createdAt: Date.now(),
      expiresAt: Date.now() + INVITE_TTL_MS,
      used: false
    };

    this.pendingInvites.set(inviteId, invite);

    return {
      inviteId,
      code: invite.code,
      targetPeerId: invite.targetPeerId,
      expiresAt: new Date(invite.expiresAt).toISOString()
    };
  }

  async pairWithCode({ peerId, code, reauth = false }) {
    const targetPeerId = String(peerId || "").trim();
    const inviteCode = String(code || "").trim();
    if (!targetPeerId) {
      throw new Error("Peer id is required.");
    }
    if (!inviteCode) {
      throw new Error("Pairing code is required.");
    }

    if (this.state.revokedPeers[targetPeerId] && !reauth) {
      throw new Error("Peer was previously removed. Confirm re-auth to pair again.");
    }

    const peer = this.discoveredPeers.get(targetPeerId)
      || this.state.trustedPeers.find((entry) => entry.peerId === targetPeerId);

    if (!peer) {
      throw new Error("Peer not found. Discover or connect the peer first.");
    }

    const response = await this.requestPeer({
      address: peer.address,
      listenPort: peer.listenPort,
      payload: {
        type: "pair-request",
        fromPeerId: this.state.deviceId,
        fromName: this.state.deviceName,
        fromListenPort: this.listenPort,
        code: inviteCode,
        reauth: Boolean(reauth)
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Pairing failed.");
    }

    this.upsertTrustedPeer({
      peerId: targetPeerId,
      name: String(peer.name || response.name || "Unknown peer"),
      address: normalizeAddress(peer.address),
      listenPort: Number(response.listenPort || peer.listenPort) || 0,
      workspaceKey: ensureWorkspaceKey(response.workspaceKey),
      pairedAt: response.pairedAt || new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    });

    const discovered = this.discoveredPeers.get(targetPeerId);
    if (discovered) {
      discovered.trusted = true;
      discovered.listenPort = Number(response.listenPort || discovered.listenPort) || 0;
      discovered.updatedAt = Date.now();
      this.discoveredPeers.set(targetPeerId, discovered);
    }

    if (this.onPeerTrusted) {
      setImmediate(() => this.onPeerTrusted(targetPeerId));
    }

    return {
      ok: true,
      peerId: targetPeerId,
      name: String(peer.name || response.name || "Unknown peer")
    };
  }

  removeTrustedPeer(peerId) {
    const targetPeerId = String(peerId || "").trim();
    this.state.trustedPeers = this.state.trustedPeers.filter((peer) => peer.peerId !== targetPeerId);
    if (targetPeerId) {
      this.state.revokedPeers[targetPeerId] = new Date().toISOString();
      this.incomingSyncCounters.delete(targetPeerId);
      this.outgoingSyncCounters.delete(targetPeerId);
      this.peerSyncMeta.delete(targetPeerId);
      this.syncOutbox = this.syncOutbox.filter((task) => task.peerId !== targetPeerId);
      this.state.incomingSyncCounters = Object.fromEntries(this.incomingSyncCounters);
    }
    this.persistState();
    this.persistOutbox();

    const discovered = this.discoveredPeers.get(targetPeerId);
    if (discovered) {
      discovered.trusted = false;
      this.discoveredPeers.set(targetPeerId, discovered);
    }

    return true;
  }

  queueSyncDelivery(peer, syncEvent) {
    const counter = Number(this.outgoingSyncCounters.get(peer.peerId) || 0) + 1;
    this.outgoingSyncCounters.set(peer.peerId, counter);

    this.syncOutbox.push({
      id: randomHex(8),
      peerId: peer.peerId,
      eventId: syncEvent.eventId,
      syncEvent,
      counter,
      attempt: 0,
      nextAttemptAt: Date.now(),
      lastError: "",
      done: false
    });

    this.syncStats.queued += 1;
    this.persistOutbox();
  }

  queueSyncToPeer(peerId, event) {
    const peer = this.state.trustedPeers.find((p) => p.peerId === peerId);
    if (!peer) {
      return false;
    }
    this.queueSyncDelivery(peer, { ...event, eventId: event.eventId || randomHex(10) });
    return true;
  }

  async drainSyncOutbox() {
    if (!this.syncOutbox.length) {
      return;
    }

    const now = Date.now();
    for (const task of this.syncOutbox) {
      if (task.attempt >= SYNC_MAX_ATTEMPTS) {
        continue;
      }
      if (task.nextAttemptAt > now) {
        continue;
      }

      try {
        const currentPeer = this.state.trustedPeers.find((p) => p.peerId === task.peerId);
        if (!currentPeer || !currentPeer.workspaceKey || !currentPeer.listenPort) {
          task.attempt += 1;
          task.lastError = "Peer not reachable yet";
          const waitMs = Math.min(30000, 2000 * Math.pow(2, task.attempt));
          task.nextAttemptAt = Date.now() + waitMs;
          continue;
        }

        if (this.isKeyExpired(currentPeer)) {
          task.done = true;
          task.attempt = SYNC_MAX_ATTEMPTS;
          this.syncStats.failed += 1;
          this.syncStats.dropped += 1;
          this.syncStats.lastErrorAt = new Date().toISOString();
          this.syncStats.lastError = "Workspace key expired for peer.";
          this.peerSyncMeta.set(task.peerId, {
            lastAckAt: this.peerSyncMeta.get(task.peerId)?.lastAckAt || null,
            lastErrorAt: this.syncStats.lastErrorAt,
            lastError: this.syncStats.lastError,
            lastCounter: Number(this.peerSyncMeta.get(task.peerId)?.lastCounter || 0)
          });
          continue;
        }

        const encrypted = encryptWithWorkspaceKey(currentPeer.workspaceKey, task.syncEvent);
        const response = await this.requestPeer({
          address: currentPeer.address,
          listenPort: currentPeer.listenPort,
          payload: {
            type: "sync-event",
            fromPeerId: this.state.deviceId,
            eventId: task.eventId,
            counter: task.counter,
            encrypted
          }
        });

        task.attempt += 1;
        this.syncStats.sent += 1;

        if (response?.ok) {
          this.syncStats.acked += 1;
          this.syncStats.lastAckAt = new Date().toISOString();
          this.peerSyncMeta.set(task.peerId, {
            lastAckAt: this.syncStats.lastAckAt,
            lastErrorAt: null,
            lastError: "",
            lastCounter: task.counter
          });
          task.attempt = SYNC_MAX_ATTEMPTS;
          task.done = true;
          continue;
        }

        const errorMessage = String(response?.error || "Peer rejected sync event.");
        throw new Error(errorMessage);
      } catch (error) {
        task.attempt += 1;
        this.syncStats.failed += 1;
        this.syncStats.lastErrorAt = new Date().toISOString();
        this.syncStats.lastError = String(error?.message || "Sync delivery failed.");
        this.peerSyncMeta.set(task.peerId, {
          lastAckAt: this.peerSyncMeta.get(task.peerId)?.lastAckAt || null,
          lastErrorAt: this.syncStats.lastErrorAt,
          lastError: this.syncStats.lastError,
          lastCounter: Number(this.peerSyncMeta.get(task.peerId)?.lastCounter || 0)
        });

        if (task.attempt >= SYNC_MAX_ATTEMPTS) {
          task.done = true;
          this.syncStats.dropped += 1;
          continue;
        }

        this.syncStats.retried += 1;
        const backoffMs = Math.min(15000, 1000 * Math.pow(2, task.attempt));
        task.nextAttemptAt = Date.now() + backoffMs;
        task.lastError = String(error?.message || "Retry scheduled");
      }
    }

    this.syncOutbox = this.syncOutbox.filter((task) => !task.done);
    this.persistOutbox();
    this.recordSyncTrendSample();
  }

  async rotateWorkspaceKeys(peerId) {
    const targetPeerId = String(peerId || "").trim();
    const peers = targetPeerId
      ? this.state.trustedPeers.filter((peer) => peer.peerId === targetPeerId)
      : [...this.state.trustedPeers];

    if (!peers.length) {
      throw new Error("No trusted peer found for key rotation.");
    }

    const results = [];
    for (const peer of peers) {
      const oldKey = ensureWorkspaceKey(peer.workspaceKey);
      const newKey = randomHex(32);
      const encrypted = encryptWithWorkspaceKey(oldKey, {
        type: "rekey",
        fromPeerId: this.state.deviceId,
        newWorkspaceKey: newKey,
        createdAt: new Date().toISOString()
      });

      const response = await this.requestPeer({
        address: peer.address,
        listenPort: peer.listenPort,
        payload: {
          type: "rekey-request",
          fromPeerId: this.state.deviceId,
          encrypted
        }
      });

      if (!response?.ok) {
        throw new Error(response?.error || `Failed to rotate key for ${peer.name}`);
      }

      this.upsertTrustedPeer({
        ...peer,
        workspaceKey: newKey,
        lastSeenAt: new Date().toISOString()
      });

      results.push({ peerId: peer.peerId, name: peer.name });
    }

    return {
      rotated: results.length,
      peers: results
    };
  }

  async runSyncSelfTest() {
    const startedAt = new Date().toISOString();
    const event = {
      eventId: randomHex(8),
      peerId: this.state.deviceId,
      timestamp: startedAt,
      docId: "health/self-test.md",
      op: "update",
      baseHash: "base",
      newHash: "next",
      payload: {
        relativePath: "health/self-test.md",
        content: "self-test",
        baseContent: "base",
        delta: { rawNotes: "self-test" }
      }
    };

    const workspaceKey = randomHex(32);
    const encrypted = encryptWithWorkspaceKey(workspaceKey, event);
    const decrypted = decryptWithWorkspaceKey(workspaceKey, encrypted);
    const cryptoOk = Boolean(decrypted && decrypted.eventId === event.eventId && decrypted.docId === event.docId);

    await this.drainSyncOutbox();

    return {
      ok: cryptoOk,
      startedAt,
      trustedPeers: this.state.trustedPeers.length,
      outboxCount: this.syncOutbox.length,
      cryptoRoundTrip: cryptoOk ? "pass" : "fail"
    };
  }

  async broadcastSyncEvent(event) {
    const syncEvent = {
      eventId: String(event?.eventId || randomHex(10)),
      peerId: this.state.deviceId,
      timestamp: event?.timestamp || new Date().toISOString(),
      docId: String(event?.docId || "").trim(),
      op: String(event?.op || "").trim(),
      baseHash: event?.baseHash ? String(event.baseHash) : null,
      newHash: event?.newHash ? String(event.newHash) : null,
      payload: event?.payload && typeof event.payload === "object" ? event.payload : {}
    };

    if (!syncEvent.docId || !syncEvent.op) {
      throw new Error("Sync event requires docId and op.");
    }

    const trustedPeers = this.state.trustedPeers
      .filter((peer) => peer.peerId && peer.listenPort && peer.address && peer.workspaceKey);

    trustedPeers.forEach((peer) => this.queueSyncDelivery(peer, syncEvent));
    await this.drainSyncOutbox();

    return {
      eventId: syncEvent.eventId,
      attempted: trustedPeers.length,
      delivered: trustedPeers.filter((peer) => {
        const meta = this.peerSyncMeta.get(peer.peerId);
        return meta && meta.lastCounter === this.outgoingSyncCounters.get(peer.peerId);
      }).length
    };
  }

  upsertTrustedPeer(peer) {
    const existingIndex = this.state.trustedPeers.findIndex((entry) => entry.peerId === peer.peerId);
    const existing = existingIndex >= 0 ? this.state.trustedPeers[existingIndex] : null;
    const workspaceKey = ensureWorkspaceKey(peer.workspaceKey);
    const nowIso = new Date().toISOString();
    const keyChanged = !existing || existing.workspaceKey !== workspaceKey;
    const issuedAtRaw = keyChanged
      ? nowIso
      : String(peer.keyIssuedAt || existing?.keyIssuedAt || existing?.pairedAt || nowIso);
    const issuedAtTs = Date.parse(issuedAtRaw);
    const safeIssuedAtTs = Number.isFinite(issuedAtTs) ? issuedAtTs : Date.now();
    const keyIssuedAt = new Date(safeIssuedAtTs).toISOString();
    const fallbackExpiresAt = new Date(safeIssuedAtTs + daysToMs(this.state.keyPolicyDays)).toISOString();

    const next = {
      peerId: String(peer.peerId || ""),
      name: String(peer.name || "Unknown peer"),
      address: normalizeAddress(peer.address),
      listenPort: Number(peer.listenPort) || 0,
      workspaceKey,
      pairedAt: String(peer.pairedAt || new Date().toISOString()),
      lastSeenAt: String(peer.lastSeenAt || new Date().toISOString()),
      keyIssuedAt,
      keyExpiresAt: keyChanged
        ? fallbackExpiresAt
        : String(peer.keyExpiresAt || existing?.keyExpiresAt || fallbackExpiresAt)
    };

    if (existingIndex >= 0) {
      this.state.trustedPeers[existingIndex] = {
        ...this.state.trustedPeers[existingIndex],
        ...next
      };
    } else {
      this.state.trustedPeers.push(next);
    }

    delete this.state.revokedPeers[next.peerId];

    this.persistState();
  }

  getStatus() {
    this.pruneDiscovered();
    this.pruneInvites();

    const discoveredPeers = Array.from(this.discoveredPeers.values())
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map((peer) => ({
        peerId: peer.peerId,
        name: peer.name,
        address: peer.address,
        listenPort: peer.listenPort,
        discoveredAt: new Date(peer.discoveredAt).toISOString(),
        lastSeenAt: new Date(peer.updatedAt).toISOString(),
        trusted: Boolean(peer.trusted)
      }));

    const trustedPeers = [...this.state.trustedPeers]
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));

    const trustedPeerStatus = trustedPeers.map((peer) => ({
      peerId: peer.peerId,
      name: peer.name,
      address: peer.address,
      listenPort: peer.listenPort,
      pairedAt: peer.pairedAt,
      lastSeenAt: peer.lastSeenAt,
      keyIssuedAt: peer.keyIssuedAt || null,
      keyExpiresAt: peer.keyExpiresAt || null,
      keyExpired: this.isKeyExpired(peer)
    }));

    const activeInvites = Array.from(this.pendingInvites.values())
      .filter((invite) => !invite.used && Date.now() <= invite.expiresAt)
      .map((invite) => ({
        inviteId: invite.inviteId,
        code: invite.code,
        targetPeerId: invite.targetPeerId,
        expiresAt: new Date(invite.expiresAt).toISOString()
      }));

    const outbox = this.syncOutbox.map((task) => ({
      id: task.id,
      peerId: task.peerId,
      eventId: task.eventId,
      attempt: task.attempt,
      nextAttemptAt: new Date(task.nextAttemptAt).toISOString(),
      lastError: task.lastError || ""
    }));

    const peerSyncMeta = Array.from(this.peerSyncMeta.entries()).map(([peerId, meta]) => ({
      peerId,
      lastAckAt: meta?.lastAckAt || null,
      lastErrorAt: meta?.lastErrorAt || null,
      lastError: meta?.lastError || "",
      lastCounter: Number(meta?.lastCounter || 0)
    }));

    this.recordSyncTrendSample();

    const syncTrend = this.syncTrend.slice(-30);
    const nowMs = Date.now();
    const keyExpiryWarningMs = 3 * 24 * 60 * 60 * 1000;
    const keySecurity = {
      policyDays: this.state.keyPolicyDays,
      revokedPeerCount: Object.keys(this.state.revokedPeers || {}).length,
      expiringSoonCount: trustedPeerStatus.filter((peer) => {
        const expiresAtMs = Date.parse(String(peer.keyExpiresAt || ""));
        return Number.isFinite(expiresAtMs) && !peer.keyExpired && (expiresAtMs - nowMs) <= keyExpiryWarningMs;
      }).length,
      expiredCount: trustedPeerStatus.filter((peer) => peer.keyExpired).length
    };

    return {
      available: true,
      source: this.statePath,
      generatedAt: new Date().toISOString(),
      mode: "live",
      self: {
        peerId: this.state.deviceId,
        name: this.state.deviceName,
        listenPort: this.listenPort
      },
      discovery: {
        running: this.discoveryRunning,
        port: DISCOVERY_PORT
      },
      peerCount: discoveredPeers.length,
      trustedLinkCount: trustedPeers.length,
      workspaceKeyCount: trustedPeers.filter((peer) => peer.workspaceKey).length,
      peers: trustedPeerStatus.map((peer) => ({
        name: peer.name,
        peerId: peer.peerId,
        trustedPeerCount: 0,
        workspaceKeyCount: 1,
        inboxCount: 0
      })),
      discoveredPeers,
      trustedPeers: trustedPeerStatus,
      invites: activeInvites,
      sync: {
        outboxCount: outbox.length,
        stats: { ...this.syncStats },
        outbox,
        peerMeta: peerSyncMeta,
        trend: syncTrend
      },
      security: keySecurity,
      keyPolicyDays: this.state.keyPolicyDays
    };
  }
}

module.exports = {
  P2PLiveService
};
