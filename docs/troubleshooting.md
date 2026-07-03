# Notely Troubleshooting

Use this page to quickly fix common issues.

## 1. Notes Are Not Showing

1. Open **File -> Open Workspace**.
2. Confirm the selected folder is correct.
3. Check that the folder contains `.md` files.

If still empty, restart the app and re-open the same folder.

## 2. Preview Looks Wrong

1. Switch to **Split** view.
2. Check for markdown validation warnings.
3. Fix heading/list/table syntax first.

For Mermaid diagrams, validate the Mermaid block syntax before retrying preview.

## 3. A Linked File or Image Does Not Open

1. Check that the file still exists in your workspace.
2. Verify the path in markdown is correct.
3. Reinsert the link from toolbar/file picker if needed.

## 4. Sync Conflicts Keep Appearing

1. Open **P2P -> P2P Status**.
2. Confirm peers are connected and trusted.
3. Open conflict tools and resolve each conflict.

After resolving, refresh the note list and verify final content.

## 5. AI Features Are Disabled

1. Open **AI -> AI Settings**.
2. Confirm your AI sign-in details are saved.
3. Run connection test.

If a feature still does not appear, the AI service you chose may not support it.

## 6. App Feels Slow in Large Workspaces

- Use folder structure to reduce very large flat note lists.
- Close unused views (for example, graph or media-heavy previews).
- Refresh AI search data only when you actually need it.

## 7. Quick Support Details to Share

If you need help from your team, share:

- App version from **Help -> About Notely**
- What you were doing when issue started
- Exact error message text (if shown)

## 8. Screen Capture Mode Looks Incorrect (A/R)

1. Open **Settings -> Screen Capture** and choose mode again.
2. Check toolbar capture icon marker. `A` means Auto Insert and `R` means Review Before Insert.
3. Trigger a fresh capture (`Ctrl/Cmd + Shift + S`) to confirm behavior.

If marker and menu differ, restart app once and re-check.

## 9. Review Mode Save Appears Unresponsive

In current flow, review mode Save should work even without making edits.

If Save still appears blocked:

1. Ensure review dialog is focused.
2. Confirm image preview has loaded.
3. Try keyboard Enter once.
4. Retry capture from toolbar.

## 10. Embedded Terminal Does Not Start

1. Open **View -> Show Terminal** again.
2. Switch shell from **View -> Terminal Shell** and retry.
3. If strict terminal policy is configured, confirm your command is allowed.

If the terminal still fails, capture the exact error text shown in the terminal panel.

## 11. Workspace Export Does Not Finish

1. Retry export from the landing screen.
2. Confirm the destination folder is writable.
3. Try **Notes as-is** first to isolate PDF or web export issues.

If PDF-only export fails, retry with a smaller workspace to identify a problematic note or asset.

## 12. Project Website Shows Notes from an Older Workspace

1. Confirm workspace was changed from **File -> Open Workspace** and opened successfully.
2. Re-open website using **Web -> Open Project Website** from the landing screen.
3. If browser tab is pinned, open a new tab/window once.

If this keeps happening, update to the latest build that includes workspace-switch website scope refresh fixes.
