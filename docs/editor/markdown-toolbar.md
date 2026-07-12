---
title: Markdown Toolbar Reference
description: Every toolbar button in the Notely editor explained with keyboard shortcuts and usage notes.
keywords: toolbar, markdown toolbar, shortcuts, headings, bold, italic, link, image, table, diagram
category: Editor
---

# Toolbar Reference

The Markdown toolbar sits above the editor and provides quick-insert actions for common Markdown elements.

## Formatting Buttons

| Button | Inserts | Notes |
|---|---|---|
| **H1** – **H6** | Heading at cursor level | Wraps selection in heading if text is selected |
| **B** | `**bold**` | Wraps selection |
| **I** | `*italic*` | Wraps selection |
| **~~** | `~~strikethrough~~` | Wraps selection |
| **\`** | `` `inline code` `` | Wraps selection |
| **"** | `> blockquote` | Prepends to current line |

## Insert Buttons

| Button | Action | Notes |
|---|---|---|
| **Link** | Insert `[text](url)` template | Cursor lands on `url` |
| **Image** | Open file picker → insert image | Uses workspace-relative path |
| **Table** | Insert 3×3 table skeleton | Opens inline table editor on click |
| **Ordered list** | Insert `1.` list item | |
| **Unordered list** | Insert `- ` list item | |
| **Task** | Insert `- [ ]` task | |
| **HR** | Insert `---` | |

## Diagram Buttons

| Button | Action |
|---|---|
| **Mermaid** | Insert fenced Mermaid block |
| **Excalidraw** | Insert Excalidraw diagram block |

## Validation and Quality

| Button | Action |
|---|---|
| **Validate** | Run Markdown validation on the current note |
| **Format** | Auto-format the focused code block using Prettier |

## Capture Button (Windows)

| Button | Action | Notes |
|---|---|---|
| **📷 A** | Capture screen area — Auto Insert mode | `A` = Auto Insert |
| **📷 R** | Capture screen area — Review Before Insert mode | `R` = Review mode |

The mode badge (`A` or `R`) reflects the current setting from **Settings → Screen Capture**.

→ [Screen Capture guide](/workspace/screen-capture)

## View Mode Controls

The mode buttons in the editor header bar (not the toolbar) control which view is shown:

| Button | Mode |
|---|---|
| **Edit** | Raw Markdown editor |
| **Split** | Editor + live preview |
| **Preview** | Rendered output only |
| **Web** | Website-style rendering |

## Tips

::: tip Keyboard Over Mouse
Most toolbar actions have keyboard alternatives. Open **Help → Keyboard Shortcuts** (`Ctrl + /`) for the full list.
:::

::: tip Wrapping Selections
Most formatting buttons (bold, italic, link, code) wrap the current text selection if one exists. Select text first for faster formatting.
:::
