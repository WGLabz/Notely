# Notely Troubleshooting

Use this page to quickly fix common issues.

## 1. Notes Are Not Showing

1. Open **File -> Notes Folder**.
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
2. Confirm API key/token is saved.
3. Run connection test.

If a feature remains unavailable, your selected provider may not support it.

## 6. App Feels Slow in Large Workspaces

- Use folder structure to reduce very large flat note lists.
- Close unused views (for example, graph or media-heavy previews).
- Regenerate embeddings only when needed.

## 7. Quick Support Details to Share

If you need help from your team, share:

- App version from **Help -> About Notely**
- What you were doing when issue started
- Exact error message text (if shown)
