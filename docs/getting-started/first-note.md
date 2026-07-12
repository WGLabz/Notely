---
title: Your First Note
description: Step-by-step guide to creating, writing, and saving your first note in Notely.
keywords: create note, first note, markdown, edit, preview
category: Getting Started
difficulty: Beginner
---

# Your First Note

This guide walks you through creating, writing, and previewing a note from scratch.

## Step 1 — Create a Note

1. Press **`Ctrl + N`** (or go to **File → New Note**).
2. Enter a name for your note (e.g., `My First Note`).
3. Press **Enter** to confirm.

The new note opens in the editor immediately.

::: tip Naming Notes
Notely uses the filename as the note title. Use clear, descriptive names — avoid special characters like `/ \ : * ? " < > |`.
:::

## Step 2 — Write in Markdown

The editor starts in **Edit** mode. Type your note content using Markdown:

```markdown
# Meeting Notes — Project Kickoff

## Attendees
- Alice
- Bob
- Carol

## Action Items
- [ ] Share the meeting recording
- [ ] Create project timeline by Friday
- [x] Set up shared workspace

## Notes
The project starts **Monday July 14**. First milestone is due in **3 weeks**.
```

### Quick Markdown Reference

| Element | Syntax |
|---|---|
| Heading | `# H1`, `## H2`, `### H3` |
| Bold | `**bold**` |
| Italic | `*italic*` |
| Task | `- [ ] open`, `- [x] done` |
| Link | `[text](url)` |
| Code | `` `inline` `` or ` ```fenced``` ` |

→ [Full Markdown Guide](/editor/markdown-guide)

## Step 3 — Preview Your Note

Switch view modes using the mode buttons in the editor header:

| Mode | Shortcut | What you see |
|---|---|---|
| **Edit** | — | Raw Markdown source |
| **Split** | — | Editor + live preview side by side |
| **Preview** | — | Read-only rendered output |

Try **Split** view while editing — it shows formatted output as you type.

## Step 4 — Use the Toolbar

The toolbar above the editor provides quick-insert actions:

- **H1–H6** — Insert heading at cursor
- **B / I** — Bold or italic selection
- **Link** — Insert link template
- **Image** — Pick and insert an image
- **Table** — Insert a table skeleton
- **Diagram** — Insert Mermaid or Excalidraw block

## Step 5 — Save

Notely saves your notes automatically as you type. You'll see a status indicator in the note header when the file is being saved.

::: warning Unsaved Changes
If you close a note with unsaved changes, Notely will prompt you to confirm. Auto-save runs continuously, so this only happens if a write error occurs.
:::

## What's Next?

- [Markdown Guide](/editor/markdown-guide) — complete syntax reference
- [Code Blocks](/editor/code-blocks) — auto-detect, format, and edit code
- [Tables](/editor/tables) — inline table editor
- [Diagrams](/editor/diagrams) — Mermaid and Excalidraw
