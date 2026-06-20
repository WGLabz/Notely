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
  constructor({ storageDir, logger = console }) {
    this.logger = logger;
    this.storageDir = storageDir;
    this.statePath = path.join(storageDir, "p2p-live-state.json");

    this.discoverySocket = null;
    this.discoveryTimer = null;
    this.discoveryRunning = false;

    this.pairServer = null;
    this.listenPort = 0;

    this.discoveredPeers = new Map();
    this.pendingInvites = new Map();

    this.state = {
      deviceId: randomHex(8),
      deviceName: os.hostname() || "Notely Peer",
      trustedPeers: []
    };
  }

  init() {
    ensureDir(this.storageDir);
    this.loadState();
    this.startPairServer();
  }

  shutdown() {
    this.stopDiscovery();
    if (this.pairServer) {
      try {
        this.pairServer.close();
      } catch {
        // Ignore close failures.
      }
      this.pairServer = null;
      this.listenPort = 0;
    }
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
          pairedAt: String(peer.pairedAt || new Date().toISOString()),
          lastSeenAt: String(peer.lastSeenAt || "")
        }))
        .filter((peer) => peer.peerId)
      : [];
  }

  persistState() {
    ensureDir(this.storageDir);
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
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
        pairedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      });

      socket.write(`${JSON.stringify({
        ok: true,
        peerId: this.state.deviceId,
        name: this.state.deviceName,
        listenPort: this.listenPort,
        pairedAt: new Date().toISOString()
      })}\n`);
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

  async pairWithCode({ peerId, code }) {
    const targetPeerId = String(peerId || "").trim();
    const inviteCode = String(code || "").trim();
    if (!targetPeerId) {
      throw new Error("Peer id is required.");
    }
    if (!inviteCode) {
      throw new Error("Pairing code is required.");
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
        code: inviteCode
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

    return {
      ok: true,
      peerId: targetPeerId,
      name: String(peer.name || response.name || "Unknown peer")
    };
  }

  removeTrustedPeer(peerId) {
    const targetPeerId = String(peerId || "").trim();
    this.state.trustedPeers = this.state.trustedPeers.filter((peer) => peer.peerId !== targetPeerId);
    this.persistState();

    const discovered = this.discoveredPeers.get(targetPeerId);
    if (discovered) {
      discovered.trusted = false;
      this.discoveredPeers.set(targetPeerId, discovered);
    }

    return true;
  }

  upsertTrustedPeer(peer) {
    const existingIndex = this.state.trustedPeers.findIndex((entry) => entry.peerId === peer.peerId);
    const next = {
      peerId: String(peer.peerId || ""),
      name: String(peer.name || "Unknown peer"),
      address: normalizeAddress(peer.address),
      listenPort: Number(peer.listenPort) || 0,
      pairedAt: String(peer.pairedAt || new Date().toISOString()),
      lastSeenAt: String(peer.lastSeenAt || new Date().toISOString())
    };

    if (existingIndex >= 0) {
      this.state.trustedPeers[existingIndex] = {
        ...this.state.trustedPeers[existingIndex],
        ...next
      };
    } else {
      this.state.trustedPeers.push(next);
    }

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

    const activeInvites = Array.from(this.pendingInvites.values())
      .filter((invite) => !invite.used && Date.now() <= invite.expiresAt)
      .map((invite) => ({
        inviteId: invite.inviteId,
        code: invite.code,
        targetPeerId: invite.targetPeerId,
        expiresAt: new Date(invite.expiresAt).toISOString()
      }));

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
      workspaceKeyCount: 0,
      peers: trustedPeers.map((peer) => ({
        name: peer.name,
        peerId: peer.peerId,
        trustedPeerCount: 0,
        workspaceKeyCount: 0,
        inboxCount: 0
      })),
      discoveredPeers,
      trustedPeers,
      invites: activeInvites
    };
  }
}

module.exports = {
  P2PLiveService
};
