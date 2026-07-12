---
title: Tables
description: Create and edit Markdown tables using the inline table editor with row/column controls and alignment settings.
keywords: tables, markdown table, inline table editor, columns, rows, alignment
category: Editor
---

# Tables

Notely includes an inline table editor that lets you edit Markdown tables in a spreadsheet-style grid without touching the raw Markdown syntax.

## Create a Table

**Option 1 — Toolbar:**
1. Click the **Table** button in the editor toolbar.
2. A basic table skeleton is inserted at the cursor.

**Option 2 — Type Markdown directly:**

```markdown
| Header A | Header B | Header C |
|---|---|---|
| Cell 1 | Cell 2 | Cell 3 |
| Cell 4 | Cell 5 | Cell 6 |
```

## Open the Inline Table Editor

When your cursor is inside a Markdown table in Edit mode, the **inline table editor** opens automatically as an overlay panel.

The table editor shows:
- **Header cells** — editable in the top row
- **Data cells** — editable in a grid layout
- **Action chips** — row and column controls
- **Alignment controls** — per-column alignment buttons in the header

## Edit Cells

Click any cell in the grid to edit its content. Standard text editing applies — no Markdown needed inside cells.

::: warning Pipe Characters in Cells
If you need a literal `|` character inside a cell, use the escaped form `\|`. This is handled automatically by the table editor.
:::

## Add and Remove Rows

Use the **action chips** below the grid:

| Action | Result |
|---|---|
| **+ Row** | Adds a new row at the bottom |
| **- Row** | Removes the last row |
| **+ Col** | Adds a column at the right |
| **- Col** | Removes the rightmost column |

After adding or removing rows/columns, the table editor stays active so you can continue editing.

## Column Alignment

Each header cell has an alignment control:

| Button | Alignment |
|---|---|
| **L** (left arrow) | Left-align the column (default) |
| **C** (center) | Center-align the column |
| **R** (right arrow) | Right-align the column |

Alignment is written as Markdown column separators:

```markdown
| Left | Center | Right |
|:---|:---:|---:|
```

## Save and Cancel

| Control | Shortcut | Action |
|---|---|---|
| **Save** | — | Writes the edited table back to Markdown source |
| **Cancel** | `Esc` | Discards changes and closes the editor |

::: tip Background Scroll Lock
While the table editor is open, background page scrolling is locked. The table content panel has its own scroll when the table is large. This prevents accidental position changes while editing.
:::

## Formatting Preservation

When you edit a table that already exists in your note, Notely preserves the original Markdown formatting style (column spacing and delimiter style) where the table shape hasn't changed.

## Tips

::: tip Large Tables
For very large tables, the inline editor panel scrolls independently. Use the header controls to keep the alignment buttons in view.
:::

::: tip Escaped Paths
Windows file paths (e.g. `C:\Users\name`) are handled safely — backslashes are preserved correctly in cell content.
:::
