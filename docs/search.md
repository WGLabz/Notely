---
title: Search in Notely
description: Learn how to perform global searches, use regex patterns, filter by code blocks, and utilize semantic AI search.
keywords: search, global search, regex, regular expressions, code block search, semantic search, synonyms
category: Search
---

# Search

Search is a first-class feature in Notely. You can search within the current note, across the entire workspace, or filter for specific content types.

## 1. Find in Current Note

Press **`Ctrl + F`** to open the in-note search bar:
- Search by keyword.
- Jump through matches using **Next** (`F3`) and **Previous** (`Shift + F3`).
- Case-sensitivity and whole-word matching toggles are supported.

Press **`Ctrl + H`** to open Find and Replace.

---

## 2. Global Workspace Search

Press **`Ctrl + Shift + F`** to open the Global Search panel:
- Searches all `.md` note titles, folders, metadata, and note content.
- Results update instantly as you type.
- Matches are shown with content snippets highlighting where the term appeared.

### Synonym & Term Support

Search matches related concepts even if the exact keyword differs. Searching for:
* **Repository**, **Repo**, **Git**, **Version Control**, **Commit**, **History**, **Diff**
* will all surface related version control documentation and notes.

---

## 3. Regular Expression Search (Regex)

Enable advanced matching by clicking the **`.*`** button in the search bar:
- Search using standard regular expression patterns.
- Notely checks your regex syntax live and shows a warning if the pattern is invalid.

**Common Regex Examples:**
- Find functions: `function\s+\w+\s*\(`
- Find issue IDs: `Error: \[[A-Z0-9_]+\]`
- Find markdown links: `\[([^\]]+)\]\(([^)]+)\)`

---

## 4. Code Block Search

Filter your search results to code snippets only:
1. Click the **Code Blocks** filter in the global search panel.
2. Enter your keyword or regex.
3. Notely will only return matches found inside fenced code blocks (` ``` `).

---

## 5. Semantic Search (AI-Powered)

When AI embeddings are configured, Notely supports meaning-based search:
- Matches concepts rather than exact words (e.g. searching "backup" finds notes discussing "disaster recovery" or "exporting").
- Requires the **Generate Embeddings** toggle to be enabled in AI settings.
- The status bar displays the freshness state of the search index.

→ [AI Setup & Embeddings](/ai/setup)
