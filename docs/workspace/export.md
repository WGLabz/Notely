---
title: Exporting Workspaces
description: Export your workspace as a zip archive containing raw markdown, PDFs, or a built website package.
keywords: export, zip, backup, pdf bundle, web format
category: Workspace
---

# Export

Notely allows you to bundle and export your entire workspace (or specific selections) as a ZIP archive.

## 1. Export Formats

Open the export window from **File → Export Workspace as Zip**:

- **Notes As-Is**: Bundles your raw Markdown files and the `assets/` directory. Perfect for backups or migrating to another Markdown editor (like Obsidian).
- **PDF-Only**: Compiles all notes into formatted PDF documents, placing them inside a structured ZIP. Useful for offline reading or client deliverables.
- **Web Format**: Generates a static HTML website from your notes, packaged inside a ZIP. You can host this static folder on services like GitHub Pages or Netlify.

---

## 2. Advanced Options

- **App Data Toggle**: Choose whether to include the `.notes-app` support folder (containing version control commits and metadata). Recommended to leave disabled unless creating full recovery backups.
- **Remembered Destination**: Notely remembers your last export folder. You can customize the filename before starting the process.
