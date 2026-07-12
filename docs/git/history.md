---
title: Note History and Restores
description: Browse historical versions of notes, compare visual diffs, and restore earlier revisions.
keywords: history, rollback, diff viewer, git history, versions, compare
category: Git
---

# History & Restore

Notely lets you browse the full commit history of any note and compare versions side-by-side.

## 1. Opening Revision History

- Press **`Ctrl + Shift + H`** or click the **History** button in the note top bar.
- The history sidebar will slide out, displaying a timeline of all commits touching the current note.

---

## 2. Comparing Diffs

Click on any commit in the history timeline to open the **Diff Viewer**:
- **Code View**: Standard text-based differences, highlighting added and removed lines.
- **Markdown Preview Mode**: Shows a visual, word-level comparison of the rendered document, marking insertions in green and deletions in red.

---

## 3. Restoring Notes

To restore the note to a previous revision:
1. Select the target commit in the history timeline.
2. Verify the content in the diff viewer.
3. Click the **Restore** button.
4. Notely will replace the active note contents with the selected version, placing a new restoration commit in your history.
