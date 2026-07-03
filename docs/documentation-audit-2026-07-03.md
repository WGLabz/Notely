# Notely Documentation Audit

Date: 2026-07-03

Status note:

- This audit is a point-in-time snapshot of repository and implementation alignment on 2026-07-03.
- Some findings in this report may have been addressed by subsequent documentation and shortcut updates after the audit was written.

Audited surfaces:

- README.md
- docs/
- in-app Help Center and Keyboard Shortcuts modal
- settings and microcopy surfaces in the renderer
- Electron menu structure and accelerators
- developer-facing docs present in the repository

Method:

- Code-first verification. No documentation statement was accepted without tracing it to the implementation.
- Sources of truth used for feature existence and naming were Electron menu actions, renderer action handlers, preload APIs, settings UI, and user-facing components.

Limitations:

- No repository screenshots were present in the audited documentation set, so screenshot accuracy could not be validated.
- This audit covers repository and in-app documentation only. It does not cover any external website, app store listing, or internal release portal.

## Executive Summary

Notely has a broad documentation set, but it is no longer internally consistent with the implementation. The docs cover many major features, yet several labels, shortcuts, settings descriptions, and help surfaces are stale or incomplete. The most serious problem is that keyboard guidance is split across multiple sources and does not match the implemented shortcut map. The second major problem is terminology drift: documentation still refers to "Notes Folder" and "Help -> Documentation" while the application exposes "Open Workspace" and "Help Center".

Overall documentation quality: 5.8/10

Estimated completeness: 72%

Estimated correctness: 54%

Highest-priority issues before end-user release:

1. Replace the hardcoded keyboard guide with an implementation-backed shortcut source and resolve conflicting bindings.
2. Update all user docs from "Notes Folder" and "Help -> Documentation" to the actual UI labels.
3. Document currently implemented but undocumented product surfaces: terminal, workspace activity, recent workspaces, favorites/dashboard, reference-note shortcuts, and several settings.
4. Add missing release notes/changelog and FAQ surfaces.
5. Correct stale AI and storage details in README and developer docs.

## Phase 1: Verified Feature Inventory

Verified major user-facing surfaces implemented in the codebase:

- Workspace selection and recent workspace reopening
- Note creation, folder creation, rename, remove-to-removed-folder, reload from disk
- Document list in tile and table modes with density controls
- Favorites, recent notes, continue-writing dashboard, task dashboard
- Markdown editing with Edit, Split, Preview, and Web modes
- Markdown validation, typo checking, quick fixes, find, and find/replace
- Outline panel and Focus Mode
- Global search with regex mode and code-block filtering
- Version history compare, restore, delete, and workspace activity history
- Media insertion, asset library, workspace health filters, preview, annotation, and original-image restore
- Screen capture for Windows with Auto Insert and Review Before Insert modes
- Mermaid and Excalidraw support, including image-to-Excalidraw conversion and restore-original flow
- AI settings, AI palette, AI chat, embedding generation, relationship graph, and pattern detection
- Workspace graph with semantic clustering freshness state
- P2P sync status, invites, trusted peers, conflicts, self-test, and key rotation
- Embedded terminal with shell selection
- Command palette with dynamic recent and sibling note commands
- Workspace zip export with raw, PDF, and web modes plus section-mode options
- Help Center, About dialog, and keyboard modal
- Theme, zoom, screen capture, terminal shell, density, view mode, and git metadata controls

Not implemented as end-user surfaces:

- Plugin or extension system
- Generic import workflow beyond opening an existing workspace and inserting media/reference assets
- Dedicated first-run wizard or tutorial
- Release notes viewer
- FAQ surface

## Documentation Coverage Matrix

