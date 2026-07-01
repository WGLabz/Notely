# Notely

Notely is a desktop Markdown notes app for team and project workspaces. It is built with Electron + React and is designed for project notes, meeting records, document history, image handling, and markdown authoring in one place.

## What the app does

- Manage notes inside a configurable notes root folder.
- Organize work into projects and a root workspace.
- Edit Markdown in raw, split, preview, and web modes.
- Validate Markdown structure while you type.
- Check typos in the editor.
- Search notes by title, metadata, path, and in-file content with match previews.
- Insert common Markdown snippets from the toolbar.
- Browse, annotate, optimize, and manage linked media.
- Open note files in VS Code or the system default app.
- Compare note history versions and restore context from older revisions.
- Preview Mermaid diagrams and rendered Markdown content.
- Visualise the workspace as an interactive note graph.
- Use built-in AI features powered by Gemini or Groq for chat, queries, and semantic search.

## In-app Help Center

Notely includes built-in user documentation in the app menu:

- Open **Help -> Help Center** (or press `F1`) to view app usage guidance directly in the app.
- Open **Help -> Keyboard Shortcuts** for shortcut references.
- Open **Help -> About Notely** to view a dedicated About dialog with product identity and build information.

The Help Center includes quick start, core features, shortcuts, and storage/versioning notes so users do not need to leave the app to find documentation.
The Help Center now reads its content directly from the repository `docs/` folder so in-app and repository documentation stay aligned.

## Documentation set

Project documentation is organized under `docs/` for maintainability and professional handoff:

- `docs/index.md` documentation entry point
- `docs/user-guide.md` end-user workflows and procedures
- `docs/data-sync-security.md` data storage, sync, and privacy guidance
- `docs/feature-reference.md` complete end-user feature reference
- `docs/top-tasks.md` quick task-oriented workflows
- `docs/feature-availability.md` setup and connectivity requirements
- `docs/versioning-release.md` versioning and release process
- `docs/troubleshooting.md` troubleshooting and common issue fixes

## Workspace Graph

Open **Workspace → Workspace Graph** (`Ctrl+Shift+G`) to visualise all notes and media in the active workspace as an interactive node-edge graph.

- Nodes represent Markdown notes (`.md` files, coloured by folder) and media files (with dashed borders).
- Edges represent explicit document links (`[[wiki links]]` and `[text](./file.md)`) and media references (images embedded in notes).
- Media nodes (images, videos, PDFs, etc.) are visually distinct and marked with a 📎 icon.
- Click a node to highlight its connections.
- Double-click a note node to open that note directly (media nodes cannot be opened this way).
- Filter visible nodes by title or folder using the search bar.
- Zoom, pan, and drag nodes freely.
- A mini-map provides orientation in large workspaces.

### Supported media formats

The graph automatically discovers and displays these media types:

