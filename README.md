# Notely

Notely is a desktop Markdown notes app for the TCL Mithapur workspace. It is built with Electron + React and is designed for project notes, meeting records, document history, image handling, and markdown authoring in one place.

## What the app does

- Manage notes inside a configurable notes root folder.
- Organize work into projects and a root workspace.
- Edit Markdown in raw, split, preview, and web modes.
- Validate Markdown structure while you type.
- Check spelling and grammar in the editor.
- Insert common Markdown snippets from the toolbar.
- Browse and manage linked images.
- Open note files in VS Code or the system default app.
- Compare note history versions and restore context from older revisions.
- Preview Mermaid diagrams and rendered Markdown content.

## Editor features

### Markdown editing

The editor supports a focused Markdown workflow with:

- Raw editing for direct source changes.
- Split view for editor and preview side by side.
- Preview-only mode for read-only viewing.
- Web mode for richer rendered viewing.
- Line numbers and line jumping.
- Dirty-state tracking so unsaved changes are obvious.

### Toolbar actions

The Markdown toolbar includes quick insertion tools for:

- Headings
- Bold and italic text
- Lists
- Quotes
- Inline code
- Tables
- Links
- Document links
- Images
- Mermaid diagrams
- Validation panel access

The toolbar also includes quick-fix actions for common Markdown issues.

### Validation

Notely validates content in the editor using a background worker when available.

Validation currently covers:

- Markdown linting
- Table formatting checks
- Spell checking
- Grammar checking

The editor shows validation state in a banner and lets you jump to issue lines.

## Spell and grammar checking

Spell and grammar checking is part of the main editor experience.

### Spell checking

The spell checker is tuned for notes and markdown content:

- Checks plain text content while ignoring code blocks.
- Skips Mermaid blocks.
- Recognizes common English words.
- Allows common abbreviations and technical terms.
- Handles project-specific terms like TCL and Mithapur.

### Grammar checking

Grammar checking is powered through the LanguageTool API:

- Checks sentence structure and grammar suggestions.
- Runs asynchronously so it does not block typing.
- Falls back gracefully if the service is unavailable.
- Uses English US rules by default.

### Validation banner states

The banner communicates the current validation state:

- Checking
- No issues found
- Markdown issues
- Spelling issues
- Grammar issues
- Validation unavailable

## Notes and project management

Notely is built around a notes root folder and supports project organization.

- Choose a notes root folder.
- Switch between projects.
- Create notes within a project.
- Create project folders.
- Keep a root workspace for shared content.
- Load note lists from the current project scope.

## Preview and rendering

Rendered content supports richer note viewing:

- Markdown preview rendering
- Mermaid diagram rendering
- Embedded image resolution
- Web-style preview for selected notes
- Split preview sync with editor scrolling

## Media handling

The app includes a media tab for working with images:

- View linked images in a note.
- Browse all images in the notes folder.
- Add images to the notes library.
- Replace or delete images.
- Search, sort, and filter image assets.
- Detect missing linked files.

## Document history

Notely keeps a version history for notes:

- View previous versions.
- Compare the latest note to an older revision.
- Filter comparisons by whitespace or changes.
- Delete unwanted stored versions.
- Inspect raw and cleansed note content separately.

## Notes root and storage

The app stores its own workspace metadata inside the notes root folder.

Typical folders include:

- `.notes-app` for internal app data
- `versions` for saved history snapshots
- `images` for note-linked media
- Project folders for note sets

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

Windows packaging scripts are included in the repo:

- `npm run pack:win` builds an unpacked Windows app.
- `npm run dist:win` builds distributable Windows installers.
- `./build-windows-exe.sh` is available for the current packaging flow.

## Project structure

- `electron/` Electron main process and preload bridge
- `src/` React UI, editor, validation, and utilities
- `scripts/` packaging and release helpers
- `notes/` sample notes and workspace content
- `build/` app icons and build assets
- `release/` collected release outputs

## Notes on grammar checking

Grammar checks use an external API, so network access is required for the best results. If the grammar service is unavailable, the editor still keeps working and continues to show markdown and spell validation.

## License and ownership

This repository is maintained for Tata Chemicals Limited - Mithapur use.
