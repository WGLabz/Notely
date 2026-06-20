import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { P2PLiveService } from "./p2pLive.cjs";

function createTempStorageDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "notely-p2p-live-test-"));
}

describe("P2PLiveService hardening", () => {
  const dirsToCleanup = [];

  afterEach(() => {
    while (dirsToCleanup.length) {
      const dir = dirsToCleanup.pop();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors in tests.
      }
    }
  });

  it("requires re-auth when pairing a previously removed peer", async () => {
    const storageDir = createTempStorageDir();
    dirsToCleanup.push(storageDir);

    const service = new P2PLiveService({ storageDir });
    service.init();

    service.discoveredPeers.set("peer-b", {
      peerId: "peer-b",
      name: "Peer B",
      address: "127.0.0.1",
      listenPort: 47801,
      updatedAt: Date.now(),
      discoveredAt: Date.now(),
      trusted: false,
    });

    service.upsertTrustedPeer({
      peerId: "peer-b",
      name: "Peer B",
      address: "127.0.0.1",
      listenPort: 47801,
      workspaceKey: "a".repeat(64),
      pairedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });

    service.removeTrustedPeer("peer-b");

    service.requestPeer = async () => ({
      ok: true,
      name: "Peer B",
      listenPort: 47801,
      workspaceKey: "b".repeat(64),
      pairedAt: new Date().toISOString(),
    });

    await expect(
      service.pairWithCode({ peerId: "peer-b", code: "amber-lotus-42-nova" })
    ).rejects.toThrow(/re-auth/i);

    await expect(
      service.pairWithCode({ peerId: "peer-b", code: "amber-lotus-42-nova", reauth: true })
    ).resolves.toMatchObject({ ok: true, peerId: "peer-b" });

    service.shutdown();
  });

  it("records sync trend points in status snapshots", async () => {
    const storageDir = createTempStorageDir();
    dirsToCleanup.push(storageDir);

    const service = new P2PLiveService({ storageDir });
    service.init();

    service.upsertTrustedPeer({
      peerId: "peer-c",
      name: "Peer C",
      address: "127.0.0.1",
      listenPort: 47802,
      workspaceKey: "c".repeat(64),
      pairedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });

    service.requestPeer = async () => ({ ok: true });

    const queued = service.queueSyncToPeer("peer-c", {
      eventId: "evt-1",
      timestamp: new Date().toISOString(),
      docId: "notes/test.md",
      op: "update",
      baseHash: null,
      newHash: "hash-1",
      payload: {
        relativePath: "notes/test.md",
        content: "hello",
      },
    });

    expect(queued).toBe(true);

    await service.drainSyncOutbox();

    const status = service.getStatus();
    expect(status.sync.stats.acked).toBeGreaterThan(0);
    expect(Array.isArray(status.sync.trend)).toBe(true);
    expect(status.sync.trend.length).toBeGreaterThan(0);

    service.shutdown();
  });
});
