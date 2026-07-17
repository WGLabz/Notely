import { useState, useMemo } from "react";
import { X, Search } from "lucide-react";
import { OverlayDialog } from "./OverlayDialog";
import AppIconButton from "./AppIconButton";
import { DEFAULT_KEYBOARD_SHORTCUTS } from "../utils/keyboardShortcuts";

export function KeyboardShortcutsModal({ isOpen, onClose, shortcuts = DEFAULT_KEYBOARD_SHORTCUTS }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState("All");

  if (!isOpen) return null;

  const groups = useMemo(() => {
    const list = new Set();
    shortcuts.forEach((item) => {
      if (item.group) list.add(item.group);
    });
    return ["All", ...Array.from(list)];
  }, [shortcuts]);

  const filteredShortcuts = useMemo(() => {
    return shortcuts.filter((shortcut) => {
      const matchesGroup = activeGroup === "All" || shortcut.group === activeGroup;
      const query = searchQuery.trim().toLowerCase();
      if (!query) return matchesGroup;

      const matchesSearch =
        shortcut.action.toLowerCase().includes(query) ||
        shortcut.keys.toLowerCase().includes(query) ||
        (shortcut.notes && shortcut.notes.toLowerCase().includes(query)) ||
        (shortcut.group && shortcut.group.toLowerCase().includes(query));

      return matchesGroup && matchesSearch;
    });
  }, [shortcuts, searchQuery, activeGroup]);

  const renderKeys = (keysString) => {
    const keyCombo = keysString.split("+");
    return (
      <div className="shortcut-keycap-combo">
        {keyCombo.map((key, index) => (
          <span key={`${key}-${index}`}>
            <kbd className="shortcut-keycap">{key.trim()}</kbd>
            {index < keyCombo.length - 1 && <span className="shortcut-keycap-plus">+</span>}
          </span>
        ))}
      </div>
    );
  };

  return (
    <OverlayDialog open={isOpen} onClose={onClose} ariaLabel="Keyboard shortcuts" cardClassName="keyboard-shortcuts-card">
      <div className="overlay-dialog-header">
        <h2>Keyboard Shortcuts</h2>
        <AppIconButton onClick={onClose} aria-label="Close keyboard shortcuts">
          <X size={16} />
        </AppIconButton>
      </div>

      <div className="shortcuts-controls">
        <div className="shortcuts-search-wrap">
          <Search size={16} className="shortcuts-search-icon" />
          <input
            type="text"
            className="shortcuts-search-input"
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="shortcuts-search-clear"
              onClick={() => setSearchQuery("")}
            >
              Clear
            </button>
          )}
        </div>

        <div className="shortcuts-filter-pills" role="tablist" aria-label="Shortcut scopes">
          {groups.map((group) => (
            <button
              key={group}
              type="button"
              role="tab"
              aria-selected={activeGroup === group}
              className={`shortcuts-filter-pill ${activeGroup === group ? "active" : ""}`}
              onClick={() => setActiveGroup(group)}
            >
              {group}
            </button>
          ))}
        </div>
      </div>

      <p className="keyboard-shortcuts-intro">
        Some shortcuts only work in specific parts of the app. Check the Scope and Notes columns before using them everywhere.
      </p>

      <div className="keyboard-shortcuts-table-wrap">
        {filteredShortcuts.length > 0 ? (
          <table className="keyboard-shortcuts-table">
            <thead>
              <tr>
                <th>Shortcut</th>
                <th>Action</th>
                <th>Scope</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredShortcuts.map((shortcut) => (
                <tr key={`${shortcut.keys}-${shortcut.action}`}>
                  <td>{renderKeys(shortcut.keys)}</td>
                  <td>{shortcut.action}</td>
                  <td>
                    <span className="shortcut-scope-badge">{shortcut.group}</span>
                  </td>
                  <td>{shortcut.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="shortcuts-empty-state">
            <p>No shortcuts match your search: <strong>"{searchQuery}"</strong></p>
            <button type="button" className="small-button" onClick={() => { setSearchQuery(""); setActiveGroup("All"); }}>
              Reset Filters
            </button>
          </div>
        )}
      </div>
    </OverlayDialog>
  );
}