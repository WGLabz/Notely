---
title: Workspace Management
description: Learn how to manage workspaces, notes, folders, and navigate the dashboard in Notely.
keywords: workspace, landing screen, folders, sidebar, dashboard, favorites, continue writing
category: Workspace
---

# Workspace Overview

A workspace is the single source of truth for your notes in Notely. It maps to a folder on your local filesystem containing Markdown documents and asset subfolders.

## 1. Landing Dashboard

When you open a workspace, you are greeted by the landing dashboard, which provides quick access to recent work and workspace health:

- **Continue Writing**: Shows the single most recently edited note to resume editing instantly.
- **Recent Notes**: Displays a chronological list of recent notes.
- **Favorites**: Starred notes for immediate access.
- **Open Tasks**: Summarizes unchecked tasks across the workspace.

---

## 2. Note and Folder Creation

- **New Note**: Create notes from **File → New Note** (`Ctrl + N`).
- **New Folder**: Create subfolders inside the sidebar list view to group notes logically.
- **Rename & Delete**: Available from the note context menu. Deleted files are safely moved to the "Removed" folder pool managed by Notely.

---

## 3. Density & Layout Views

Customize how you browse your workspace contents:
- **Tile View**: Card-style layout showing note content previews.
- **Table View**: Compact, grid-based list view for scanning large note lists quickly. Double-click any note row in Table View to open it immediately.
- **Comfortable Density**: Added margins and breathing room.
- **Compact Density**: High-density display for reviewing many documents at once.

Switch views from the **View** menu or the Command Palette.

---

## 5. Workspace & Document Reloading

Keep your workspace and active notes synchronized with external changes on disk:

- **Reload Workspace**: Click the **Reload** button in the landing list controls, select **Workspace → Reload Workspace** (`Ctrl + Alt + R`), or run **Reload Workspace from Disk** in the Command Palette to re-scan all workspace documents, folder structures, open note tabs, and git status.
- **External Change Banner & Reload Note**: When an active note is modified externally by another tool or process, Notely detects the change, temporarily disables autosave to prevent overwriting disk state, and displays a warning banner. Click **Reload content from disk**, select **File → Reload Note from Disk** (`Ctrl + Shift + R`), right-click the note tab and choose **Reload from Disk**, or use the Command Palette to force-load the latest file content from disk.