- **Images**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico`
- **Video**: `.mp4`, `.webm`, `.mov`
- **Audio**: `.mp3`, `.wav`, `.m4a`
- **Documents**: `.pdf`

### Semantic clustering

When embeddings are enabled (HuggingFace token configured), the workspace graph automatically detects semantic clusters of semantically-related notes:

- Cluster backgrounds (dashed borders) group notes with similar meaning.
- Clustering uses cosine similarity (0.65 threshold) to identify meaningful topic groups.
- Results are cached for 7 days to avoid unnecessary recomputation.
- Click the **Refresh** button in the graph header to recompute clustering immediately.
- The header displays embedding freshness: "Fresh" (≤7 days) or "3d ago" (staleness indicator).
- If embeddings are unavailable, the graph displays only explicit document links.

## AI features

### Providers

Notely supports pluggable AI providers. Configure them in **AI → AI Settings**.

| Provider | Purpose | Cost |
|---|---|---|
| Google Gemini | Text generation + embeddings | Free tier / API key |
| Groq | Fast text generation (llama-3, gemma, mixtral) | Free tier / API key |
| HuggingFace | Embeddings only (semantic search, graph) | Free tier / API token |

Embeddings (HuggingFace) and text generation (Gemini or Groq) are independent — both can run simultaneously regardless of which text provider is active.

### Model selection

Each text provider exposes a model dropdown in AI Settings:

- **Gemini**: Flash 2.0 (default), Flash 2.0 Lite, 1.5 Pro, 1.5 Flash
- **Groq**: Llama 3.3 70B (default), Llama 3 8B, Gemma 2 9B, Mixtral 8×7B

The selected model is persisted per provider and applied on every app start.

### AI capabilities

- **AI Chat** — ask questions about your notes with full workspace context.
- **AI Palette** — quick inline AI actions from inside the editor (`Ctrl+K`).
- **Semantic search** — find notes by meaning rather than exact keyword match (requires HuggingFace token).
- **Relationship graph** — discover semantic connections between notes using embeddings.
- **Pattern detection** — surface recurring themes and writing habits across the workspace.
- **Embedding generation** — index the workspace for similarity-based retrieval.

### Provider capabilities and warnings

Not all providers support all AI capabilities. AISettings displays warnings when a selected provider lacks required features:

| Provider | Text Generation | Embeddings | Semantic Search | Relationships | Patterns |
|---|---|---|---|---|---|
| **Google Gemini** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Groq** | ✓ | ✗ | ✗ | ✗ | ✓ |

- **Groq** shows warnings: "Semantic search unavailable" and "Relationship discovery disabled" because it doesn't support embeddings.
- **Gemini** supports all features and shows no warnings.
- Warnings appear in the AI Settings dialog and help you choose the right provider for your use case.

### Embedding staleness tracking

Notely tracks when embeddings were last generated and how many documents existed at that time:

- Each time you generate embeddings, a timestamp and document count are saved.
- The workspace graph header shows embedding freshness: "Fresh" for embeddings ≤7 days old, or "3d ago", "5d ago", etc. for older embeddings.
- Staleness information persists across app restarts.
- The **Refresh** button in the graph header allows you to regenerate embeddings on demand.

### Immediate feedback for operations

Long-running AI operations show immediate feedback so you know something is happening:

- **Generate Embeddings** → "Generating embeddings..." → "Embeddings generated successfully!"
- **Build Relationship Graph** → "Building relationship graph..." → "Relationship graph built successfully!"
- **Detect Patterns** → "Detecting patterns..." → "Patterns detected successfully!"
- **Clear AI Cache** → "Clearing AI cache..." → "AI cache cleared successfully!"

Each operation displays an "in progress" toast message immediately, followed by a success or error message when complete.

### AI architecture

The AI system uses a layered, provider-agnostic design:

- `HttpClient` — shared retry and backoff logic used by all providers.
- `OpenAICompatibleProvider` — reusable base class for any OpenAI-format API (Groq, future OpenAI, OpenRouter).
- `providerRegistry` — single source of truth for provider metadata, model lists, capabilities, and factories. Adding a new provider requires only one entry here.
- `EmbeddingService` — decoupled from the text provider; receives a dedicated embedding provider so embeddings work independently of which LLM is active.
- `SemanticClusteringService` — analyzes document embeddings using cosine similarity and union-find clustering (0.65 threshold) to discover semantic relationships at scale.
- `SemanticGraphCache` — persists clustering results with 7-day TTL to avoid expensive recomputation on every graph load.

## Editor features

### Markdown editing

The editor supports a focused Markdown workflow with:

- Raw editing for direct source changes.
- Split view for editor and preview side by side.
- Preview-only mode for read-only viewing.
- Web mode for richer rendered viewing.
- Line numbers and line jumping.
- Source-line based scroll sync in split view, with a linked or independent scroll toggle.
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
- Typo checking

The editor shows validation state in a banner and lets you jump to issue lines.

## Typo checking

Typo checking is part of the main editor experience.

The typo checker is tuned for notes and markdown content:

- Checks plain text content while ignoring code blocks.
- Skips Mermaid blocks.
- Uses a Hunspell dictionary via `nspell`.
- Supports domain and project terms used across engineering notes.
- Persists ignored words per workspace.
- Supports right-click `Ignore word` directly from typo highlights in the editor.

### Validation banner states

The banner communicates the current validation state:

- Checking
- No issues found
- Markdown issues
- Typo issues
- Validation unavailable

## Search experience

Search now supports note content discovery, not only filenames and metadata.

- Landing/list search matches note content (`header`, `raw`, and `cleansed` sections).
- Global search includes content matches across notes.
- Results show where the match was found (title, path, metadata, content).
- Results include a context snippet so you can see the matched phrase before opening.

## Notes and project management

Notely is built around a notes root folder and supports project organization.

- Choose a notes root folder.
- Switch between projects.
- Create notes within a project.
- Create project folders.
- Keep a root workspace for shared content.
- Load note lists from the current project scope.
- Add tags in note metadata for easier organization.
- See small note/folder image previews in workspace lists when notes use media.

## Preview and rendering

Rendered content supports richer note viewing:

- Markdown preview rendering
- Mermaid diagram rendering
- Excalidraw diagram rendering with click-to-edit support
- Embedded image resolution
- Web-style preview for selected notes
- Split preview sync with editor scrolling
- Image filename overlays so embedded media can be identified from preview.
- Right-click image actions, including view image, edit image, replace, rename, copy markdown, and delete.

### Excalidraw diagram workflow

Excalidraw diagrams are stored as file-based assets so they remain offline-first and Git-friendly.

- Markdown stores a relative PNG image reference with Excalidraw metadata.
- Notely preview renders the PNG and opens the editor when clicked.
- On save, Notely writes both source JSON and rendered PNG.
- GitHub displays diagrams natively from the PNG path.

Example markdown reference:

```markdown
![Excalidraw Diagram](excali-diagrams/diagram-id/diagram.png){data-diagram-id="diagram-id" data-diagram-type="excalidraw"}
```

Diagram files are stored alongside the note under `excali-diagrams/`:

```text
my-note.md
excali-diagrams/
  diagram-id/
    diagram.excalidraw
    diagram.png
