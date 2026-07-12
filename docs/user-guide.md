# Notely User Guide

Use this guide for everyday work in Notely: creating notes, editing safely, finding information quickly, and working with visuals.

## 1. Set Up Your Workspace

1. Open Notely.
2. Go to **File -> Open Workspace**.
3. Select the folder where your notes should live.
4. Confirm and continue.

Result: your notes and folders appear in the main list.

Tip: use **File -> Open Recent** when you want to jump back into a recently used workspace faster.

## 2. Create and Organize Notes

1. Create a note from **File -> New Note** (`Ctrl/Cmd + N`).
2. Create folders to group related notes.
3. Use clear titles and optional tags so notes are easier to find later.

## 3. Write and Edit Faster

Choose the view mode that fits your task:

- `Edit`: write raw markdown.
- `Split`: write and preview side-by-side.
- `Preview`: read final output.

Helpful actions:

- Find text: `Ctrl/Cmd + F`
- Use toolbar buttons for headings, lists, links, tables, and diagrams.
- Edit markdown tables inline by placing the cursor inside a table and using the popup grid controls.
  - Add/remove rows and columns from compact action chips.
  - Adjust column alignment from header controls.
  - Save with **Save**, or close/cancel with **Cancel** or `Esc`.
- Format code blocks automatically and use the dedicated code editor popup.
- Fix issues shown by markdown validation and typo checks.

## 4. Recover Changes with Git Version Control

Notely tracks your document history with a native Git-backed system:

1. Open **Version Control -> History** (`Ctrl/Cmd + Shift + H`) or click the **History** button in the top menu of an open note.
2. Select a commit from the timeline list to inspect its details.
3. Compare commits or restore a note to that version.
4. Add tags directly to commits to bookmark key milestones.

Use this to track changes chronologically and recover older revisions of any note.

## 5. Work with Images and Files

You can insert and manage media directly from your notes:

- Add images and linked files.
- Rename or replace existing media.
- Open media in the default app.
- Use image tools like crop and annotation when needed.

Tip: keep image names meaningful so teammates can identify assets quickly.

## 6. Capture Screen Areas into Notes (Windows)

1. Place your cursor where you want the screenshot markdown inserted.
2. Click the toolbar capture icon, or press `Ctrl/Cmd + Shift + S`.
3. Select screen area in Windows snip overlay.
4. If mode is **Auto Insert**, image is inserted directly.
5. If mode is **Review Before Insert**, adjust (optional) and click **Save**.

Change mode in **Settings -> Screen Capture**.

Tip: capture icon marker shows active mode (`A` auto, `R` review).

## 7. Use Diagrams (Mermaid and Excalidraw)

### Mermaid

1. Insert a Mermaid block from the toolbar.
2. Write Mermaid syntax.
3. Check rendering in `Split` or `Preview`.

### Excalidraw

1. Insert an Excalidraw diagram.
2. Edit visually and save.
3. Re-open from preview to continue editing.

### Convert an image to Excalidraw

1. In preview, right-click a workspace image.
2. Select **Edit with Excalidraw**.
3. Draw on top of the image (the starting image is resizable on canvas).
4. Save diagram to replace the markdown image reference.

### Restore original image from converted diagram

1. Right-click an Excalidraw preview created from an image.
2. Select **Restore original image**.

Note: restore appears only for diagrams that were created from an image conversion flow.

## 8. Navigate Large Workspaces

- **View -> Show Outline** for quick jumps inside long notes.
- **View -> Split Preview** to keep source and output aligned.
- **View -> Focus Mode** to reduce distractions.
- **Workspace -> Workspace Graph** to explore note and media relationships.

## 9. Track Tasks Across Notes

Use markdown task checkboxes in your notes:

- Open task: `- [ ]`
- Completed task: `- [x]`

Then review tasks centrally:

1. Open Command Palette (`Ctrl/Cmd + K`).
2. Run **Open Tasks Panel** for pending tasks.
3. Run **Open All Tasks** to view open + completed tasks.
4. Open the source note directly from a task row when you need context.

## 10. Export Workspace as Zip

1. Go to the landing screen (notes list view).
2. Open **File -> Export Workspace as Zip**.
3. Choose export format:
   - Notes as-is (Markdown + assets)
   - PDF-only
   - Web format
4. Choose whether to include Notely app data from `.notes-app` (default is off).
5. Select destination folder (Browse is available and last path is remembered).
6. Confirm or edit filename (default `notelyproject.zip`).
7. Click **Export Zip**.

## 11. Get Help Quickly

- **Help -> Help Center** (`F1`) for in-app help.
- **Help -> Keyboard Shortcuts** (`Ctrl/Cmd + /`) for key bindings.
- **Help -> About Notely** for app version details.
