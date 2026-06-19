/**
 * Markdown linting powered by remark-lint.
 */

import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkLint from "remark-lint";
import remarkPresetLintRecommended from "remark-preset-lint-recommended";

const markdownLinter = remark()
  .use(remarkGfm)
  .use(remarkLint)
  .use(remarkPresetLintRecommended);

function countTableColumns(line) {
  const trimmed = (line || "").trim().replace(/^\|/, "").replace(/\|$/, "");
  if (!trimmed) return 0;
  return trimmed.split("|").length;
}

function collectTableIssues(text) {
  const lines = (text || "").split(/\r?\n/);
  const issues = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = lines[index];
    const separator = lines[index + 1];

    if (!header.includes("|") || !separator.includes("|")) continue;

    const separatorPattern = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;
    const maybeTable = /-{3,}/.test(separator);
    if (!maybeTable) continue;

    if (!separatorPattern.test(separator.trim())) {
      issues.push({
        line: index + 2,
        column: 1,
        message: "Malformed table separator row.",
        ruleId: "table-separator",
      });
      continue;
    }

    const expectedColumns = countTableColumns(header);
    const separatorColumns = countTableColumns(separator);
    if (expectedColumns !== separatorColumns) {
      issues.push({
        line: index + 2,
        column: 1,
        message: `Table separator has ${separatorColumns} columns but header has ${expectedColumns}.`,
        ruleId: "table-columns",
      });
    }

    let bodyLine = index + 2;
    while (bodyLine < lines.length && lines[bodyLine].includes("|")) {
      const row = lines[bodyLine];
      if (!row.trim()) break;
      const rowColumns = countTableColumns(row);
      if (rowColumns !== expectedColumns) {
        issues.push({
          line: bodyLine + 1,
          column: 1,
          message: `Table row has ${rowColumns} columns but expected ${expectedColumns}.`,
          ruleId: "table-columns",
        });
      }
      bodyLine += 1;
    }

    index = Math.max(index, bodyLine - 1);
  }

  return issues;
}

export async function validateMarkdownSyntax(content) {
  const text = content || "";
  const file = await markdownLinter.process(text);

  const lintIssues = file.messages.map((message) => ({
    line: message?.place?.start?.line || 1,
    column: message?.place?.start?.column || 1,
    message: message.reason || "Markdown issue detected.",
    ruleId: message.ruleId || "remark-lint",
  }));

  const tableIssues = collectTableIssues(text);
  const combined = [...lintIssues, ...tableIssues];

  return combined.sort((left, right) => {
    if (left.line !== right.line) return left.line - right.line;
    return (left.column || 1) - (right.column || 1);
  });
}
