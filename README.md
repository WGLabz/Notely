<div align="center">
  <img src="assets/icon.png" width="128" alt="Notely Logo" />
  <h1>Notely</h1>

  <a href="https://github.com/WGLabz/Notely/actions">
    <img src="https://github.com/WGLabz/Notely/actions/workflows/docs.yml/badge.svg" alt="Docs Deploy Status">
  </a>
  <a href="https://github.com/WGLabz/Notely/actions">
    <img src="https://github.com/WGLabz/Notely/actions/workflows/ci.yml/badge.svg" alt="CI Status">
  </a>
  <a href="https://github.com/WGLabz/Notely/actions">
    <img src="https://github.com/WGLabz/Notely/actions/workflows/cd.yml/badge.svg" alt="CD Status">
  </a>
  <img src="https://img.shields.io/badge/version-v0.1.22-blue" alt="Version" />
  <img src="https://img.shields.io/badge/license-CC--BY--NC--4.0-green" alt="License" />
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey" alt="Platform" />

  <p><b>A desktop Markdown notes app for team and project workspaces.</b></p>
</div>

<br/>

Notely is built with Electron + React and is designed for project notes, meeting records, document history, image handling, and markdown authoring in one place.

## Key Features

- Open and manage Markdown notes inside a chosen workspace folder.
- Organize work into projects and a root workspace.
- Customize folder and note icons and colors for a highly personalized workspace.
- Edit Markdown in raw, split, preview, and web modes.
- Validate Markdown structure while you type.
- Check typos in the editor with a built-in Hunspell-powered spelling engine. Add custom jargon/vocabulary to a workspace spelling dictionary, and manage added words in a dedicated dictionary overlay.
- Search notes by title, metadata, path, and in-file content with match previews.
  - **Regex search** with validation and pattern matching for advanced queries.
  - **Code-aware search** to find patterns inside code blocks only.
- Insert common Markdown snippets from the toolbar.
- Edit Markdown tables inline with a focused grid editor (row/column add/remove, alignment controls, and compact action chips).
- Browse, annotate, optimize, and manage linked media.
- Open note files in VS Code or the system default app.
- Open the current workspace folder in VS Code directly from **File -> Open Workspace in VS Code** (`Ctrl/Cmd + Shift + O`) on the landing screen.
- Reveal the workspace folder in the system File Explorer from **File -> Reveal Workspace in File Explorer** (`Ctrl/Cmd + Shift + J`) on the landing screen.
- Open the project website or the current note's website view from the **Web** menu (`Ctrl/Cmd + Shift + W`).
- Track note history and changes with native **Git Version Control**.
  - Interactive Git tab strip displaying Status, Commit History, Diff Comparison, Branch/Tag lists, Stash management, Syncing, and Config Settings.
  - Side-by-side note differences comparing "Quick Notes" and "Formal Notes" sections independently.
  - Toggle between rich visual **Markdown Preview Mode** (with correct pathing for local images/Excalidraw diagrams) and standard raw **Code View** for line differences.
  - Word-level inline diff highlights, automatic legacy history-to-commit migrations on startup, and direct commit tagging.
- Preview Mermaid diagrams and rendered Markdown content.
- Create and edit structured technical diagrams with **Draw.io integration** directly from markdown previews, supporting drag-and-drop import for `.drawio` and `.drawio.xml` files, image export, and offline drawing.
- Visualize the workspace as an interactive note graph.
- Use built-in AI features powered by Gemini or Groq for chat, queries, and semantic search.
- Aggregate tasks across notes with **Open Tasks** and **All Tasks** panels.
  - Open Tasks focuses on unchecked items.
  - All Tasks includes open + closed items with filtering and note grouping.
  - Dashboard widgets and note-level task summaries help you triage quickly.
- Recover deleted files and folders with the built-in **Trash Bin** recovery modal, supporting restoration to original locations or permanently emptying the trash.
- Export the workspace as a `.zip` bundle from the landing File menu with selectable format.
  - Notes as-is (`.md` + assets)
  - PDF-only (one PDF per note)
  - Web format (static HTML export package)
  - Optional `.notes-app` metadata inclusion (default off)