Feature | Implemented | Documented | Accurate | Notes
--- | --- | --- | --- | ---
Workspace selection | Yes | Yes | Partial | Docs say "File -> Notes Folder"; app uses "Open Workspace".
Recent workspaces | Yes | No | No | Implemented in File -> Open Recent and dialog; not documented.
Create note | Yes | Yes | Yes | Covered in README and docs.
Create folder | Yes | Yes | Partial | Documented loosely; actual command/menu surface not fully described.
Rename note | Yes | Partial | Partial | Mentioned in feature reference only; shortcut and menu path omitted.
Remove note/folder to Removed | Yes | No | No | Implemented in menu and actions; undocumented workflow.
Tile/Table view | Yes | No | No | Implemented via View menu and command palette; absent from docs.
Density controls | Yes | No | No | Comfortable/Compact documented nowhere.
Favorites | Yes | No | No | Present in dashboard and list actions; undocumented.
Continue Writing / Recent Notes dashboard | Yes | No | No | Landing dashboard undocumented.
Markdown edit/split/preview/web modes | Yes | Yes | Mostly | Covered, but keyboard mode switching is undocumented.
Find in note | Yes | Yes | Yes | Docs reflect current behavior.
Find and replace | Yes | Partial | Partial | Exists, but Mac shortcut behavior is undocumented.
Outline | Yes | Yes | Partial | Docs omit conflict with reference-link shortcut and Focus mode limitation.
Focus Mode | Yes | Yes | Partial | Docs omit shortcut conflict with global search.
Global search | Yes | Yes | Mostly | Regex/code-block filtering documented well.
Version history | Yes | Yes | Mostly | Core flow documented; storage details drift in README.
Workspace activity | Yes | No | No | Implemented via Workspace menu and panel; undocumented.
Conflict Center | Yes | Partial | Partial | Sync conflict handling mentioned, dedicated panel/workflow not explained.
Media library / Workspace Health | Yes | Partial | Partial | Broadly covered; filters, cleanup behavior, and usage inspector under-documented.
Screen capture | Yes | Yes | Mostly | Good coverage, but menu/help terminology is stale.
Mermaid | Yes | Yes | Yes | Accurate at high level.
Excalidraw | Yes | Yes | Mostly | Core flow documented; some right-click and restore details are fragmented.
Reference note preview/link insertion | Yes | No | No | Implemented with shortcuts and toolbar; undocumented.
Command palette | Yes | Partial | Partial | Mentioned, but command inventory and personalization are undocumented.
AI settings | Yes | Yes | Partial | Docs do not match current provider list and model options.
AI palette / AI chat | Yes | Partial | Partial | Broadly described, but actual invocation and shortcut conflicts are inaccurate.
Workspace graph | Yes | Yes | Mostly | Core flow documented; refresh and freshness are covered.
P2P status / invites / peers | Yes | Yes | Partial | High-level guidance exists; panel tabs and workflows are undocumented.
Embedded terminal | Yes | No | No | Fully implemented, entirely undocumented for end users.
Workspace zip export | Yes | Yes | Partial | Export formats documented; section export modes are undocumented.
PDF export | Yes | Yes | Partial | Exists, but shortcut and some options are not documented.
Help Center / About | Yes | Yes | Partial | Docs use stale label "Documentation" instead of "Help Center".
Keyboard shortcuts guide | Yes | Yes | No | In-app modal is materially incomplete and inconsistent.
Theme | Yes | No | No | Implemented in Settings menu; undocumented.
Zoom | Yes | No | No | Implemented in View menu; undocumented.
Terminal shell selection | Yes | No | No | Implemented in View menu and terminal UI; undocumented.
Screen capture setting | Yes | Yes | Mostly | Documented accurately.
Auto-ignore .notes-app in Git | Yes | No | No | Implemented in document header; undocumented.

## README Audit

### What is correct

- Product purpose and overall scope are broadly accurate.
- Build, test, lint, and packaging command names in README match package.json.
- Help Center content is loaded from docs/ and exposed in-app.
- Workspace zip export exists with raw, PDF, and web output modes.

### What is inaccurate or incomplete

1. README mixes current and stale terminology.
   - User docs and README discuss a notes root / notes folder model, but the actual user-facing menu label is Open Workspace.
   - In-app help is exposed as Help Center, not Help -> Documentation.

