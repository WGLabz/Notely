import { useCallback, useEffect, useRef, useState } from "react";
import {
  getP2PStatus,
  startP2PDiscovery,
  stopP2PDiscovery,
  setP2PDeviceName,
  createP2PInvite,
  pairP2PWithCode,
  pairP2PWithCodeReauth,
  manualP2PConnect,
  setP2PKeyPolicyDays,
  removeTrustedP2PPeer,
  rotateP2PWorkspaceKeys,
  runP2PSyncSelfTest,
  listP2PSyncConflicts,
  readP2PConflictFiles,
  resolveP2PConflict,
  getWorkspaceActivity,
  openInEditor,
  onP2PSyncApplied,
  onP2PFullSyncProgress,
} from "../services/electronService";

// Owns all P2P discovery/pairing, workspace activity, sync self-test, and
// conflict-resolution state, handlers, and live event subscriptions.
//
// Depends on the host component for:
//   - notify(message, type)      transient toast notifications
//   - setError(message)          surface a blocking error banner
//   - loadDocumentsData()        refresh the document list after sync changes
//   - syncStateRef               ref holding { doc, dirty, openDocument } for the open note
export function useP2PSync({ notify, setError, loadDocumentsData, syncStateRef }) {
  const [p2pStatusOpen, setP2PStatusOpen] = useState(false);
  const [p2pStatusLoading, setP2PStatusLoading] = useState(false);
  const [p2pStatus, setP2PStatus] = useState(null);
  const [workspaceActivityOpen, setWorkspaceActivityOpen] = useState(false);
  const [workspaceActivityLoading, setWorkspaceActivityLoading] = useState(false);
  const [workspaceActivity, setWorkspaceActivity] = useState(null);
  const [p2pSyncHelpOpen, setP2PSyncHelpOpen] = useState(false);
  const [fullSyncProgressByPeer, setFullSyncProgressByPeer] = useState({});
  const [syncSelfTestOpen, setSyncSelfTestOpen] = useState(false);
  const [syncSelfTestLoading, setSyncSelfTestLoading] = useState(false);
  const [syncSelfTestResult, setSyncSelfTestResult] = useState(null);
  const [conflictCenterOpen, setConflictCenterOpen] = useState(false);
  const [conflictCenterLoading, setConflictCenterLoading] = useState(false);
  const [conflictCenterData, setConflictCenterData] = useState(null);
  const [conflictCursor, setConflictCursor] = useState(0);
  const [conflictResolutionOpen, setConflictResolutionOpen] = useState(false);
  const [conflictResolutionEntry, setConflictResolutionEntry] = useState(null);
  const [conflictResolutionFiles, setConflictResolutionFiles] = useState(null);
  const [conflictResolutionLoading, setConflictResolutionLoading] = useState(false);

  // Long-lived event subscriptions read the latest host callbacks through refs
  // so they never close over stale versions while keeping a stable `[]` mount.
  const notifyRef = useRef(notify);
  const loadDocumentsDataRef = useRef(loadDocumentsData);
  notifyRef.current = notify;
  loadDocumentsDataRef.current = loadDocumentsData;

  const handleOpenP2PStatus = useCallback(async () => {
    setP2PStatusOpen(true);
    setP2PStatusLoading(true);
    try {
      const snapshot = await getP2PStatus();
      setP2PStatus(snapshot);
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to load P2P status.");
      notifyRef.current?.(err?.message || "Unable to load P2P status.", "error");
    } finally {
      setP2PStatusLoading(false);
    }
  }, [setError]);

  async function handleOpenWorkspaceActivity() {
    setWorkspaceActivityOpen(true);
    setWorkspaceActivityLoading(true);
    try {
      const timeline = await getWorkspaceActivity(250);
      setWorkspaceActivity(timeline);
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to load workspace activity.");
      notify(err?.message || "Unable to load workspace activity.", "error");
    } finally {
      setWorkspaceActivityLoading(false);
    }
  }

  async function refreshP2PStatus() {
    const snapshot = await getP2PStatus();
    setP2PStatus(snapshot);
  }

  async function handleStartP2PDiscovery() {
    try {
      setP2PStatusLoading(true);
      await startP2PDiscovery();
      await refreshP2PStatus();
      notify("P2P discovery started.", "success");
    } catch (err) {
      notify(err?.message || "Unable to start P2P discovery.", "error");
    } finally {
      setP2PStatusLoading(false);
    }
  }

  async function handleStopP2PDiscovery() {
    try {
      setP2PStatusLoading(true);
      await stopP2PDiscovery();
      await refreshP2PStatus();
      notify("P2P discovery stopped.", "success");
    } catch (err) {
      notify(err?.message || "Unable to stop P2P discovery.", "error");
    } finally {
      setP2PStatusLoading(false);
    }
  }

  async function handleSetP2PDeviceName(name) {
    try {
      setP2PStatusLoading(true);
      await setP2PDeviceName(String(name || "").trim());
      await refreshP2PStatus();
      notify("P2P device name updated.", "success");
    } catch (err) {
      notify(err?.message || "Unable to update P2P device name.", "error");
    } finally {
      setP2PStatusLoading(false);
    }
  }

  async function handleCreateP2PInvite(peerId) {
    try {
      setP2PStatusLoading(true);
      const result = await createP2PInvite(peerId || undefined);
      await refreshP2PStatus();
      const code = result?.invite?.code;
      notify(code ? `Invite code: ${code}` : "P2P invite created.", "success");
    } catch (err) {
      notify(err?.message || "Unable to create P2P invite.", "error");
    } finally {
      setP2PStatusLoading(false);
    }
  }

  async function handlePairP2PWithCode(peerId, code) {
    try {
      setP2PStatusLoading(true);
      await pairP2PWithCode(peerId, String(code || "").trim());
      await refreshP2PStatus();
      notify("Peer paired successfully.", "success");
    } catch (err) {
      const message = String(err?.message || "");
      if (/confirm re-auth|re-auth confirmation/i.test(message)) {
        const confirmed = window.confirm(
          "This peer was removed earlier. Confirm re-auth to trust this peer again?"
        );
        if (confirmed) {
          try {
            await pairP2PWithCodeReauth(peerId, String(code || "").trim(), true);
            await refreshP2PStatus();
            notify("Peer re-authenticated and paired.", "success");
            return;
          } catch (reauthErr) {
            notify(reauthErr?.message || "Unable to re-authenticate peer.", "error");
            return;
          }
        }
      }
      notify(err?.message || "Unable to pair with code.", "error");
    } finally {
      setP2PStatusLoading(false);
    }
  }

  async function handleSetP2PKeyPolicyDays(days) {
    try {
      setP2PStatusLoading(true);
      const snapshot = await setP2PKeyPolicyDays(Number(days));
      setP2PStatus(snapshot);
      notify(`Key expiry policy updated to ${snapshot?.keyPolicyDays || Number(days)} day(s).`, "success");
    } catch (err) {
      notify(err?.message || "Unable to update key expiry policy.", "error");
    } finally {
      setP2PStatusLoading(false);
    }
  }

  async function handleManualP2PConnect(address, listenPort) {
    try {
      setP2PStatusLoading(true);
      await manualP2PConnect(String(address || "").trim(), Number(listenPort));
      await refreshP2PStatus();
      notify("Manual connect request sent.", "success");
    } catch (err) {
      notify(err?.message || "Unable to connect to peer.", "error");
    } finally {
      setP2PStatusLoading(false);
    }
  }

  async function handleRemoveTrustedP2PPeer(peerId) {
    try {
      setP2PStatusLoading(true);
      await removeTrustedP2PPeer(peerId);
      await refreshP2PStatus();
      notify("Trusted peer removed.", "success");
    } catch (err) {
      notify(err?.message || "Unable to remove trusted peer.", "error");
    } finally {
      setP2PStatusLoading(false);
    }
  }

  async function handleRotateP2PWorkspaceKeys(peerId) {
    try {
      setP2PStatusLoading(true);
      const result = await rotateP2PWorkspaceKeys(peerId);
      await refreshP2PStatus();
      const count = Number(result?.rotated || 0);
      notify(`Workspace key rotated for ${count} peer${count === 1 ? "" : "s"}.`, "success");
    } catch (err) {
      notify(err?.message || "Unable to rotate workspace keys.", "error");
    } finally {
      setP2PStatusLoading(false);
    }
  }

  async function handleRunP2PSyncSelfTest() {
    setSyncSelfTestOpen(true);
    setSyncSelfTestLoading(true);
    try {
      const result = await runP2PSyncSelfTest();
      setSyncSelfTestResult(result);
      notify(result?.ok ? "P2P sync self-test passed." : "P2P sync self-test failed.", result?.ok ? "success" : "error");
    } catch (err) {
      setSyncSelfTestResult({ ok: false, error: err?.message || "Self-test failed." });
      notify(err?.message || "Unable to run sync self-test.", "error");
    } finally {
      setSyncSelfTestLoading(false);
    }
  }

  async function handleOpenConflictCenter() {
    setConflictCenterOpen(true);
    setConflictCenterLoading(true);
    setConflictCursor(0);
    try {
      const data = await listP2PSyncConflicts(250);
      setConflictCenterData(data);
    } catch (err) {
      notify(err?.message || "Unable to load conflict center.", "error");
      setConflictCenterData({ total: 0, conflicts: [] });
    } finally {
      setConflictCenterLoading(false);
    }
  }

  async function handleOpenConflictFile(filePath) {
    try {
      await openInEditor(filePath);
    } catch (err) {
      notify(err?.message || "Unable to open conflict file.", "error");
    }
  }

  async function handleOpenConflictResolution(entry) {
    if (!entry) return;
    setConflictResolutionEntry(entry);
    setConflictResolutionOpen(true);
    setConflictResolutionFiles(null);
    setConflictResolutionLoading(true);
    try {
      const files = await readP2PConflictFiles(entry.filePath, entry.conflictPath);
      setConflictResolutionFiles(files);
    } catch (err) {
      notify(err?.message || "Unable to load conflict files.", "error");
      setConflictResolutionOpen(false);
    } finally {
      setConflictResolutionLoading(false);
    }
  }

  async function handleResolveConflict(resolution) {
    if (!conflictResolutionEntry) return;
    setConflictResolutionLoading(true);
    try {
      const mergedContent = typeof resolution === "object" ? resolution.mergedContent : undefined;
      const resolutionType = typeof resolution === "string" ? resolution : "merged";
      await resolveP2PConflict(
        conflictResolutionEntry.filePath,
        conflictResolutionEntry.conflictPath,
        resolutionType,
        mergedContent
      );
      notify("Conflict resolved.", "success");
      setConflictResolutionOpen(false);
      setConflictResolutionEntry(null);
      setConflictResolutionFiles(null);
      const data = await listP2PSyncConflicts(250);
      setConflictCenterData(data);
      setConflictCursor((cursor) => Math.max(0, Math.min(cursor, Math.max(0, (data?.conflicts?.length || 1) - 1))));
      await loadDocumentsData();
    } catch (err) {
      notify(err?.message || "Unable to resolve conflict.", "error");
    } finally {
      setConflictResolutionLoading(false);
    }
  }

  function handleOpenNextConflict() {
    const conflicts = conflictCenterData?.conflicts || [];
    if (!conflicts.length) {
      notify("No unresolved conflicts remain.", "info");
      return;
    }
    const nextIndex = conflictCursor % conflicts.length;
    const nextEntry = conflicts[nextIndex];
    setConflictCursor(nextIndex + 1);
    handleOpenConflictResolution(nextEntry);
  }

  useEffect(() => {
    return onP2PSyncApplied((payload) => {
      const op = payload?.op;
      const relativePath = payload?.relativePath || "";
      const filePath = payload?.filePath || "";
      const peerName = payload?.peerName || "a peer";

      if (op === "delete") {
        notifyRef.current(`Note deleted by ${peerName}: ${relativePath}`, "info");
      } else if (op === "delete-conflict") {
        notifyRef.current(
          `${peerName} tried to delete "${relativePath}" but your local version differs — check Activity for details.`,
          "warning"
        );
      } else if (op === "conflict") {
        notifyRef.current(`Sync conflict from ${peerName} — open P2P → Conflict Center to resolve.`, "warning");
      } else {
        notifyRef.current(`Note synced from ${peerName}: ${relativePath}`, "info");
      }

      const { doc, dirty: isDirty, openDocument: openDoc } = syncStateRef.current;
      const appliedToOpenNote =
        filePath &&
        doc?.filePath &&
        !isDirty &&
        filePath.toLowerCase().replace(/\\/g, "/") === doc.filePath.toLowerCase().replace(/\\/g, "/");

      if (appliedToOpenNote && (op === "update" || op === "create" || op === "merge")) {
        openDoc(doc.filePath, { preserveActiveTab: true }).catch(() => {});
      }

      loadDocumentsDataRef.current();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return onP2PFullSyncProgress((payload) => {
      const peerId = String(payload?.peerId || "unknown-peer");
      setFullSyncProgressByPeer((currentMap) => ({
        ...currentMap,
        [peerId]: payload
      }));

      if (payload?.phase === "completed") {
        const queued = Number(payload?.queuedFiles || 0);
        const total = Number(payload?.totalFiles || queued);
        const truncated = Boolean(payload?.truncated);
        notifyRef.current(
          `Initial sync complete for ${peerId}: ${queued}/${total} note(s) queued${truncated ? " (truncated cap)." : "."}`,
          "success"
        );
      } else if (payload?.phase === "failed") {
        notifyRef.current(payload?.error || `Initial sync failed for ${peerId}.`, "error");
      }
    });
  }, []);

  return {
    // P2P status panel
    p2pStatusOpen,
    setP2PStatusOpen,
    p2pStatusLoading,
    p2pStatus,
    fullSyncProgressByPeer,
    handleOpenP2PStatus,
    handleStartP2PDiscovery,
    handleStopP2PDiscovery,
    handleSetP2PDeviceName,
    handleSetP2PKeyPolicyDays,
    handleCreateP2PInvite,
    handlePairP2PWithCode,
    handleManualP2PConnect,
    handleRemoveTrustedP2PPeer,
    handleRotateP2PWorkspaceKeys,
    // Workspace activity
    workspaceActivityOpen,
    setWorkspaceActivityOpen,
    workspaceActivityLoading,
    workspaceActivity,
    handleOpenWorkspaceActivity,
    // P2P sync help
    p2pSyncHelpOpen,
    setP2PSyncHelpOpen,
    // Sync self-test
    syncSelfTestOpen,
    setSyncSelfTestOpen,
    syncSelfTestLoading,
    syncSelfTestResult,
    handleRunP2PSyncSelfTest,
    // Conflict center + resolution
    conflictCenterOpen,
    setConflictCenterOpen,
    conflictCenterLoading,
    conflictCenterData,
    conflictResolutionOpen,
    setConflictResolutionOpen,
    conflictResolutionEntry,
    conflictResolutionFiles,
    conflictResolutionLoading,
    handleOpenConflictCenter,
    handleOpenConflictFile,
    handleOpenConflictResolution,
    handleResolveConflict,
    handleOpenNextConflict,
  };
}
