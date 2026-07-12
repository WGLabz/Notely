---
title: Tasks Management
description: Manage tasks across notes, view open and completed tasks, and use the task panels.
keywords: tasks, checklists, todos, task dashboard, task panel
category: Workspace
---

# Tasks

Notely tracks standard Markdown checklist checkboxes (`- [ ]`) across all notes, aggregating them into workspace-wide dashboards.

## 1. Syntax

Create tasks in any note using Markdown syntax:
```markdown
- [ ] An open task
- [x] A completed task
```
You can also use `*` or `+` as list indicators.

---

## 2. Aggregated Task Panels

Access your tasks workspace-wide using the Command Palette (`Ctrl + K`):

- **Open Tasks Panel**: Displays a searchable list of all pending (`- [ ]`) tasks, grouped by the note they belong to. Click "Open note" to navigate directly to the task location.
- **All Tasks Panel**: Displays both open and completed tasks. Helpful for auditing, generating changelogs, or reviewing project velocity.

---

## 3. Note-Level Task Summary

When editing a note, the editor top bar displays a compact task completion indicator. Hovering over it shows a summary of open and completed items within the active note. Clicking it launches the task summary popup.
