import { markdownTable } from "markdown-table";

function splitRowSegments(line) {
  const segments = [];
  let current = "";
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === "\\") {
      const next = line[i + 1];
      if (next === "|" || next === "\\") {
        current += next;
        i += 1;
      } else {
        current += "\\";
      }
      continue;
    }

    if (ch === "|") {
      segments.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  segments.push(current);
  return segments;
}

function parseRowFormat(line) {
  const trimmed = line.trim();
  const hasLeadingPipe = trimmed.startsWith("|");
  const hasTrailingPipe = trimmed.endsWith("|");

  let cleaned = trimmed;
  if (hasLeadingPipe) cleaned = cleaned.slice(1);
  if (hasTrailingPipe) cleaned = cleaned.slice(0, -1);

  const rawSegments = splitRowSegments(cleaned);
  const cells = rawSegments.map((segment) => {
    const leadingMatch = segment.match(/^\s*/);
    const trailingMatch = segment.match(/\s*$/);
    const leading = leadingMatch ? leadingMatch[0] : "";
    const trailing = trailingMatch ? trailingMatch[0] : "";
    const content = segment.slice(leading.length, segment.length - trailing.length);
    return { leading, content, trailing };
  });

  return { hasLeadingPipe, hasTrailingPipe, cells };
}

function buildStyledRow(values, format) {
  const cells = values.map((value, index) => {
    const template = format?.cells?.[index] || { leading: " ", trailing: " " };
    return `${template.leading}${String(value)}${template.trailing}`;
  });

  let row = cells.join("|");
  if (format?.hasLeadingPipe) row = `|${row}`;
  if (format?.hasTrailingPipe) row = `${row}|`;
  return row;
}

function alignmentsEqual(nextAlignments, delimiterCells) {
  if (nextAlignments.length !== delimiterCells.length) return false;

  for (let i = 0; i < nextAlignments.length; i += 1) {
    const token = delimiterCells[i]?.content || "";
    const isLeft = token.startsWith(":");
    const isRight = token.endsWith(":");
    const current = isLeft && isRight ? "c" : isRight ? "r" : isLeft ? "l" : "";
    if ((nextAlignments[i] || "") !== current) return false;
  }

  return true;
}

function serializeMarkdownTablePreserveStyle({ headers, alignments, rows }, originalMarkdown) {
  const originalLines = String(originalMarkdown || "").split("\n");
  if (originalLines.length < 2) return null;

  const headerFormat = parseRowFormat(originalLines[0]);
  const delimiterFormat = parseRowFormat(originalLines[1]);
  const bodyFormats = originalLines.slice(2).map(parseRowFormat);

  const colCount = headers.length;
  const hasSameShape =
    headerFormat.cells.length === colCount &&
    delimiterFormat.cells.length === colCount &&
    bodyFormats.length === rows.length &&
    bodyFormats.every((rowFormat) => rowFormat.cells.length === colCount);

  if (!hasSameShape) return null;
  if (!alignmentsEqual(alignments, delimiterFormat.cells)) return null;

  const nextLines = [
    buildStyledRow(headers, headerFormat),
    originalLines[1],
    ...rows.map((row, index) => buildStyledRow(row, bodyFormats[index])),
  ];
  return nextLines.join("\n");
}

/**
 * Parses a markdown table string into a structured format.
 * @param {string} text - The raw markdown table text.
 * @returns {object} { headers: string[], alignments: string[], rows: string[][] }
 */
export function parseMarkdownTable(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) {
    return { headers: [], alignments: [], rows: [] };
  }

  // Split table rows while preserving escaped pipes (e.g. \| inside a cell).
  const parseRow = (line) => {
    let cleanedLine = line.trim();
    if (cleanedLine.startsWith('|')) cleanedLine = cleanedLine.slice(1);
    if (cleanedLine.endsWith('|')) cleanedLine = cleanedLine.slice(0, -1);

    const cells = [];
    let current = '';

    for (let i = 0; i < cleanedLine.length; i += 1) {
      const ch = cleanedLine[i];

      if (ch === '\\') {
        const next = cleanedLine[i + 1];
        if (next === '|' || next === '\\') {
          current += next;
          i += 1;
        } else {
          current += '\\';
        }
        continue;
      }

      if (ch === '|') {
        cells.push(current.trim());
        current = '';
        continue;
      }

      current += ch;
    }

    cells.push(current.trim());
    return cells;
  };

  const headers = parseRow(lines[0]);
  
  // Parse alignments from the second row
  const alignmentRow = parseRow(lines[1]);
  const alignments = alignmentRow.map(cell => {
    const isLeft = cell.startsWith(':');
    const isRight = cell.endsWith(':');
    if (isLeft && isRight) return 'c';
    if (isRight) return 'r';
    if (isLeft) return 'l';
    return ''; // default/none
  });

  // Ensure headers and alignments have the same length
  const colCount = Math.max(headers.length, alignments.length);
  while (headers.length < colCount) headers.push('');
  while (alignments.length < colCount) alignments.push('');

  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    const row = parseRow(lines[i]);
    // Pad row with empty strings if it has fewer columns
    while (row.length < colCount) row.push('');
    rows.push(row.slice(0, colCount));
  }

  return { headers, alignments, rows };
}

/**
 * Serializes a structured table format back into a markdown table string.
 * @param {object} tableData - { headers: string[], alignments: string[], rows: string[][] }
 * @returns {string} The formatted markdown table.
 */
export function serializeMarkdownTable({ headers, alignments, rows }, options = {}) {
  const preserved = serializeMarkdownTablePreserveStyle({ headers, alignments, rows }, options.originalMarkdown);
  if (preserved !== null) {
    return preserved;
  }

  const tableArray = [headers, ...rows];
  return markdownTable(tableArray, { align: alignments });
}

export function htmlTableToMarkdown(htmlString) {
  if (!htmlString || !/<table/i.test(htmlString)) return null;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const table = doc.querySelector("table");
    if (!table) return null;

    const rows = Array.from(table.querySelectorAll("tr"));
    if (!rows.length) return null;

    const matrix = [];
    rows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll("th, td")).map((cell) =>
        cell.textContent.trim().replace(/\|/g, "\\|").replace(/\s+/g, " ")
      );
      if (cells.length) matrix.push(cells);
    });

    if (!matrix.length) return null;

    const maxCols = Math.max(...matrix.map((row) => row.length));
    if (maxCols === 0) return null;

    const normalized = matrix.map((row) => {
      const copy = [...row];
      while (copy.length < maxCols) copy.push("");
      return copy;
    });

    const header = normalized[0];
    const body = normalized.slice(1);
    const separator = Array(maxCols).fill("---");

    const mdLines = [
      `| ${header.join(" | ")} |`,
      `| ${separator.join(" | ")} |`,
      ...body.map((row) => `| ${row.join(" | ")} |`),
    ];

    return mdLines.join("\n");
  } catch {
    return null;
  }
}