2. Installation guidance is incomplete for end users.
   - No supported-OS matrix.
   - No end-user install instructions.
   - No prerequisites section.
   - No environment setup section for AI, signing, or terminal hardening beyond scattered later sections.

3. AI provider and model documentation is stale.
   - README lists HuggingFace as an end-user provider concept, but the visible text-provider UI exposes Gemini and Groq while OpenAI and Local LLM are marked unavailable/coming soon.
   - README model lists do not match the current AISettings provider arrays.

4. Storage details are partly stale.
   - README says `.notes-app/settings.json` stores workspace-level settings, but the implementation uses `.notes-app/app-state.json` and `.notes-app/app.sqlite` for metadata storage.

5. Several implemented features are missing from README.
   - Embedded terminal
   - Recent workspaces
   - Favorites and landing dashboard
   - Workspace activity panel
   - Reference note preview / insert-reference-link workflows
   - Theme, zoom, density, terminal shell, and git metadata controls

6. There are no screenshots.

### README verdict

- Coverage breadth: good
- Setup/install quality: weak
- Accuracy against current UI labels: weak
- Release-readiness for external users: not sufficient

## docs/ Folder Audit

### Strong areas

- Global search and regex coverage are relatively strong.
- Workspace export, screen capture, AI setup intent, graph clustering, and task panels are described at a usable high level.
- Troubleshooting contains relevant real workflows rather than placeholder advice.

### Systemic issues

1. Terminology drift across nearly every user doc.
   - "File -> Notes Folder" should be updated to Open Workspace.
   - "Help -> Documentation" should be updated to Help -> Help Center.

2. Documentation claims are spread across too many overlapping pages.
   - README, user-guide, feature-reference, top-tasks, and Help Center all repeat the same foundational workflows.
   - Keyboard references are split across docs/index.md, the keyboard modal, and actual code.

3. Several major product surfaces are under-documented or absent.
   - Terminal
   - Recent workspaces
   - Favorites/dashboard
   - Workspace activity
   - Conflict Center
   - Theme, zoom, density, terminal shell, git metadata controls
   - Reference-note commands

4. Top Tasks is no longer a "Top 15" page.
   - It now contains 23 numbered items, including 11b and 19b.
   - The title is obsolete.

5. Some docs describe workflows that are only partially true.
   - AI docs imply a cleaner provider surface than the actual UI exposes.
   - Some storage descriptions blur workspace metadata, note history, and app-state files.

### Per-document findings

docs/index.md

- Accurate that Help Center reads from docs/.
- Stale label usage: notes folder and Help/Documentation naming.
- Keyboard section is too small and omits most real shortcuts.

docs/user-guide.md

- Good high-level workflow sequencing.
- Stale workspace terminology.
- Omits recent workspaces, favorites, terminal, workspace activity, theme, zoom, density, and reference-note features.

docs/feature-reference.md

- Broadest end-user reference and the most valuable single page.
- Contains stale Help and workspace naming.
- Does not cover terminal, recent workspaces, favorites/dashboard, or git metadata controls.
- Under-documents settings and over-compresses platform differences.

docs/top-tasks.md

- Good procedural format.
- Title is obsolete.
- Uses stale menu labels.
- Omits several daily-use workflows that are more prominent in the UI than some included items.

docs/feature-availability.md

- Useful conceptually.
- Does not mention terminal or settings surfaces.
- AI setup distinctions are too simplified relative to the current UI.

docs/data-sync-security.md

- Good for high-level safety framing.
- Too light on actual storage specifics, backup expectations, and what P2P telemetry/conflicts look like.

docs/troubleshooting.md

- Useful, but missing troubleshooting topics for terminal, workspace export, recent workspaces, graph clustering freshness, and shortcut conflicts.

docs/ux-writing-guide.md

- Useful internal style guide.
- Not a user-facing doc.
- Should not be treated as part of user help coverage.

## Built-in Help Audit

Implemented help surfaces:

- Help Center modal backed by docs/
- Keyboard Shortcuts modal
- About dialog
- Start Here content in docs/index.md
- Empty states and inline titles/tooltips across components

Not implemented:

