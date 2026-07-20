# Changelog

All notable documentation and user-facing behavior changes are tracked in this file.

## Unreleased

### Added

- Added modular, local-first **AI Platform** overhaul:
  - **Global AI Chat**: Open AI Assistant panel from the left sidebar on the landing screen to search/chat across the entire workspace.
  - **Sourced References**: Render referred notes chips under assistant message bubbles so users can inspect note relevance.
  - **Tool Traces Log**: Interactive **AI Health** diagnostic panel displaying database connection states, requests/tokens counts, and collapsible tool execution logs (name, arguments, output) for all chat queries.
  - **Local Embedding Vectorizer**: SQLite-backed local embeddings queue utilizing a local ONNX runtime for `BGE-small-en-v1.5` vectors.
  - **Knowledge Graph**: SQLite-backed relation indexes supporting recursive CTE graph traversals.
  - **Rich Personas**: Select preset emoji avatar icons (🤖, 💻, 🧠, etc.) inside the custom Persona Manager registry.
  - **Performance Caches**: In-memory caching for hot vectors in `EmbeddingService` and 60-second TTL-based cache on CTE graph queries in `GraphRetriever`.
- Added Vitest test suites covering chunking, database vectors, indexing queues, background worker loops, semantic search matches, provider registry loading, and tool execution.

## 2026-07-17

### Added

- Added **Export / Import Note Package** feature (`File → Export / Import Note Package`).
  - Exports a selection of notes — including all linked images, Excalidraw diagrams, Draw.io files, screenshots, and thumbnails — into a single encrypted `.note` bundle.
  - Bundles are AES-256 encrypted and SHA-256 integrity-hashed; tampered files are detected on import.
  - Import unpacks the bundle into the current workspace, restoring all assets and resolving filename collisions via embedded metadata.
  - Default export path and filename (`{rootFolder}.note`) are pre-filled from the last-used export location.
  - Dedicated **Export/Import modal** with a scrollable, compact note-selection list supporting Select All/Deselect All; fixed-height dialog that does not shift when switching between the Export and Import tabs.
- Added `src/tests/utils/notePackage.test.js` — unit tests covering dependency scanning, path sanitization (leading-slash screenshot paths), crypto, and regex parsing.

### Fixed

- Fixed split-view scroll sync sluggishness and lock-fighting between the raw editor and the preview panel.
  - Replaced the `activeScrollSource` string-based lock with a generation counter (`lockGen`) and an 80 ms timeout, preventing programmatic `scrollTop` changes from bouncing back into the opposite panel's sync handler.
- Fixed `.note` export failing with `EPERM: operation not permitted, copyfile` when notes contained screenshots stored as `/media/images/…` paths; leading slashes are now stripped before OS path resolution.
- Fixed `.note` export `mkdir` crash caused by absolute note file paths being passed to `path.join(stagingDir, absPath)`; paths are now normalised to workspace-relative via `path.relative(notesRoot, absolutePath)`.
- Fixed destination directory not being created automatically when the user accepts the default export path without browsing.


- Added a **Copy Link Path** context menu option to open tabs and landing items to easily copy workspace-relative paths.
- Added support for custom action buttons (e.g. "Undo") inside notification toasts.
- Added a **Copy | Navigate** hover popover for links in Markdown Previews, while preventing accidental direct click navigation.
- Added a close (`X`) button to notification toasts to dismiss them immediately.
- Added a comprehensive `UI_UX_BACKLOG.md` tracking visual, structural, and desktop accessibility improvement tasks.
- Added a built-in **Trash Bin** recovery modal allowing users to browse, restore, or permanently empty deleted notes and folders.
- Added an inline markdown table editor overlay with grid-based cell/header editing.
- Added contextual row/column action chips and column alignment controls for table editing.
- Added regression tests for markdown table parsing/serialization behavior in `src/utils/tableUtils.test.js`.

- Keep workspace dashboard sidebar always visible and accessible when navigating subfolders, preventing layout shifts.
- Normalized spacing and grid gaps across dashboard panels to use design system space tokens.
- Extracted inline custom contrast colors into semantic class `.custom-colored-item`, fixing contrast readability issues on custom note/folder cards.
- Standardized custom modal corner radius to use `--radius-lg` consistently.
- Centralized common CSS animations (e.g., `spin`, `modal-pop`) to `base.css` to prevent redundant keyframe declarations.
- Updated Draw.io diagram saves to use a solid white background in exported PNG files to prevent poor contrast issues on dark backgrounds.
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