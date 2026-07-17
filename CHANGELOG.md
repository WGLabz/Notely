# Changelog

All notable documentation and user-facing behavior changes are tracked in this file.

## Unreleased

## 2026-07-17

### Added

- Added `Ctrl+Tab` (next tab) and `Ctrl+Shift+Tab` (previous tab) shortcuts to navigate between open notes.
- Added a **Copy Link Path** context menu option to open tabs and landing items to easily copy workspace-relative paths.
- Added support for custom action buttons (e.g. "Undo") inside notification toasts.
- Added a **Copy | Navigate** hover popover for links in Markdown Previews, while preventing accidental direct click navigation.
- Added a close (`X`) button to notification toasts to dismiss them immediately.
- Added a comprehensive `UI_UX_BACKLOG.md` tracking visual, structural, and desktop accessibility improvement tasks.
- Added a built-in **Trash Bin** recovery modal allowing users to browse, restore, or permanently empty deleted notes and folders.
- Added an inline markdown table editor overlay with grid-based cell/header editing.
- Added contextual row/column action chips and column alignment controls for table editing.
- Added regression tests for markdown table parsing/serialization behavior in `src/utils/tableUtils.test.js`.

### Changed

- Updated table view mode row behavior in document list to support double-clicking to open immediately.
- Hidden the markdown validation banner when there are no issues.
- Refined note detail topbar visual consistency by normalizing control height and shared corner-radius usage.
- Improved inline table edit behavior to preserve original table formatting when table shape and alignments are unchanged.
- Updated table editor controls with compact labeled actions and improved interaction ergonomics.

### Fixed

- Fixed project website/web preview scope refresh after workspace (notes folder) changes so newly selected workspaces render correctly.
- Improved note task summary trigger semantics for better keyboard and screen-reader compatibility.
- Fixed inline table parsing to preserve escaped pipes and plain backslashes in cell content.
- Fixed inline table delete actions so row/column deletion keeps focus inside the table editor.
- Fixed table editor scroll handling to prevent background scrolling while preserving table panel scrolling.

## 2026-07-03

### Added

- Added `docs/settings-reference.md`
- Added `docs/faq.md`
- Added `docs/release-notes.md`
- Added a repository-level documentation audit report
- Added a shared keyboard shortcut inventory used by the in-app shortcut guide

### Changed

- Updated main user docs to use current UI labels such as **Open Workspace** and **Help Center**
- Expanded the in-app keyboard shortcuts modal to show a broader, implementation-backed shortcut table
- Updated AI and storage documentation to match the current implementation more closely

### Fixed

- Removed the documented shortcut conflicts between command palette, AI palette, focus mode, and outline/reference-link flows