- Welcome screen
- Tutorial
- First-run wizard
- Tips carousel
- Contextual walkthroughs

Findings:

1. Help delivery architecture is sound.
   - Help metadata is hardcoded in the main process, while markdown body content is loaded from docs/.

2. Help naming is inconsistent.
   - UI says Help Center.
   - Multiple docs still say Help -> Documentation.

3. Built-in keyboard help is not trustworthy.
   - The modal contains only seven shortcuts.
   - The implementation contains many more menu and editor bindings.

4. First-run support is weak.
   - New users get a splash screen and empty states, but no guided onboarding.

5. Empty states and microcopy quality are generally decent.
   - Examples: DocumentList, DashboardPanels, TasksPanel, P2PStatusPanel, WorkspaceActivityPanel, MediaTab.
   - The product does provide inline guidance, but those surfaces are not covered in documentation strategy.

## Menu Documentation Audit

Documented well enough:

- New Note
- Versions
- Workspace Graph
- P2P Status
- AI Settings
- Screen Capture

Undocumented or under-documented menu items:

- Open Recent
- Move current folder to Removed
- Workspace Activity
- Show Terminal
- Terminal Shell: Auto / Bash / CMD
- Theme: System / Light / Dark
- Density controls
- Zoom In / Out / Reset
- Run Sync Self-Test
- Conflict Center
- Rotate Workspace Keys
- How Sync Works
- Generate Embeddings / Build Relationship Graph / Detect Patterns / Clear Cache
- Open in VS Code
- Open Website View
- Reload from Disk

## Settings Documentation Audit

Documented:

- AI settings, at a high level
- Screen Capture mode

Missing or incomplete:

- Theme preference
- Zoom factor
- Tile vs Table view mode
- Comfortable vs Compact density
- Terminal visibility and shell preference
- Typo Check toggle
- Auto-ignore `.notes-app` in `.gitignore`
- Workspace export section modes
- AI advanced generation controls: max tokens and temperature
- AI feature toggles: pattern learning, embeddings, relationship discovery

Documentation quality of settings descriptions: insufficient. The code exposes the controls, but the docs do not explain defaults, impact, or recommended usage for most of them.

## Workflow Documentation Audit

Well-covered workflows:

- Create note
- Edit markdown
- Find / replace
- Global search
- Version recovery
- Screen capture
- Mermaid / Excalidraw basics
- Workspace zip export
- Task review

Partially covered workflows:

- P2P sync pairing and conflict resolution
- AI setup and use
- Media cleanup and annotations
- PDF export

Missing workflows:

- Recent workspace reopening
- Workspace activity review
- Favorites and dashboard usage
- Terminal usage and shell switching
- Reference note preview and insert-reference-link flows
- Theme / density / zoom customization
- Remove-to-removed-folder and recovery expectations
- Git metadata handling for `.notes-app`

## Missing Documentation by Severity

### Critical

- Full keyboard shortcut inventory is missing and the current in-app guide is inaccurate.
- Actual shortcut conflicts are undocumented and unresolved.
- Core menu/help terminology is stale across user docs.

### High

- No changelog or release notes.
- No FAQ.
- Terminal feature undocumented.
- Settings coverage incomplete for theme, zoom, density, terminal shell, AI advanced settings, and git metadata controls.
- Recent workspaces and workspace activity undocumented.

### Medium

- Dashboard, favorites, and continue-writing surfaces undocumented.
- Conflict Center and sync self-test workflows undocumented.
- Workspace export section-mode options undocumented.
- Reference note preview/link insertion workflows undocumented.
- First-run onboarding is minimal and undocumented.

### Low

- Empty states and tooltip strategy are undocumented.
- Top Tasks title is stale.
- Some developer docs duplicate or overstate AI capabilities.

## Keyboard Shortcut Audit

### Key findings

1. The keyboard guide is incomplete.
   - The in-app modal shows 7 shortcuts.
   - The implementation exposes many more.