- View note statistics (word count, line count, reading time estimate) in the status bar.
- Copy note content as HTML or plain text directly from the editor toolbar.
- Execute JavaScript (`js`/`javascript`) and Python (`py`/`python`) code blocks locally with the interactive ▶ Run (Play) button in both Markdown Previews and the popup Code Editor modal. Outputs (stdout/stderr) are rendered in an integrated high-contrast dark terminal output pane.
- Navigate nested folders with breadcrumb links for easy folder traversal.
- Navigate active note tabs using **Ctrl+Tab** (next tab) and **Ctrl+Shift+Tab** (previous tab) standard shortcuts.
- Copy note link paths relative to the current workspace root from right-click context menus on tabs and dashboard document list items.
- Dismiss notification toasts immediately with a close button, and undo/redo applied markdown quick fixes or validation suggestions.
- Hover over links in Markdown Previews to display a transient popover containing Copy Link and Navigate options, while direct clicks on links are prevented to avoid accidental navigation.
- **Export/Import Note Packages** (`.note` files) via **File → Export / Import Note Package** to share self-contained, encrypted bundles of notes with all linked media, Excalidraw diagrams, Draw.io files, and screenshots.
  - Bundles are AES-256 encrypted and SHA-256 integrity-checked so recipients can trust authenticity.
  - A dedicated **Export/Import modal** lets you select which notes to include, pre-fills the save path and filename from your last export location, and handles naming collisions on import automatically.
  - Importing unpacks directly into the current workspace with full dependency restoration.

## Getting Started

Current packaged release target:

- Windows x64 portable build via `npm run dist:win`

Development prerequisites:

- Node.js 20 or later
- npm 10 or later
- Windows if you need packaged build output from the included packaging scripts

Optional environment variables:

- `NOTES_ROOT` to open a specific workspace folder on launch
- `CSC_LINK`, `CSC_KEY_PASSWORD`, or `CSC_NAME` for Windows signing
- `NOTELY_TERMINAL_REQUIRED_ROLE`, `NOTELY_TERMINAL_POLICY`, and `NOTELY_TERMINAL_ALLOWLIST` for embedded terminal hardening

End-user first run:

1. Launch the app.
2. Open **File -> Open Workspace**.
3. Choose the folder that should hold your notes.
4. Create a note with **File -> New Note**.
5. Open **Help -> Help Center** or **Help -> Keyboard Shortcuts** if you need guidance.

## In-app Help Center

Notely includes built-in user documentation in the app menu:

- Open **Help -> Help Center** (or press `F1`) to view app usage guidance directly in the app.
- Open **Help -> Keyboard Shortcuts** for shortcut references.
- Open **Help -> About Notely** to view a dedicated About dialog with product identity and build information.

The Help Center includes quick start, core features, shortcuts, and storage/versioning notes so users do not need to leave the app to find documentation.
The Help Center now reads its content directly from the repository `docs/` folder so in-app and repository documentation stay aligned.



## Development

### Install dependencies

```bash
npm install
```

### Run in development

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

### Run tests

```bash
npm test
```

### Run local P2P harness

```bash
npm run test:p2p
```

This harness is designed for one-machine validation of planned peer-to-peer flows without cloud dependencies. It validates:

- Peer discovery
- Human-readable pairing code handshake
- Workspace key exchange to trusted peers
- Encrypted message sync using workspace keys
- Workspace key rotation and re-share
- Peer revoke behavior

Harness output artifacts are written to `.artifacts/p2p-harness/`.

### Run packaged P2P validation preflight

```bash
npm run test:p2p:packaged
```

This command checks whether expected Windows release executables are present and prints a repeatable two-machine LAN validation checklist.

### Markdown linting

```bash
npm run lint:markdown
```

### Full CI check

```bash
npm run ci:check
```

## Packaging

To build the executable for Windows, run the packaging script:

```bash
./build-windows-exe.sh
```

This script generates the compiled Windows application installer and unpacked outputs.

## Project structure

- `electron/` Electron main process and preload bridge
- `src/` React UI, editor, validation, and utilities
- `scripts/` packaging and release helpers
- `notes/` sample notes and workspace content
- `build/` app icons and build assets

## Roadmap

Planned additions and improvements for upcoming iterations:

- Diagram version timeline with visual compare and restore.
- Excalidraw element comments and review threads.
- Search indexing for diagram text/content.
- Update-from-source flow for image-converted Excalidraw diagrams.
- Interactive diagram hotspots linking to notes/files.
- Expanded P2P sync dashboard with per-peer media/diagram health.
- OCR-assisted alt text suggestions for inserted images.
- Command palette automation macros for repeated authoring tasks.

## Contributing and Reporting Issues

We welcome feedback, bug reports, and feature requests!

- **In-App Reporting:** Open **Help -> Report Bug / Feedback** (or search in the Command Palette) to access the built-in issue reporting form, which automatically collects system details and opens a pre-populated issue draft on GitHub.
- **Manual Reports:** Go directly to our [GitHub Issues](https://github.com/TheNotelyApp/Notely/issues) page to open a new issue.
- **Templates:** Use the pre-configured issue templates (Bug report or Feature request) when submitting reports. When opening a Pull Request, please follow the PR template checklist.

## License and ownership

This repository is maintained for Notely use.

- Project license: **CC BY-NC 4.0** (see `LICENSE`).
- Third-party dependency notices: see `THIRD_PARTY_NOTICES.txt`.
