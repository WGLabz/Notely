import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

const FILTER_STORAGE_KEY = "notely:workspace-activity-filters";

function formatReason(value) {
  const reason = String(value || "unknown").replace(/[-_]+/g, " ").trim();
  if (!reason) return "Unknown";
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

function formatDateTime(value) {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export function WorkspaceActivityPanel({ data, loading, onRefresh }) {
  const [actionFilter, setActionFilter] = useState("all");
  const [fileQuery, setFileQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const currentData = data || {};

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.actionFilter === "string") setActionFilter(parsed.actionFilter);
      if (typeof parsed?.fileQuery === "string") setFileQuery(parsed.fileQuery);
      if (typeof parsed?.fromDate === "string") setFromDate(parsed.fromDate);
      if (typeof parsed?.toDate === "string") setToDate(parsed.toDate);
    } catch {
      // Ignore invalid persisted filter payloads.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({ actionFilter, fileQuery, fromDate, toDate })
      );
    } catch {
      // Ignore storage failures.
    }
  }, [actionFilter, fileQuery, fromDate, toDate]);

  const activity = Array.isArray(currentData.activity) ? currentData.activity : [];
  const actionTypes = useMemo(() => {
    const unique = new Set(activity.map((item) => String(item.reason || "unknown").trim()).filter(Boolean));
    return ["all", ...Array.from(unique).sort((a, b) => a.localeCompare(b))];
  }, [activity]);

  const filteredActivity = useMemo(() => {
    const query = fileQuery.trim().toLowerCase();
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;

    return activity.filter((item) => {
      const reason = String(item.reason || "unknown").trim();
      if (actionFilter !== "all" && reason !== actionFilter) {
        return false;
      }

      if (query) {
        const fileName = String(item.fileName || "").toLowerCase();
        const relativePath = String(item.relativePath || item.filePath || "").toLowerCase();
        if (!fileName.includes(query) && !relativePath.includes(query)) {
          return false;
        }
      }

      if (fromMs !== null || toMs !== null) {
        const eventMs = item.createdAt ? new Date(item.createdAt).getTime() : NaN;
        if (Number.isNaN(eventMs)) {
          return false;
        }
        if (fromMs !== null && eventMs < fromMs) {
          return false;
        }
        if (toMs !== null && eventMs > toMs) {
          return false;
        }
      }

      return true;
    });
  }, [activity, actionFilter, fileQuery, fromDate, toDate]);

  if (!data) {
    return (
      <div className="activity-empty">
        <p>No workspace activity available yet.</p>
      </div>
    );
  }

  function handleClearFilters() {
    setActionFilter("all");
    setFileQuery("");
    setFromDate("");
    setToDate("");
  }

  return (
    <div className="activity-wrap">
      <div className="activity-actions">
        <div className="activity-actions-left">
          <button className="small-button" type="button" onClick={handleClearFilters}>
            Clear Filters
          </button>
        </div>
        <button className="small-button" type="button" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} />
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="activity-summary-grid">
        <div className="activity-summary-card">
          <span>Workspace</span>
          <strong>{currentData.workspaceLabel || "Workspace"}</strong>
        </div>
        <div className="activity-summary-card">
          <span>Root</span>
          <strong className="mono-cell" title={currentData.workspaceRoot || ""}>{currentData.workspaceRoot || "N/A"}</strong>
        </div>
        <div className="activity-summary-card">
          <span>Events</span>
          <strong>{filteredActivity.length} / {currentData.total || 0}</strong>
        </div>
      </div>

      <div className="activity-filters">
        <label className="activity-filter-field">
          <span>Action Type</span>
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
            {actionTypes.map((value) => (
              <option key={value} value={value}>
                {value === "all" ? "All actions" : formatReason(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="activity-filter-field activity-filter-file">
          <span>File Name / Path</span>
          <input
            type="text"
            value={fileQuery}
            onChange={(event) => setFileQuery(event.target.value)}
            placeholder="Search file name or path"
          />
        </label>

        <label className="activity-filter-field">
          <span>From Date</span>
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        </label>

        <label className="activity-filter-field">
          <span>To Date</span>
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
      </div>

      <div className="activity-table-wrap">
        <table className="activity-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Note</th>
              <th>Path</th>
            </tr>
          </thead>
          <tbody>
            {!filteredActivity.length ? (
              <tr>
                <td colSpan={5} className="activity-table-empty">No activity matched current filters.</td>
              </tr>
            ) : (
              filteredActivity.map((item) => (
                <tr key={item.id}>
                  <td>{formatDateTime(item.createdAt)}</td>
                  <td>{formatReason(item.reason)}</td>
                  <td>{item.actor || "local-user"}</td>
                  <td>{item.fileName || "Unknown"}</td>
                  <td className="mono-cell" title={item.relativePath || ""}>{item.relativePath || item.filePath || "N/A"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