2. Three real conflicts exist in the current implementation.
   - Ctrl/Cmd+K is used for both Command Palette and Open AI Palette.
   - Ctrl/Cmd+Shift+F is used for both Global Search and Focus Mode.
   - Ctrl/Cmd+Shift+L is used for both Show Outline and Insert Reference Link.

3. Platform behavior is not documented.
   - Find and Replace has a Ctrl/Cmd+H accelerator only on non-macOS in the app menu.

### Shortcut table

Shortcut | Action | Where it works | Scope / conditions | Documented? | Notes
--- | --- | --- | --- | --- | ---
Ctrl/Cmd+K | Open Command Palette | Global renderer | Window-level keydown | Partial | Documented, but conflicts with AI Palette menu accelerator.
Ctrl/Cmd+K | Open AI Palette | Document screen menu | Electron menu accelerator | No | Conflicts with Command Palette.
Ctrl/Cmd+Shift+F | Open Global Search | Global renderer | Window-level keydown | Partial | Documented in keyboard modal, but conflicts with Focus Mode.
Ctrl/Cmd+Shift+F | Toggle Focus Mode | Document editor | Window-level keydown and View menu | Partial | Documented as menu workflow, not as conflicting shortcut.
Ctrl/Cmd+/ | Open Keyboard Shortcuts | Global | Window-level keydown and Help menu | Yes | One of the few consistent shortcuts.
F1 | Open Help Center | Global | Help menu accelerator | Partial | Docs still say Help -> Documentation.
Ctrl/Cmd+N | New Note | Landing and document | File menu and command palette | Yes | Accurate.
Ctrl/Cmd+Shift+N | Open Workspace | Landing and document | File menu and command palette | No | Docs still describe File -> Notes Folder.
Ctrl/Cmd+S | Save current note | Document | File menu and editor keydown | Partial | Exists, but not consistently documented in user docs.
Ctrl/Cmd+Shift+E | Export PDF | Document | File menu | No | User docs mention note PDF export, not the shortcut.
Ctrl/Cmd+Shift+E | Export Workspace as Zip | Landing | File menu | No | Export workflow documented, shortcut not.
Ctrl/Cmd+Shift+H | Versions | Document | File menu | Yes | Accurate.
Ctrl/Cmd+Shift+O | Open in VS Code | Document | File menu | No | Undocumented.
Ctrl/Cmd+Shift+W | Open Website View | Landing and document | File menu | No | Undocumented.
F2 | Rename Note | Document | File menu | No | Undocumented.
Ctrl/Cmd+Shift+R | Reload from Disk | Document | File menu | No | Undocumented.
Ctrl/Cmd+Delete | Move Note to Removed | Document | File menu | No | Undocumented.
Ctrl/Cmd+Shift+Delete | Move Folder to Removed | Landing | File menu | No | Undocumented.
Esc | Back to Notes | Document | File menu | Partial | Behavior exists, but docs do not describe it.
Ctrl/Cmd+F | Find in Current Note | Document | Edit menu, CodeMirror keymap, editor hook | Yes | Accurate.
Ctrl/Cmd+H | Find and Replace | Document | Edit menu, non-macOS accelerator | Partial | Keyboard modal incorrectly implies universal availability.
Ctrl/Cmd+Shift+L | Show Outline | Document | View menu accelerator | Partial | Conflicts with Insert Reference Link.
Ctrl/Cmd+Shift+L | Insert Reference Link | Document | Toolbar document keydown | No | Undocumented and conflicts with Show Outline.
Ctrl/Cmd+Shift+K | Open Reference Note | Document | Toolbar document keydown | No | Undocumented.
Ctrl/Cmd+Shift+S | Capture Screen Area | Document | Toolbar document keydown | Yes | Documented procedurally, not in keyboard guide.
Ctrl/Cmd+Z | Undo | Document | CodeMirror keymap and editor hook | No | Visible in tooltips, undocumented in guide.
Ctrl/Cmd+Y | Redo | Document | CodeMirror keymap and editor hook | No | Visible in tooltips, undocumented in guide.
Ctrl/Cmd+Shift+Z | Redo | Document | CodeMirror keymap | No | Undocumented.
Ctrl/Cmd+\\ | Split Preview | Document | View menu and editor hook | No | Undocumented shortcut.
Ctrl/Cmd+1 | Tile Notes | Landing | View menu | No | Context-specific landing shortcut.
Ctrl/Cmd+2 | Table Notes | Landing | View menu | No | Context-specific landing shortcut.
Ctrl/Cmd+3 | Comfortable Density | Landing | View menu | No | Context-specific landing shortcut.
Ctrl/Cmd+4 | Compact Density | Landing | View menu | No | Context-specific landing shortcut.
Ctrl/Cmd+1 | Edit Mode | Document | Editor hook | No | Context-specific document shortcut.
Ctrl/Cmd+2 | Split Mode | Document | Editor hook | No | Context-specific document shortcut.
Ctrl/Cmd+3 | Preview Mode | Document | Editor hook | No | Context-specific document shortcut.
Ctrl/Cmd+= | Zoom In | Landing and document | View menu | No | Undocumented.
Ctrl/Cmd+- | Zoom Out | Landing and document | View menu | No | Undocumented.
Ctrl/Cmd+0 | Reset Zoom | Landing and document | View menu | No | Undocumented.
Ctrl/Cmd+Shift+P | Open P2P Status | Global | P2P menu | No | Undocumented shortcut.
Ctrl/Cmd+Shift+, | Open AI Settings | Global | AI menu | No | Undocumented shortcut.
Ctrl/Cmd+Shift+G | Open Workspace Graph | Global | Workspace menu | No | Workflow documented, shortcut not.
Ctrl/Cmd+Shift+A | Open Workspace Activity | Landing and document | File or Workspace menu | No | Undocumented.
Enter | Next find match | Find panel | Find UI only | No | Tooltip only.
Shift+Enter | Previous find match | Find panel | Find UI only | No | Tooltip only.
ContextMenu or Shift+F10 | Open preview context menu | Markdown preview | Preview surface only | No | Accessibility-oriented shortcut, undocumented.
Plus | Zoom image in | Media preview | Image preview only | No | Undocumented.
Minus | Zoom image out | Media preview | Image preview only | No | Undocumented.
1 or 0 | Reset image zoom | Media preview | Image preview only | No | Undocumented.

