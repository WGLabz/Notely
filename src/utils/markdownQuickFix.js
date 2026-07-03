function normalizedLineList(text) {
  return (text || "").split(/\r?\n/);
}

function getLineStartIndex(value, targetLine) {
  const lines = normalizedLineList(value);
  const safeLine = Math.max(Number(targetLine) || 1, 1);
  let index = 0;

  for (let lineIndex = 0; lineIndex < Math.min(safeLine - 1, lines.length); lineIndex += 1) {
    index += lines[lineIndex].length + 1;
  }

  return index;
}

function getTextIndexAtLineColumn(value, line, column) {
  const startIndex = getLineStartIndex(value, line);
  const safeColumn = Math.max(Number(column) || 1, 1);
  return Math.min(startIndex + safeColumn - 1, (value || "").length);
}

function resolveReplacementLength(issue) {
  const candidates = [
    Number(issue?.sourceLength),
    Number(issue?.length),
    Number(issue?.word?.length),
  ];

  for (const candidate of candidates) {
    if (Number.isFinite(candidate) && candidate > 0) {
      return Math.floor(candidate);
    }
  }

  return 1;
}

function normalizeSuggestionText(rawSuggestion) {
  const text = String(rawSuggestion || "").trim();
  if (!text) return "";

  const firstChoice = text
    .split(/[,/|;]/)
    .map((entry) => entry.trim())
    .find(Boolean);

  return firstChoice || text;
}

function isAllUpperCase(value) {
  return !!value && /[A-Z]/.test(value) && value === value.toUpperCase();
}

function isCapitalizedWord(value) {
  if (!value) return false;
  if (!/^[A-Za-z][A-Za-z'-]*$/.test(value)) return false;
  return value[0] === value[0].toUpperCase() && value.slice(1) === value.slice(1).toLowerCase();
}

function applyWordCaseLike(sourceWord, suggestion) {
  const source = String(sourceWord || "");
  const next = String(suggestion || "");
  if (!source || !next) return next;

  if (isAllUpperCase(source)) {
    return next.toUpperCase();
  }

  if (isCapitalizedWord(source)) {
    return `${next.charAt(0).toUpperCase()}${next.slice(1).toLowerCase()}`;
  }

  return next;
}

export function getIssueFixType(issue) {
  const text = (issue?.message || "").toLowerCase();
  if (issue?.ruleId === "table-separator") return "table-separator";
  if (issue?.ruleId === "table-columns") return "table-columns";
  if (text.includes("code fenced") || text.includes("fenced code") || text.includes("code fence")) {
    return "code-fence";
  }
  return null;
}

export function applyMarkdownQuickFix(value, issue) {
  if (!issue) return { nextValue: value || "", changed: false, message: "No issue selected." };

  const fixType = getIssueFixType(issue);
  const lines = normalizedLineList(value);

  if (fixType === "code-fence") {
    return {
      nextValue: `${value || ""}\n\`\`\``,
      changed: true,
      message: "Inserted closing code fence.",
    };
  }

  if (fixType === "table-separator") {
    const headerIndex = Math.max((issue.line || 2) - 2, 0);
    const separatorIndex = Math.max((issue.line || 2) - 1, 0);
    const headerLine = lines[headerIndex] || "";
    const columns = Math.max(1, headerLine.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").length);

    lines[separatorIndex] = `| ${Array.from({ length: columns }, () => "---").join(" | ")} |`;
    return {
      nextValue: lines.join("\n"),
      changed: true,
      message: "Fixed table separator.",
    };
  }

  if (fixType === "table-columns") {
    const lineIndex = Math.max((issue.line || 1) - 1, 0);
    const row = (lines[lineIndex] || "").trim().replace(/^\|/, "").replace(/\|$/, "");
    const cells = row ? row.split("|").map((cell) => cell.trim()) : [];

    let expectedColumns = cells.length;
    for (let index = lineIndex - 1; index >= 0; index -= 1) {
      if (!lines[index].includes("|")) continue;
      const candidate = lines[index].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").length;
      if (candidate > 0) {
        expectedColumns = candidate;
        break;
      }
    }

    const fixedCells = [...cells];
    while (fixedCells.length < expectedColumns) fixedCells.push(" ");
    if (fixedCells.length > expectedColumns) fixedCells.length = expectedColumns;

    lines[lineIndex] = `| ${fixedCells.join(" | ")} |`;
    return {
      nextValue: lines.join("\n"),
      changed: true,
      message: "Fixed table column count.",
    };
  }

  return {
    nextValue: value || "",
    changed: false,
    message: "No automatic quick fix available for this issue.",
  };
}

export function applyValidationSuggestion(value, issue, preferredSuggestion = null) {
  const explicit = normalizeSuggestionText(preferredSuggestion);
  const listSuggestion = Array.isArray(issue?.suggestions)
    ? issue.suggestions.map((entry) => normalizeSuggestionText(entry)).find(Boolean)
    : "";
  const suggestion = explicit || normalizeSuggestionText(issue?.suggestion) || listSuggestion;
  if (!suggestion) {
    return {
      nextValue: value || "",
      changed: false,
      message: "No suggestion available for this issue.",
    };
  }

  const source = value || "";
  const startIndex = getTextIndexAtLineColumn(source, issue?.line, issue?.column);
  const replacementLength = resolveReplacementLength(issue);
  const sourceSlice = source.slice(startIndex, startIndex + replacementLength);
  const replacement = issue?.ruleId === "spelling"
    ? applyWordCaseLike(issue?.word || sourceSlice, suggestion)
    : suggestion;
  const nextValue = [
    source.slice(0, startIndex),
    replacement,
    source.slice(startIndex + replacementLength),
  ].join("");

  return {
    nextValue,
    changed: nextValue !== source,
    message: `Applied suggestion: ${replacement}`,
  };
}
