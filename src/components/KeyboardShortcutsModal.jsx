const DEFAULT_SHORTCUTS = [
  { keys: "Ctrl/Cmd+K", action: "Open Command Palette", group: "Global" },
  { keys: "Ctrl/Cmd+Shift+F", action: "Open Global Search", group: "Global" },
  { keys: "Ctrl/Cmd+/", action: "Open Keyboard Shortcuts", group: "Global" },
  { keys: "Ctrl/Cmd+N", action: "Create New Note", group: "Notes" },
  { keys: "Ctrl/Cmd+F", action: "Find in Current Note", group: "Editor" },
  { keys: "Esc", action: "Close Active Overlay", group: "Global" },
];

export function KeyboardShortcutsModal({ isOpen, onClose, shortcuts = DEFAULT_SHORTCUTS }) {
  if (!isOpen) return null;

  return (
    <div
      className="overlay-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="overlay-dialog-card keyboard-shortcuts-card">
        <div className="overlay-dialog-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="small-button" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="keyboard-shortcuts-table-wrap">
          <table className="keyboard-shortcuts-table">
            <thead>
              <tr>
                <th>Shortcut</th>
                <th>Action</th>
                <th>Scope</th>
              </tr>
            </thead>
            <tbody>
              {shortcuts.map((shortcut) => (
                <tr key={`${shortcut.keys}-${shortcut.action}`}>
                  <td><kbd>{shortcut.keys}</kbd></td>
                  <td>{shortcut.action}</td>
                  <td>{shortcut.group}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}