## Inconsistencies

1. Code vs docs: workspace naming
   - Docs repeatedly say File -> Notes Folder.
   - UI/menu uses Open Workspace.

2. Code vs docs: help naming
   - Docs say Help -> Documentation.
   - UI/menu uses Help Center.

3. Code vs in-app keyboard guide
   - KeyboardShortcutsModal shows only seven shortcuts.
   - Menu and editor implement many more.

4. Code vs code: shortcut ownership conflicts
   - Ctrl/Cmd+K
   - Ctrl/Cmd+Shift+F
   - Ctrl/Cmd+Shift+L

5. Code vs README/docs: AI providers and models
   - README and AI README overstate available provider surface.
   - AISettings marks OpenAI and Local as unavailable / coming soon.

6. Code vs README: storage details
   - README references `.notes-app/settings.json`.
   - Metadata storage uses `.notes-app/app-state.json` and `.notes-app/app.sqlite`.

7. Code vs docs: menu surface coverage
   - Recent workspaces, terminal, workspace activity, theme, zoom, density, git metadata status, and reference-note flows exist but are not documented.

## Obsolete Documentation

- docs/top-tasks.md title: no longer "Top 15"
- docs/index.md: stale notes-folder and Help/Documentation terminology
- docs/user-guide.md: stale notes-folder and Help/Documentation terminology
- docs/feature-reference.md: stale Help/Documentation terminology and stale notes-folder terminology
- docs/top-tasks.md: stale Help/Documentation terminology and stale notes-folder terminology
- docs/troubleshooting.md: stale notes-folder terminology
- README.md: storage details partially stale; AI/provider details partially stale; setup/install guidance incomplete
- src/ai/README.md: overstates available providers and uses Cmd+K AI palette guidance that conflicts with current app behavior

