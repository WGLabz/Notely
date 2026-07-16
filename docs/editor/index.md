---
title: Editor Overview
description: Learn the edit modes, status bar, breadcrumbs, and copy/export actions in the Notely editor.
keywords: editor, edit mode, split view, preview, status bar, breadcrumbs, word count
category: Editor
---

# Editor Overview

The Notely editor is the primary workspace for writing and reviewing Markdown notes. It supports four view modes, a rich toolbar, real-time validation, and statistics.

## View Modes

Switch modes using the mode buttons in the editor header bar.

| Mode | Description |
|---|---|
| **Edit** | Raw Markdown source editor with syntax highlighting and completions |
| **Split** | Editor on the left, live rendered preview on the right |
| **Preview** | Full-width read-only rendered output |
| **Web** | Website-style rendering — higher-fidelity preview with full media support |

::: tip Split Mode for Writing
Split mode is the most productive mode for writing. You can edit Markdown on the left while watching the formatted output update in real time on the right.
:::

## Status Bar

The status bar at the bottom of the editor shows live document statistics:

| Stat | Description |
|---|---|
| **Word count** | Live count of words in the current content |
| **Line count** | Total lines in the document |
| **Reading time** | Estimated reading time (calculated at 200 wpm) |

Statistics update independently when switching between Edit and other modes.

## Breadcrumbs

The breadcrumb trail in the editor header shows the full folder path to the current note.

- Click any breadcrumb segment to navigate to that folder.
- Updates automatically when you switch notes.
- Useful when working in deeply nested folder structures.

## Copy and Export Actions

From the editor toolbar you can export note content without leaving the app:

| Action | Output |
|---|---|
| **Copy as HTML** | Formatted HTML — paste into email clients, Notion, or CMS systems |
| **Copy as Plain Text** | Plain text without Markdown syntax |

Both actions show a success notification and copy to the clipboard.

## Validation Indicators

Notely checks your Markdown as you write:

- **Markdown validation** — flags structural issues (unclosed tables, bad heading levels, etc.)
- **Typo checking** — underlines suspected spelling errors in prose (skips code blocks). Right-click any flagged word to ignore it or add it to your custom spelling dictionary.
- **Custom spelling dictionary** — manage custom spelling dictionary words via the settings menu or the command palette (under "Manage Spelling Dictionary").

When issues are found, a badge appears in the editor header. Click it to jump to the first problem.

→ [Typo and Validation Settings](/settings-reference#typo-check)

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| New Note | `Ctrl + N` |
| Find in note | `Ctrl + F` |
| Find and Replace | `Ctrl + H` |
| Show Outline | `Ctrl + Alt + L` |
| Focus Mode | `Ctrl + Alt + F` |
| Version History | `Ctrl + Shift + H` |
| Screen Capture | `Ctrl + Shift + S` |

→ [Full Keyboard Shortcuts](/keyboard-shortcuts)
