import { useState, useMemo } from "react";
import { X, Search } from "lucide-react";
import { OverlayDialog } from "./OverlayDialog";
import "../styles/MarkdownGuideModal.css";

const MARKDOWN_SYNTAX = [
  { id: 1, syntax: "# Heading 1", description: "Largest heading", example: "<h1>Heading 1</h1>" },
  { id: 2, syntax: "## Heading 2", description: "Second largest heading", example: "<h2>Heading 2</h2>" },
  { id: 3, syntax: "### Heading 3", description: "Third largest heading", example: "<h3>Heading 3</h3>" },
  { id: 4, syntax: "**Bold text**", description: "Strong emphasis", example: "<b>Bold text</b>" },
  { id: 5, syntax: "*Italic text*", description: "Emphasis", example: "<i>Italic text</i>" },
  { id: 6, syntax: "~~Strikethrough~~", description: "Strike out text", example: "<del>Strikethrough</del>" },
  { id: 7, syntax: "- Item 1\n- Item 2", description: "Unordered list", example: "• Item 1\n• Item 2" },
  { id: 8, syntax: "1. Item 1\n2. Item 2", description: "Ordered list", example: "1. Item 1\n2. Item 2" },
  { id: 9, syntax: "- [ ] Task\n- [x] Done", description: "Task list", example: "☐ Task\n☑ Done" },
  { id: 10, syntax: "[Link](https://...)", description: "Hyperlink", example: "<a href='#'>Link</a>" },
  { id: 11, syntax: "![Image](url.jpg)", description: "Image embed", example: "Embedded Image" },
  { id: 12, syntax: "`inline code`", description: "Inline code snippet", example: "<code>inline code</code>" },
  { id: 13, syntax: "```js\nCode block\n```", description: "Fenced code block", example: "Preformatted code block" },
  { id: 14, syntax: "> Blockquote", description: "Quoted text", example: "Indented quote text" },
  { id: 15, syntax: "---", description: "Horizontal rule", example: "Divider line" },
  { id: 16, syntax: "| Col | Col |\n|---|---|", description: "Table", example: "Grid with rows and columns" }
];

export function MarkdownGuideModal({ open, onClose }) {
  const [search, setSearch] = useState("");

  const filteredSyntax = useMemo(() => {
    if (!search.trim()) return MARKDOWN_SYNTAX;
    const lower = search.toLowerCase();
    return MARKDOWN_SYNTAX.filter(
      (item) =>
        item.syntax.toLowerCase().includes(lower) ||
        item.description.toLowerCase().includes(lower)
    );
  }, [search]);

  return (
    <OverlayDialog
      open={open}
      onClose={onClose}
      ariaLabel="Markdown Guide"
      cardClassName="markdown-guide-card"
    >
      <div className="overlay-dialog-header">
        <h2>Markdown Guide</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close Markdown Guide">
          <X size={16} />
        </button>
      </div>

      <div className="markdown-guide-search">
        <Search size={16} className="markdown-guide-search-icon" />
        <input
          type="text"
          placeholder="Search syntax..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      <div className="markdown-guide-table-container">
        {filteredSyntax.length > 0 ? (
          <table className="markdown-guide-table">
            <thead>
              <tr>
                <th>Syntax</th>
                <th>Description</th>
                <th>Example Result</th>
              </tr>
            </thead>
            <tbody>
              {filteredSyntax.map((item) => (
                <tr key={item.id}>
                  <td>
                    <pre className="markdown-guide-syntax">{item.syntax}</pre>
                  </td>
                  <td>{item.description}</td>
                  <td className="markdown-guide-example">{item.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="markdown-guide-empty">No matching syntax found.</div>
        )}
      </div>
    </OverlayDialog>
  );
}