## Documentation Quality Review

Category | Score (1-10) | Notes
--- | --- | ---
Completeness | 7 | Broad feature coverage exists, but several implemented surfaces are missing.
Correctness | 5 | Too many stale labels and shortcut mismatches.
Consistency | 4 | Terminology and shortcut references are fragmented.
Readability | 8 | Most docs are easy to read.
Navigation | 7 | Help Center structure is usable.
Discoverability | 5 | Important features exist without docs or guided discovery.
Onboarding quality | 4 | Splash + Start Here is not enough for first-time users.
Troubleshooting quality | 6 | Useful but incomplete.
Searchability | 7 | docs/ pages are topic-based and searchable.

## End-User Perspective

Can a new user install it?

- Not confidently from current docs. There is no end-user installation guide or platform support section.

Can they understand the UI?

- Partially. The docs explain the major note-editing model, but the actual menu and settings labels do not line up with the guide.

Can they discover features?

- Only partially. The command palette, terminal, workspace activity, recent workspaces, favorites, and several settings are easy to miss.

Can they recover from mistakes?

- Better than average for notes and media. Version history, removed-folder flow, and image restore exist. Documentation of all recovery paths does not.

Can they learn shortcuts?

- No. The keyboard guide is materially incomplete and current shortcuts conflict.

Can they understand settings?

- Only AI and screen capture at a high level. Most other settings are undocumented.

Can they troubleshoot issues?

- Some common cases yes, but not terminal, recent workspace, export, graph freshness, or shortcut conflicts.

Can they use advanced functionality?

- Only after experimentation. P2P, AI tuning, terminal, graph refresh, and workspace export options need stronger docs.

## Suggested Improvements

### 1. Critical fixes

- Resolve the three shortcut conflicts in implementation.
- Generate the keyboard guide from the actual command/accelerator map.
- Replace all stale menu labels in README and docs.

### 2. High-value additions

- Add release notes / changelog.
- Add FAQ.
- Add end-user installation and supported-platform guide.
- Add settings reference page.

### 3. UX improvements

- Add a first-run onboarding sheet or setup checklist in-app.
- Add contextual help for terminal, recent workspaces, workspace activity, and reference-note workflows.

### 4. Documentation restructuring

- Reduce duplication across README, user-guide, feature-reference, and top-tasks.
- Keep README external-facing and concise.
- Keep docs/ as the canonical in-app help set.

### 5. Navigation improvements

- Add a dedicated shortcut reference page in docs/.
- Add a settings reference page in docs/.
- Add an advanced workflows page for P2P, AI, terminal, and export.

### 6. Onboarding enhancements

- Replace "Start Here" with a real first-run path that includes opening a workspace, creating a note, editing, searching, and recovery.

### 7. Help system improvements

- Rename all doc references to Help Center.
- Surface missing workflows directly from related panels.

### 8. Keyboard guide improvements

- Show scope, platform notes, and conflicts.
- Split global, editor, media preview, and context-menu shortcuts.
- Include only real bindings, not aspirational ones.

## Final Scorecard

Surface | Score (1-10)
--- | ---
README | 6
User Guide | 6
Help System | 6
Keyboard Guide | 2
Setup Instructions | 4
Troubleshooting | 6
API / Developer Docs | 5
Consistency | 4
Completeness | 7
Overall Documentation Quality | 5.8

## Release-Readiness Roadmap

Before releasing Notely broadly to end users, complete this sequence:

1. Fix shortcut conflicts in code and replace the hardcoded keyboard modal with generated data.
2. Normalize all docs to current UI terminology: Open Workspace, Help Center, Help -> Keyboard Shortcuts.
3. Publish a real install/setup guide and a changelog.
4. Add missing documentation for terminal, workspace activity, recent workspaces, dashboard/favorites, settings, and reference-note workflows.
5. Update AI and storage documentation to match the current implementation exactly.
6. Add lightweight first-run onboarding and link it from the landing empty state and Help Center.

If those six items are completed, documentation quality would move from internal-tooling grade to a credible end-user release baseline.