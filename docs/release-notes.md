# Release Notes

## 2026-07-03 (latest)

### New features

- **Open Workspace in VS Code** — the landing **File** menu now includes **Open Workspace in VS Code** (`Ctrl/Cmd + Shift + O`). Opens the active workspace folder directly in VS Code, or falls back to the system default app.
- **Reveal Workspace in File Explorer** — the landing **File** menu now includes **Reveal Workspace in File Explorer** (`Ctrl/Cmd + Shift + J`). Opens the workspace folder in the native system file browser.
- **Web menu** — a new top-level **Web** menu (`Ctrl/Cmd + Shift + W`) provides one-click access to the project website (landing screen) or the current note's website view (note screen).
- **Custom dropdown controls** — all select/dropdown controls across the app have been replaced with a fully custom listbox component. The new control supports grouped options, keyboard navigation (arrow keys, Home, End, Enter, Escape), selected-state checkmarks, and focus-aware close behaviour.

### Refinements

- **Form focus styles** — focus indicators across all inputs, selects, and textareas have been softened to a subtle border tint and `2px` halo for a more professional desktop feel.
- **Continue Writing panel** — now shows only the single most recently edited note instead of a list, making it faster to resume work.
- **Task hover popover** — the note-level task summary popover now sizes to the available viewport height before showing a scrollbar.
- **Note detail topbar consistency** — breadcrumb chips, task summary, save status, and action controls now use aligned heights and shared corner radius styling for a cleaner, unified row.

### Fixes

- **Workspace switch website refresh** — opening project website view after changing workspace now reflects the current workspace immediately instead of reusing stale scope from the previous folder.
- **Task summary accessibility semantics** — the topbar task summary trigger now uses button semantics with screen-reader state attributes for improved accessibility.

---

## 2026-07-03

This release focuses on documentation accuracy, shortcut clarity, and in-app help coverage.

### Documentation updates

- Updated user docs to match current UI labels such as **Open Workspace** and **Help Center**
- Added a dedicated **Settings Reference** page
- Added an **FAQ** page
- Added this **Release Notes** page and a repository `CHANGELOG.md`

### Shortcut updates

- Resolved overlapping shortcut definitions for the command palette, AI palette, focus mode, and outline workflows
- Expanded the in-app keyboard shortcuts guide to include context-specific shortcuts and usage notes

### Help Center updates

- Added new Help Center entries for settings, FAQ, and release notes
- Updated task and troubleshooting documentation to cover current workflows more accurately

## Notes for existing users

- If you learned older menu names such as **Notes Folder** or **Documentation**, use **Open Workspace** and **Help Center** instead.
- If you used older overlapping shortcuts, open the keyboard guide once to confirm the current bindings.