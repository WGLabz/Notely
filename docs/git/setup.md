---
title: Setting Up Git in Notely
description: Initialize a new Git repository or clone an existing one for your workspace in Notely.
keywords: git init, git clone, git config, credentials, gitignore
category: Git
---

# Git Setup & Repository

Before tracking changes, your workspace folder must be configured as a Git repository.

## 1. Initializing a Repository

If your opened workspace folder is not currently a Git repository:
1. Open the Version Control view or click the Git status bar badge.
2. Select **Initialize Git Repository**.
3. Notely will run `git init` and create a local repository structure.

---

## 2. Cloning a Repository

To import an existing notes repository:
1. Open the workspace dialogue on launch.
2. Select **Clone Git Repository**.
3. Input the repository HTTPS URL and destination folder.
4. Input credentials if the repository is private.

---

## 3. Ignoring App Metadata (`.notes-app`)

Notely stores internal editor states, annotations, and caches in the `.notes-app` subdirectory. It is recommended to keep this out of version control:
- In **Settings → Git Safety**, enable **Ignore .notes-app**.
- Notely will automatically append `.notes-app/` to your workspace `.gitignore` file.
