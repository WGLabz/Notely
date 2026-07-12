---
title: Peer-to-Peer Sync
description: Sync notes securely between devices using peer-to-peer pairing over local networks.
keywords: P2P, sync, peer-to-peer, discovery, invite code, conflict resolution
category: Sync
---

# P2P Sync

Notely includes peer-to-peer (P2P) sync, allowing you to replicate notes between devices directly without storing data in the cloud.

## 1. How it Works

Syncing operates over local networks:
- Devices discover each other using local broadcast protocols.
- Content is encrypted end-to-end.
- Workspace encryption keys are shared during initial pairing.

---

## 2. Pairing Devices

1. Open **P2P → P2P Status** on both devices.
2. Click **Start Discovery** to scan the local network.
3. On one device, generate an Invite Code.
4. On the second device, click **Pair with Peer** and input the code.
5. Once accepted, add the device to your **Trusted Peers** list.

---

## 3. Conflict Resolution

If a note is edited on two devices simultaneously before sync completes:
1. Notely halts automated merges for that note and flags a conflict.
2. Open the **Conflict Resolution Panel** from the P2P status bar indicator.
3. Compare the conflicting versions side-by-side.
4. Select **Keep Local**, **Keep Remote**, or **Merge Manually** to resolve.

---

## 4. Key Rotation & Security

- **Rotate Keys**: Generate new workspace encryption keys from the P2P Settings.
- **Revoke Peers**: Untrust a device at any time to block future sync requests.
