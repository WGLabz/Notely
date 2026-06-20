const path = require("node:path");

const {
  randomHex,
  randomBytes,
  b64,
  unb64,
  stablePairId,
  deriveSessionKey,
  makePairProof,
  encryptAesGcm,
  decryptAesGcm
} = require("./crypto.cjs");
const { HarnessError } = require("./errors.cjs");
const { STORAGE_ROOT, ensureDir, writeJson } = require("./storage.cjs");

class Workspace {
  constructor({ id, name, ownerPeerId, key, keyVersion = 1 }) {
    this.id = id;
    this.name = name;
    this.ownerPeerId = ownerPeerId;
    this.currentKey = key;
    this.keyVersion = keyVersion;
    this.members = new Map();
    this.log = [];
  }

  grant(peerId, role = "editor") {
    this.members.set(peerId, role);
  }

  revoke(peerId) {
    this.members.delete(peerId);
  }

  rotateKey() {
    this.currentKey = randomBytes(32);
    this.keyVersion += 1;
  }
}

class Peer {
  constructor(name) {
    this.name = name;
    this.peerId = randomHex(8);
    this.identitySecret = randomHex(32);
    this.trustedPeers = new Set();
    this.sessionKeys = new Map();
    this.workspaceKeys = new Map();
    this.inbox = [];

    ensureDir(STORAGE_ROOT);
    this.storagePath = path.join(STORAGE_ROOT, `${this.name}-${this.peerId}.json`);
    this.persist();
  }

  persist() {
    const data = {
      name: this.name,
      peerId: this.peerId,
      trustedPeers: Array.from(this.trustedPeers),
      workspaceKeys: Array.from(this.workspaceKeys.entries()).map(([workspaceId, value]) => ({
        workspaceId,
        keyVersion: value.keyVersion,
        key: b64(value.key)
      })),
      inboxCount: this.inbox.length
    };
    writeJson(this.storagePath, data);
  }

  discoverPeers(allPeers) {
    return allPeers
      .filter((peer) => peer.peerId !== this.peerId)
      .map((peer) => ({
        peerId: peer.peerId,
        name: peer.name,
        trusted: this.trustedPeers.has(peer.peerId)
      }));
  }

  pairWith(otherPeer, code) {
    const initiatorNonce = randomBytes(16);
    const responderNonce = randomBytes(16);

    const aKey = deriveSessionKey({
      code,
      initiatorId: this.peerId,
      responderId: otherPeer.peerId,
      initiatorNonce,
      responderNonce
    });

    const bKey = deriveSessionKey({
      code,
      initiatorId: this.peerId,
      responderId: otherPeer.peerId,
      initiatorNonce,
      responderNonce
    });

    const transcript = `pair:${stablePairId(this.peerId, otherPeer.peerId)}`;
    if (makePairProof(aKey, transcript) !== makePairProof(bKey, transcript)) {
      throw new HarnessError("Pairing proof mismatch. Verify both peers entered the same code.");
    }

    this.trustedPeers.add(otherPeer.peerId);
    otherPeer.trustedPeers.add(this.peerId);

    const sessionId = stablePairId(this.peerId, otherPeer.peerId);
    this.sessionKeys.set(sessionId, aKey);
    otherPeer.sessionKeys.set(sessionId, bKey);

    this.persist();
    otherPeer.persist();
    return sessionId;
  }

  getSessionKey(otherPeer) {
    const sessionId = stablePairId(this.peerId, otherPeer.peerId);
    const key = this.sessionKeys.get(sessionId);
    if (!key) {
      throw new HarnessError(`No active session for peer ${otherPeer.name}. Pair first.`);
    }
    return key;
  }

  createWorkspace(name) {
    const workspace = new Workspace({
      id: randomHex(6),
      name,
      ownerPeerId: this.peerId,
      key: randomBytes(32)
    });

    workspace.grant(this.peerId, "owner");
    this.workspaceKeys.set(workspace.id, {
      key: workspace.currentKey,
      keyVersion: workspace.keyVersion
    });
    this.persist();

    return workspace;
  }

  updateWorkspaceKey(workspace) {
    this.workspaceKeys.set(workspace.id, {
      key: workspace.currentKey,
      keyVersion: workspace.keyVersion
    });
    this.persist();
  }

  shareWorkspaceKey(workspace, otherPeer) {
    if (!this.trustedPeers.has(otherPeer.peerId)) {
      throw new HarnessError(`Cannot share workspace with untrusted peer ${otherPeer.name}.`);
    }

    const sessionKey = this.getSessionKey(otherPeer);
    const aad = `workspace:${workspace.id}:v${workspace.keyVersion}`;
    const encrypted = encryptAesGcm(sessionKey, b64(workspace.currentKey), aad);

    otherPeer.receiveWorkspaceKey({
      workspaceId: workspace.id,
      keyVersion: workspace.keyVersion,
      fromPeerId: this.peerId,
      aad,
      encrypted,
      sender: this
    });

    workspace.grant(otherPeer.peerId, "editor");
    return true;
  }

  receiveWorkspaceKey({ workspaceId, keyVersion, fromPeerId, aad, encrypted, sender }) {
    if (!this.trustedPeers.has(fromPeerId)) {
      throw new HarnessError("Rejected workspace key from untrusted peer.");
    }

    const sessionKey = this.getSessionKey(sender);
    const decoded = decryptAesGcm(sessionKey, encrypted, aad);

    this.workspaceKeys.set(workspaceId, {
      key: unb64(decoded),
      keyVersion
    });
    this.persist();
  }

  encryptWorkspaceMessage(workspaceId, message) {
    const entry = this.workspaceKeys.get(workspaceId);
    if (!entry) {
      throw new HarnessError(`Peer ${this.name} does not have workspace key for ${workspaceId}.`);
    }

    const aad = `workspace:${workspaceId}:v${entry.keyVersion}`;
    return {
      workspaceId,
      keyVersion: entry.keyVersion,
      aad,
      encrypted: encryptAesGcm(entry.key, message, aad)
    };
  }

  decryptWorkspaceMessage(packet) {
    const entry = this.workspaceKeys.get(packet.workspaceId);
    if (!entry) {
      throw new HarnessError(`Peer ${this.name} has no key for workspace ${packet.workspaceId}.`);
    }

    if (entry.keyVersion !== packet.keyVersion) {
      throw new HarnessError(
        `Workspace key version mismatch for ${this.name}. Local=${entry.keyVersion}, Incoming=${packet.keyVersion}.`
      );
    }

    const plaintext = decryptAesGcm(entry.key, packet.encrypted, packet.aad);
    this.inbox.push({ workspaceId: packet.workspaceId, plaintext });
    this.persist();
    return plaintext;
  }

  revokeWorkspace(workspace, otherPeer) {
    workspace.revoke(otherPeer.peerId);
    otherPeer.workspaceKeys.delete(workspace.id);
    otherPeer.persist();
  }
}

module.exports = {
  Workspace,
  Peer
};
