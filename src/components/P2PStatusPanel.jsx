import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";

function formatDateTime(value) {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export function P2PStatusPanel({
  status,
  loading,
  onRefresh,
  onStartDiscovery,
  onStopDiscovery,
  onSetDeviceName,
  onCreateInvite,
  onPairWithCode,
  onManualConnect,
  onRemoveTrustedPeer,
  onRotateWorkspaceKeys,
}) {
  const [deviceNameDraft, setDeviceNameDraft] = useState("");
  const [invitePeerId, setInvitePeerId] = useState("");
  const [pairPeerId, setPairPeerId] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [manualAddress, setManualAddress] = useState("127.0.0.1");
  const [manualPort, setManualPort] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const currentStatus = status || {};
  const peers = Array.isArray(currentStatus.peers) ? currentStatus.peers : [];
  const discoveredPeers = Array.isArray(currentStatus.discoveredPeers) ? currentStatus.discoveredPeers : [];
  const trustedPeers = Array.isArray(currentStatus.trustedPeers) ? currentStatus.trustedPeers : [];
  const invites = Array.isArray(currentStatus.invites) ? currentStatus.invites : [];
  const discoveryRunning = Boolean(currentStatus?.discovery?.running);

  const sortedDiscovered = useMemo(
    () => [...discoveredPeers].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [discoveredPeers]
  );

  useEffect(() => {
    if (currentStatus?.self?.name && !deviceNameDraft) {
      setDeviceNameDraft(currentStatus.self.name);
    }
  }, [currentStatus, deviceNameDraft]);

  if (!status) {
    return (
      <div className="p2p-status-empty">
        <p>No P2P status available yet.</p>
      </div>
    );
  }

  async function runAction(key, fn) {
    setBusyAction(key);
    try {
      await fn();
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className="p2p-status-wrap">
      <div className="p2p-status-actions">
        <div className="p2p-status-actions-left">
          <button
            className="small-button"
            type="button"
            onClick={() => runAction("discovery", discoveryRunning ? onStopDiscovery : onStartDiscovery)}
            disabled={loading || busyAction === "discovery"}
          >
            {discoveryRunning ? "Stop Discovery" : "Start Discovery"}
          </button>
        </div>
        <button className="small-button" type="button" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} />
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="p2p-status-summary-grid">
        <div className="p2p-status-summary-card">
          <span>State</span>
          <strong className={currentStatus.available ? "online" : "offline"}>
            {currentStatus.available ? <Wifi size={14} /> : <WifiOff size={14} />}
            {currentStatus.available ? (discoveryRunning ? "Live Discovery" : "Ready") : "No Local Data"}
          </strong>
        </div>
        <div className="p2p-status-summary-card">
          <span>Peers</span>
          <strong>{currentStatus.peerCount || 0}</strong>
        </div>
        <div className="p2p-status-summary-card">
          <span>Trusted Links</span>
          <strong>{currentStatus.trustedLinkCount || 0}</strong>
        </div>
        <div className="p2p-status-summary-card">
          <span>Workspace Keys</span>
          <strong>{currentStatus.workspaceKeyCount || 0}</strong>
        </div>
      </div>

      <div className="p2p-status-meta">
        <p>
          <span>Generated</span>
          <strong>{formatDateTime(currentStatus.generatedAt)}</strong>
        </p>
        <p>
          <span>Session</span>
          <strong>{currentStatus.self?.peerId || currentStatus.sessionId || "N/A"}</strong>
        </p>
        <p>
          <span>Listen Port</span>
          <strong>{currentStatus.self?.listenPort || "N/A"}</strong>
        </p>
        <p>
          <span>Source</span>
          <strong>{currentStatus.source || "N/A"}</strong>
        </p>
      </div>

      <div className="p2p-control-grid">
        <div className="p2p-control-card">
          <h3>Device</h3>
          <label>
            <span>Device Name</span>
            <input
              type="text"
              value={deviceNameDraft}
              onChange={(event) => setDeviceNameDraft(event.target.value)}
              placeholder="Your peer name"
            />
          </label>
          <button
            className="small-button"
            type="button"
            disabled={busyAction === "name" || !deviceNameDraft.trim()}
            onClick={() => runAction("name", () => onSetDeviceName(deviceNameDraft))}
          >
            Save Name
          </button>
        </div>

        <div className="p2p-control-card">
          <h3>Create Invite</h3>
          <label>
            <span>Target Peer (Optional)</span>
            <select value={invitePeerId} onChange={(event) => setInvitePeerId(event.target.value)}>
              <option value="">Any discovered peer</option>
              {sortedDiscovered.map((peer) => (
                <option key={peer.peerId} value={peer.peerId}>{peer.name} ({peer.peerId})</option>
              ))}
            </select>
          </label>
          <button
            className="small-button"
            type="button"
            disabled={busyAction === "invite"}
            onClick={() => runAction("invite", () => onCreateInvite(invitePeerId || null))}
          >
            Generate Invite Code
          </button>
        </div>

        <div className="p2p-control-card">
          <h3>Pair With Code</h3>
          <label>
            <span>Peer</span>
            <select value={pairPeerId} onChange={(event) => setPairPeerId(event.target.value)}>
              <option value="">Select discovered peer</option>
              {sortedDiscovered.map((peer) => (
                <option key={peer.peerId} value={peer.peerId}>{peer.name} ({peer.peerId})</option>
              ))}
            </select>
          </label>
          <label>
            <span>Invite Code</span>
            <input
              type="text"
              value={pairCode}
              onChange={(event) => setPairCode(event.target.value)}
              placeholder="amber-lotus-42-nova"
            />
          </label>
          <button
            className="small-button"
            type="button"
            disabled={busyAction === "pair" || !pairPeerId || !pairCode.trim()}
            onClick={() => runAction("pair", () => onPairWithCode(pairPeerId, pairCode))}
          >
            Pair
          </button>
        </div>

        <div className="p2p-control-card">
          <h3>Manual Connect</h3>
          <label>
            <span>Address</span>
            <input
              type="text"
              value={manualAddress}
              onChange={(event) => setManualAddress(event.target.value)}
              placeholder="127.0.0.1"
            />
          </label>
          <label>
            <span>Port</span>
            <input
              type="number"
              value={manualPort}
              onChange={(event) => setManualPort(event.target.value)}
              placeholder="47501"
            />
          </label>
          <button
            className="small-button"
            type="button"
            disabled={busyAction === "connect" || !manualAddress.trim() || !manualPort.trim()}
            onClick={() => runAction("connect", () => onManualConnect(manualAddress, manualPort))}
          >
            Connect
          </button>
          <button
            className="small-button"
            type="button"
            disabled={busyAction === "rotate-all" || !trustedPeers.length}
            onClick={() => runAction("rotate-all", () => onRotateWorkspaceKeys())}
          >
            Rotate All Keys
          </button>
        </div>
      </div>

      <div className="p2p-status-peer-table-wrap">
        <h3 className="p2p-section-title">Active Invite Codes</h3>
        <table className="p2p-status-peer-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Target</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {!invites.length ? (
              <tr>
                <td colSpan={3} className="p2p-status-table-empty">No active invites.</td>
              </tr>
            ) : invites.map((invite) => (
              <tr key={invite.inviteId}>
                <td className="mono-cell">{invite.code}</td>
                <td>{invite.targetPeerId || "Any"}</td>
                <td>{formatDateTime(invite.expiresAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p2p-status-peer-table-wrap">
        <h3 className="p2p-section-title">Discovered Peers</h3>
        <table className="p2p-status-peer-table">
          <thead>
            <tr>
              <th>Peer</th>
              <th>Peer ID</th>
              <th>Address</th>
              <th>Port</th>
              <th>Last Seen</th>
              <th>Trusted</th>
            </tr>
          </thead>
          <tbody>
            {!sortedDiscovered.length ? (
              <tr>
                <td colSpan={6} className="p2p-status-table-empty">No peers discovered yet.</td>
              </tr>
            ) : sortedDiscovered.map((peer) => (
              <tr key={peer.peerId}>
                <td>{peer.name}</td>
                <td className="mono-cell" title={peer.peerId}>{peer.peerId}</td>
                <td className="mono-cell">{peer.address}</td>
                <td>{peer.listenPort || "N/A"}</td>
                <td>{formatDateTime(peer.lastSeenAt)}</td>
                <td>{peer.trusted ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p2p-status-peer-table-wrap">
        <h3 className="p2p-section-title">Trusted Peers</h3>
        <table className="p2p-status-peer-table">
          <thead>
            <tr>
              <th>Peer</th>
              <th>Peer ID</th>
              <th>Address</th>
              <th>Port</th>
              <th>Paired</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!trustedPeers.length ? (
              <tr>
                <td colSpan={6} className="p2p-status-table-empty">No trusted peers yet.</td>
              </tr>
            ) : (
              trustedPeers.map((peer) => (
                <tr key={peer.peerId}>
                  <td>{peer.name}</td>
                  <td className="mono-cell" title={peer.peerId}>{peer.peerId}</td>
                  <td className="mono-cell">{peer.address || "N/A"}</td>
                  <td>{peer.listenPort || "N/A"}</td>
                  <td>{formatDateTime(peer.pairedAt)}</td>
                  <td>
                    <button
                      className="small-button"
                      type="button"
                      disabled={busyAction === `remove-${peer.peerId}`}
                      onClick={() => runAction(`remove-${peer.peerId}`, () => onRemoveTrustedPeer(peer.peerId))}
                    >
                      Remove
                    </button>
                    <button
                      className="small-button"
                      type="button"
                      disabled={busyAction === `rotate-${peer.peerId}`}
                      onClick={() => runAction(`rotate-${peer.peerId}`, () => onRotateWorkspaceKeys(peer.peerId))}
                    >
                      Rotate Key
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {peers.length ? (
        <div className="p2p-status-meta p2p-status-legacy-block">
          <p>
            <span>Legacy Harness Rows</span>
            <strong>{peers.length}</strong>
          </p>
        </div>
      ) : null}
    </div>
  );
}
