# Notely Feature Reference

This page explains every major user-facing feature in Notely.

## 1. Notes and Workspace

### Notes folder selection

Use **File -> Notes Folder** to choose where your notes are stored.

### Project-aware workspace

Notely supports project scoping so you can keep notes organized by project while still using a shared root workspace.

### Note and folder creation

- Create notes from **File -> New Note** (`Ctrl/Cmd + N`).
- Create folders to group related notes.
- Rename and delete notes from list actions.

## 2. Editor and Writing Experience

### Multiple edit modes

- **Edit**: write markdown source.
- **Split**: source and preview side-by-side.
- **Preview**: read-only rendered output.
- **Web Preview**: richer rendering for selected notes.

### Markdown toolbar

Quick insert actions for headings, emphasis, lists, links, tables, diagrams, and validation.

### Find and replace

Search inside the current note and jump through results quickly.

### Outline navigation

Use **View -> Show Outline** to jump between sections in long notes.

### Focus mode

Use **View -> Focus Mode** to reduce visual distractions.

## 3. Quality and Validation

### Markdown validation

Notely reports markdown issues while you edit.

### Typo checking

Spell and typo checks are integrated into the editor with ignore options for accepted words.

### Fix-focused workflow

Validation issues are listed with quick navigation to affected lines.

## 4. Search and Discovery

### Global search

Search by title, path, metadata, and note content.

### Content snippets

Search results show match context so you can confirm relevance before opening.

### Workspace graph

Open **Workspace -> Workspace Graph** to visualize notes and media relationships.

Graph capabilities include:

- Visual note-to-note link mapping
- Media node visibility (images, videos, PDFs, and more)
- Interactive zoom, pan, and drag
- Mini-map for large workspaces

When embeddings are enabled, the graph can also show semantic clusters of related notes.

## 5. Version History and Recovery

### Version snapshots

Notely stores historical versions of notes to support recovery.

### Compare and restore

Open **File -> Versions** (`Ctrl/Cmd + Shift + H`) to compare current and previous versions, then restore when needed.

## 6. Media Management

### Image and file linking

Insert local media and linked files from note workflows.

### Media actions

Rename, replace, annotate, and open media in default apps.

### Media preview tools

Use zoom and media-aware preview controls to inspect assets.

### Workspace Health media checks

Notely helps detect and manage:

- Missing linked files
- Duplicate media
- Unused media
- Preview failures

You can inspect usage and run cleanup actions, including bulk delete for unused assets.

### Image annotation and lifecycle

Image annotations are stored as metadata (not burned into pixels), so notes remain editable and cleaner over time.

Notely also preserves metadata behavior across replace, rename, and delete actions.

### Original image backup and restore

Before first edit, Notely stores an original image backup and allows restoring it later.

This helps recover from aggressive crops or accidental edits.

## 7. Diagram Features

### Mermaid diagrams

- Insert Mermaid blocks from the toolbar.
- Write Mermaid syntax in markdown.
- Render in preview modes.

### Excalidraw diagrams

- Insert Excalidraw diagrams in notes.
- Edit visually and save.
- Re-open diagrams from preview for updates.

## 8. AI Assistance

### AI settings

Configure providers and API keys in **AI -> AI Settings**.

Supported provider setup types:

- Text generation providers (for chat and writing assistance)
- Embedding providers (for semantic and relationship features)

### AI chat and commands

Use AI for writing support, note understanding, and quick content actions.

### Semantic features

When embeddings are enabled, Notely supports semantic search, relationship analysis, and pattern detection.

### Provider capabilities and model selection

Provider capabilities are not identical. Some providers support text generation only, while others also support embeddings.

Notely shows capability warnings in settings when a selected provider cannot run a feature.

You can also choose provider models directly in AI settings.

### AI operation feedback

Long-running AI actions show in-progress and completion feedback so users know what is happening.

### Embedding freshness indicators

Notely tracks embedding freshness and shows staleness indicators in graph workflows.

## 9. Peer-to-Peer Sync

### Discovery and pairing

Pair trusted peers using invite codes from **P2P -> P2P Status**.

### Sync status and conflicts

Monitor sync progress and resolve conflicts with built-in conflict tools.

### Security controls

Workspace trust and key policies help keep collaboration safe.

## 10. Help and Product Info

### Documentation

Open **Help -> Documentation** (`F1`) for in-app help.

### Keyboard shortcuts

Open **Help -> Keyboard Shortcuts** (`Ctrl/Cmd + /`).

### About dialog

Open **Help -> About Notely** to view app identity and version information.

## 11. Preview and Export

### Web preview

Use Web Preview for richer rendered note viewing with media and diagram support.

### PDF export

Export notes to PDF using the same workspace-aware rendering pipeline.

PDF workflows support image quality behavior and preserve annotation overlays in exported output.

### Website-style rendering

Website output uses the same content pipeline so rendered notes stay consistent across preview and export surfaces.
