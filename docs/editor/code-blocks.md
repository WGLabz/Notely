---
title: Code Blocks
description: Auto-detect languages, auto-format with Prettier, and edit code in a dedicated popup — all from inside Notely.
keywords: code block, syntax highlighting, auto-format, prettier, code editor, language detection
category: Editor
---

# Code Blocks

Notely provides a rich experience for working with code inside Markdown notes: automatic language detection, one-click formatting with Prettier, and a dedicated full-screen code editor.

## Insert a Code Block

In Edit mode, use the toolbar **Code** button or type three backticks followed by a language name:

````markdown
```python
def hello(name):
    return f"Hello, {name}!"
```
````

Notely renders the block with syntax highlighting in Preview and Split modes.

## Auto-Detect Language

If you paste a code snippet without a language tag, Notely attempts to detect the language automatically:

1. Paste code into an empty fenced block (` ``` ` without a language).
2. Notely inspects the content and adds the correct language tag.
3. The block re-renders with appropriate highlighting.

Supported auto-detected languages include JavaScript, TypeScript, Python, HTML, CSS, JSON, YAML, Bash, SQL, Go, Rust, and more.

## Auto-Format with Prettier

In **Preview** mode, a toolbar appears on hover above each code block. Click the **🪄 Format** button to auto-format the code using Prettier:

- Applies consistent indentation
- Normalizes quotes and semicolons
- Respects the language-appropriate style

The formatting is written back to the Markdown source automatically.

You can also trigger formatting from inside the dedicated code editor.

## Dedicated Code Editor

For a distraction-free editing experience:

1. Switch to **Preview** mode.
2. Hover over any code block — a toolbar appears.
3. Click the **✎ Edit** button.

The dedicated code editor opens with:

- **Syntax highlighting** for the block's language
- **Find and Replace** (`Ctrl + F`)
- **Language selector** — switch the code language
- **Line numbers**
- **Format button** — run Prettier from within the editor

Click **Save** to write changes back to the note, or **Cancel** to discard.

## Supported Languages

Notely supports highlighting for all [highlight.js](https://highlightjs.org/) languages, including:

| Category | Examples |
|---|---|
| Web | `html`, `css`, `javascript`, `typescript`, `jsx`, `tsx` |
| Backend | `python`, `go`, `rust`, `java`, `csharp`, `php`, `ruby` |
| Data | `json`, `yaml`, `toml`, `xml`, `sql` |
| Shell | `bash`, `powershell`, `cmd` |
| Markup | `markdown`, `latex` |
| Config | `nginx`, `dockerfile`, `makefile` |

## Tips

::: tip Copy Button
Every code block in Preview mode has a **Copy** button in the top-right corner. Click it to copy the code contents without the backtick fences.
:::

::: tip Language Tags are Important
Always specify a language tag for better highlighting and to ensure the auto-formatter chooses the right rules. Example: ` ```typescript ` instead of ` ``` `.
:::