```

Renderer-side helpers are exposed from `src/services/diagramService.js` and path/reference helpers are in `src/utils/diagramFileUtils.js`.

## Media handling

The app includes a media tab for working with images and other media files:

- View linked media in a note.
- Browse media in the note folder and workspace-level media library.
- Choose whether newly added media is saved beside the note or in the workspace library.
- Add, preview, replace, delete, and copy markdown for media assets.
- Search, sort, and filter media by usage, type, missing files, duplicates, preview failures, or annotations.
- Inspect which notes reference a media file.
- Detect missing linked files, duplicate names, unused media, and preview failures in Workspace Health.
- Delete unused media in bulk when Workspace Health identifies it.
- Delete images safely: referenced images have links removed, while unreferenced images are moved out of the active image library.
- View annotation badges and snippets on annotated media cards.
- Clear an image annotation directly from the media card.

### Image editing and annotations

Images use a shared editor popup across preview and media views.

- Crop images using free or preset aspect ratios.
- Rotate images from 0 to 360 degrees.
- Store downsampled thumbnails for fast in-app rendering.
- Keep original images for image editing, website view, downloads, and full-quality export.
- Add editable image annotations without writing text into the image pixels.
- Store annotation metadata in `.notes-app/image-annotations.json` inside the notes root.
- Show annotations as top overlays so they do not conflict with the filename overlay at the bottom.
- Preserve annotation metadata when images are replaced, rename annotation metadata when images are renamed, and remove annotation metadata when images are deleted.
- Render annotations in markdown preview, media preview, website preview, and PDF export output.

### Image viewing and zoom controls

The image preview shows full HD (original) image resolution by default.

- **Zoom controls**: Use toolbar buttons to zoom in/out or reset to 100% (zoom range 50% to 300%).
- **Keyboard shortcuts**: Press `+` to zoom in, `-` to zoom out, or `1`/`0` to reset zoom.
- **Mouse wheel zoom**: Scroll up to zoom in, down to zoom out for quick magnification.
- **Drag to pan**: Click and drag when zoomed to move the image around (shows grab cursor).
- **Double-click reset**: Double-click to reset zoom and pan position to default.
- **Zoom indicator**: Visual zoom level display (e.g., "150%") in the controls bar.
- **Smooth transitions**: Transitions with smooth easing for responsive feel during zoom and pan interactions.

### Image backup and restoration

Notely preserves original images before edits and allows restoring them at any time.

- **Original backup**: When you first edit an image (crop, rotate, annotate), the original is automatically backed up to `.notes-app/image-originals/`.
- **Original indicator**: Images with backups display an "Original" badge in the media library and preview.
- **Restore original**: Click the "Restore Original" button in the image editor to revert to the backed-up version.
- **Cleanup**: Original backups are automatically removed when the image is deleted, keeping the workspace tidy.
- **Rename support**: Original backups follow the image when it is renamed, maintaining the backup relationship.

### PDF and website export

PDF and website output are generated from the same workspace-aware rendering pipeline used by the app.

- Export notes as PDFs from raw or cleansed note sections.
- Choose PDF image quality behavior, including full-quality or downsampled image output.
- Remember the last successful PDF export path for the next export.
- Render editable image annotations in exported PDF and website preview HTML.
- Use original image assets in website view so full-resolution media remains available outside the editor preview.

## Document history

Notely keeps a version history for notes:

- View previous versions.
- Compare the latest note to an older revision.
- Filter comparisons by whitespace or changes.
- Delete unwanted stored versions.
- Inspect raw and cleansed note content separately.
- Restore a selected version into the editor.
- Reduce unnecessary version growth by avoiding duplicate snapshots and pruning older history.

## Notes root and storage

The app stores its own workspace metadata inside the notes root folder.

Typical folders include:

- `.notes-app` for internal app data
- `versions` for saved history snapshots
- `images` for note-linked media
- `images/thumbnails` for generated downsampled image previews
- Project folders for note sets

Notely metadata files include:

- `.notes-app/image-annotations.json` for editable image annotation overlays
- `.notes-app/settings.json` for workspace-level app settings such as the last PDF export path

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

### Build versioning

Notely build versions are generated as:

- `major.minor.patch-commitHash`

Where:

- `major`, `minor`, and `patch` are read from `app-version.json`.
- `commitHash` is the latest short commit hash from `master` (fallback: `origin/master`, then `HEAD`).

Version files and scripts:

- `app-version.json` source of truth for semantic version numbers.
- `scripts/generate-app-version.cjs` generates build metadata.
- `electron/app-version.generated.json` generated version payload used by app/runtime.

Commands:

- `npm run version:generate` generates/refreshes version metadata.
- `npm run dev` and `npm run build` automatically regenerate version metadata.
- Windows packaging (`pack:win`, `dist:win`) injects generated version metadata into Electron Builder so packaged app version surfaces the hash.

### Windows code-signing strategy

Notely uses `electron-builder` certificate-based signing for Windows outputs.

- Preferred: PFX-based signing via environment variables:
  - `CSC_LINK` (path or base64/data URL to a `.pfx` certificate)
  - `CSC_KEY_PASSWORD` (password for the certificate)
- Alternative: system certificate store identity:
  - `CSC_NAME` (certificate subject name)

For Azure Trusted Signing workflows, provide your Azure signing environment variables in CI/runner configuration.

Before publishing binaries, verify:

- signing material is configured in the build environment
- signed artifacts validate in Windows file properties and `signtool verify`

The packaging wrapper emits a warning when Windows build commands run without obvious signing material.

### Embedded terminal hardening options

The embedded terminal supports stricter runtime controls through environment variables:

- `NOTELY_TERMINAL_REQUIRED_ROLE` (default: `developer`)
  - Renderer must request this role to create a session.
- `NOTELY_TERMINAL_POLICY`
  - `permissive` (default): no command filtering
  - `strict`: commands are checked against allowlist on each submitted line
- `NOTELY_TERMINAL_ALLOWLIST`
  - Comma-separated command names allowed in strict mode
  - Example: `pwd,ls,dir,cat,type,git,node,npm`

If strict mode is enabled and a command is not allowed, it is blocked in-session.

## Project structure

- `electron/` Electron main process and preload bridge
- `src/` React UI, editor, validation, and utilities
- `scripts/` packaging and release helpers
- `notes/` sample notes and workspace content
- `build/` app icons and build assets
- `release/` collected release outputs

## License and ownership

This repository is maintained for Notely use.
