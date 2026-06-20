const fs = require("node:fs");
const path = require("node:path");

const { generatePairCode } = require("./crypto.cjs");
const { assert } = require("./errors.cjs");
const { Peer } = require("./model.cjs");
const { TestRunner } = require("./runner.cjs");
const {
  STORAGE_ROOT,
  readJson,
  writeJson,
  cleanupHarnessStorage
} = require("./storage.cjs");

async function runHarness() {
  cleanupHarnessStorage();

  const runner = new TestRunner();
  const alice = new Peer("alice-editor");
  const bob = new Peer("bob-peer");
  const charlie = new Peer("charlie-untrusted");
  const peers = [alice, bob, charlie];

  let sessionId;
  let workspace;

  await runner.run("discover peers on one machine", () => {
    const discovered = alice.discoverPeers(peers);
    assert(discovered.length === 2, "Alice should discover Bob and Charlie.");
    assert(discovered.some((item) => item.name === "bob-peer"), "Bob should be discoverable.");
  });

  await runner.run("pair peers using human-readable code", () => {
    const code = generatePairCode();
    sessionId = alice.pairWith(bob, code);

    assert(Boolean(sessionId), "Session id should be generated.");
    assert(alice.trustedPeers.has(bob.peerId), "Alice should trust Bob after pairing.");
    assert(bob.trustedPeers.has(alice.peerId), "Bob should trust Alice after pairing.");
  });

  await runner.run("reject workspace sharing with untrusted peer", () => {
    workspace = alice.createWorkspace("engineering-notes");

    let rejected = false;
    try {
      alice.shareWorkspaceKey(workspace, charlie);
    } catch (error) {
      rejected = /untrusted/i.test(error.message);
    }

    assert(rejected, "Sharing with untrusted peer must fail.");
  });

  await runner.run("share workspace key with trusted peer", () => {
    const shared = alice.shareWorkspaceKey(workspace, bob);
    assert(shared, "Workspace key sharing should succeed.");
    assert(bob.workspaceKeys.has(workspace.id), "Bob should store workspace key.");
  });

  await runner.run("encrypt and sync workspace message", () => {
    const packet = alice.encryptWorkspaceMessage(workspace.id, "note: setup redis cache and ttl");
    const plaintext = bob.decryptWorkspaceMessage(packet);
    assert(plaintext.includes("redis cache"), "Bob should decrypt synced note content.");
  });

  await runner.run("rotate workspace key and re-share", () => {
    workspace.rotateKey();
    alice.updateWorkspaceKey(workspace);

    const stalePacket = alice.encryptWorkspaceMessage(workspace.id, "post-rotation note");
    let staleRejected = false;
    try {
      bob.decryptWorkspaceMessage(stalePacket);
    } catch (error) {
      staleRejected = /version mismatch/i.test(error.message);
    }
    assert(staleRejected, "Bob should reject data encrypted with unknown key version.");

    alice.shareWorkspaceKey(workspace, bob);
    const freshPacket = alice.encryptWorkspaceMessage(workspace.id, "fresh message after key rotation");
    const freshPlaintext = bob.decryptWorkspaceMessage(freshPacket);
    assert(/rotation/.test(freshPlaintext), "Bob should decrypt message after key re-share.");
  });

  await runner.run("revoke peer workspace access", () => {
    alice.revokeWorkspace(workspace, bob);

    let denied = false;
    try {
      bob.encryptWorkspaceMessage(workspace.id, "should fail");
    } catch (error) {
      denied = /does not have workspace key/i.test(error.message);
    }

    assert(denied, "Revoked peer should lose workspace encryption key.");
  });

  runner.finish();

  const reportPath = path.join(STORAGE_ROOT, "summary.json");
  const persisted = fs.readdirSync(STORAGE_ROOT)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => readJson(path.join(STORAGE_ROOT, fileName)));

  writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    sessionId,
    workspaceId: workspace?.id || null,
    peers: persisted
  });

  console.log(`\nHarness artifacts written to ${STORAGE_ROOT}`);
}

module.exports = {
  runHarness
};
