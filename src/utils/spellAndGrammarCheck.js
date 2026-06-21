/**
 * Spell checking and grammar checking utilities
 * Uses a local spell checker and LanguageTool API for grammar
 */

// Simple spell checker using common English words
// For a production app, consider using a proper dictionary
const COMMON_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "up", "about", "into", "through", "during",
  "is", "are", "am", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "can", "shall",
  "i", "you", "he", "she", "it", "we", "they", "what", "which", "who",
  "this", "that", "these", "those", "my", "your", "his", "her", "its", "our",
  "there", "here", "where", "when", "why", "how", "all", "each", "every",
  "both", "few", "more", "most", "other", "some", "such", "no", "nor", "not",
  "only", "same", "so", "than", "too", "very", "as", "if", "just", "because",
  "note", "add", "example", "see", "also", "one", "two", "three", "first",
  "second", "third", "etc", "vs", "vs.", "e.g", "i.e", "markdown", "html",
  "css", "javascript", "python", "java", "c", "database", "api", "rest",
  "json", "xml", "react", "vue", "angular", "node", "express", "npm",
  "yarn", "webpack", "babel", "eslint", "prettier", "git", "github",
  "notely", "project", "folder",
  "file", "document", "notes", "meeting", "metadata", "location", "time",
  "raw", "cleansed", "preview", "edit", "save", "delete", "create",
  "analysis", "conference", "room", "power", "plant", "captive", "review",
  "summary", "action", "actions", "recommendation", "recommendations", "system",
  "process", "boiler", "turbine", "steam", "energy", "generation", "capacity",
  "efficiency", "auxiliary", "operations", "operation", "performance",
]);

// Common abbreviations and acronyms that shouldn't be flagged
const KNOWN_ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "gen", "col", "sgt", "capt",
  "etc", "eg", "ie", "vs", "al", "id", "no", "co", "inc", "ltd",
  "api", "url", "http", "https", "ftp", "sql", "html", "css", "xml",
  "json", "csv", "pdf", "png", "jpg", "jpeg", "gif", "svg", "mp4",
  "mp3", "exe", "zip", "rar", "iso", "ai", "ml", "cv", "ir",
  "utc", "gmt", "pst", "est", "cst", "mst", "usa", "uk", "us",
  "hr", "min", "sec", "ms", "kb", "mb", "gb", "tb", "hz", "khz",
  "mhz", "ghz", "cpu", "gpu", "ram", "rom", "io", "ui", "ux",
]);

function extractWords(text) {
  // Extract words from text, handling markdown syntax
  return text
    .toLowerCase()
    .replace(/[#*_`\[\](){}|\\]/g, " ") // Remove markdown syntax
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

function isValidWord(word) {
  const cleanWord = word.replace(/[^\w'-]/g, "").toLowerCase();
  if (cleanWord.length === 0) return true;
  if (cleanWord.length <= 2) return true;
  if (/^\d+/.test(cleanWord)) return true; // Numbers
  if (COMMON_WORDS.has(cleanWord)) return true;
  if (KNOWN_ABBREVIATIONS.has(cleanWord)) return true;
  if (cleanWord.includes("-")) return true; // Hyphenated words often valid
  if (cleanWord.endsWith("ing") || cleanWord.endsWith("ed") || cleanWord.endsWith("ly")) return true;
  return false;
}

function levenshteinDistance(left, right) {
  const a = left || "";
  const b = right || "";
  const rows = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

  for (let row = 0; row <= a.length; row += 1) rows[row][0] = row;
  for (let column = 0; column <= b.length; column += 1) rows[0][column] = column;

  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + cost
      );
    }
  }

  return rows[a.length][b.length];
}

function suggestCorrection(word) {
  const cleanWord = word.replace(/[^\w'-]/g, "").toLowerCase();
  if (!cleanWord) return "";

  const candidates = [...COMMON_WORDS, ...KNOWN_ABBREVIATIONS].filter((candidate) => candidate.length > 2);
  let bestCandidate = "";
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = levenshteinDistance(cleanWord, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCandidate = candidate;
    }
  }

  return bestDistance <= 2 ? bestCandidate : "";
}

function isSentenceLike(text) {
  const normalized = stripMarkdownArtifacts(text || "");
  if (!normalized) return false;

  if (/[.!?]["')\]]*$/.test(normalized)) {
    return true;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return wordCount >= 5 && normalized.length >= 20;
}

function isProseLike(text) {
  const normalized = stripMarkdownArtifacts(text || "");
  if (!normalized) return false;

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return wordCount >= 1;
}

function isShortProseFragment(text) {
  const normalized = stripMarkdownArtifacts(text || "");
  if (!normalized) return false;

  const words = normalized.split(/\s+/).filter(Boolean);
  return words.length >= 2 && normalized.length >= 8;
}

function isTechnicalCountFragment(text) {
  const normalized = stripMarkdownArtifacts(text || "");
  if (!normalized) return false;

  const compact = normalized.replace(/\s+/g, " ").trim();
  if (!/^\d+\s+[A-Za-z][A-Za-z\s-]*(\([^)]*\))?$/.test(compact)) {
    return false;
  }

  return /\(\s*\d+[^)]*\)/.test(compact);
}

function stripMarkdownArtifacts(text) {
  return (text || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/www\.\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isStandaloneLowercaseWord(text) {
  const normalized = stripMarkdownArtifacts(text || "");
  if (!normalized) return false;

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length !== 1) return false;

  const word = words[0].replace(/[^\w'-]/g, "");
  return /^[a-z][a-z'-]{3,}$/.test(word);
}

function shouldSpellCheckLine(text, blockType) {
  const normalized = stripMarkdownArtifacts(text || "");
  if (!normalized) return false;

  if (isSentenceLike(normalized)) {
    return true;
  }

  if (blockType === "heading_open") {
    return isShortProseFragment(normalized);
  }

  return isShortProseFragment(normalized) || isStandaloneLowercaseWord(normalized);
}

function shouldGrammarCheckLine(text, blockType) {
  const normalized = stripMarkdownArtifacts(text || "");
  if (!normalized) return false;

  if (isTechnicalCountFragment(normalized)) {
    return false;
  }

  if (isSentenceLike(normalized)) {
    return true;
  }

  if (blockType === "heading_open") {
    return isShortProseFragment(normalized);
  }

  return isShortProseFragment(normalized);
}

function classifyBlockType(line) {
  const trimmed = String(line || "").trim();
  if (/^#{1,6}\s+/.test(trimmed)) return "heading_open";
  if (/^>\s?/.test(trimmed)) return "blockquote_open";
  if (/^([-*+]\s+|\d+\.\s+)/.test(trimmed)) return "list_item_open";
  return "paragraph_open";
}

function isTableLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.includes("|")) return false;
  if (/^\|?\s*:?[-]{3,}:?(\s*\|\s*:?[-]{3,}:?)+\s*\|?$/.test(trimmed)) return true;
  return /^\|.*\|$/.test(trimmed);
}

function extractVisibleTextWithMap(sourceLine) {
  const source = String(sourceLine || "");
  let output = "";
  const indexMap = [];
  let index = 0;
  let inInlineCode = false;

  const appendChar = (character, sourceIndex) => {
    output += character;
    indexMap.push(sourceIndex);
  };

  const appendText = (text, startIndex) => {
    for (let offset = 0; offset < text.length; offset += 1) {
      appendChar(text[offset], startIndex + offset);
    }
  };

  while (index < source.length) {
    if (source.startsWith("![", index)) {
      const closeBracket = source.indexOf("]", index + 2);
      const openParen = closeBracket >= 0 ? source.indexOf("(", closeBracket) : -1;
      const closeParen = openParen >= 0 ? source.indexOf(")", openParen) : -1;
      if (closeBracket >= 0 && openParen === closeBracket + 1 && closeParen >= 0) {
        index = closeParen + 1;
        continue;
      }
    }

    if (source[index] === "[`"[0]) {
      // no-op, handled below to keep patch context stable
    }

    if (source[index] === "`") {
      inInlineCode = !inInlineCode;
      index += 1;
      continue;
    }

    if (inInlineCode) {
      index += 1;
      continue;
    }

    if (source[index] === "[") {
      const closeBracket = source.indexOf("]", index + 1);
      if (closeBracket >= 0) {
        const afterBracket = source[closeBracket + 1];
        if (afterBracket === "(") {
          const closeParen = source.indexOf(")", closeBracket + 2);
          if (closeParen >= 0) {
            appendText(source.slice(index + 1, closeBracket), index + 1);
            index = closeParen + 1;
            continue;
          }
        }
        if (afterBracket === "[") {
          const closeRef = source.indexOf("]", closeBracket + 2);
          if (closeRef >= 0) {
            appendText(source.slice(index + 1, closeBracket), index + 1);
            index = closeRef + 1;
            continue;
          }
        }
      }
    }

    if (source[index] === "<") {
      const closeAngle = source.indexOf(">", index + 1);
      if (closeAngle >= 0) {
        appendText(source.slice(index + 1, closeAngle), index + 1);
        index = closeAngle + 1;
        continue;
      }
    }

    appendChar(source[index], index);
    index += 1;
  }

  return { text: output, indexMap };
}

function stripMarkdownLinePrefix(text, indexMap, blockType) {
  if (!text) return { text: "", indexMap: [] };

  let prefixLength = 0;
  if (blockType === "heading_open") {
    const match = text.match(/^\s*#{1,6}\s+/);
    prefixLength = match ? match[0].length : 0;
  } else if (blockType === "blockquote_open") {
    const match = text.match(/^\s*>\s?/);
    prefixLength = match ? match[0].length : 0;
  } else if (blockType === "list_item_open") {
    const match = text.match(/^\s*(?:[-*+]\s+|\d+\.\s+)/);
    prefixLength = match ? match[0].length : 0;
  }

  return {
    text: text.slice(prefixLength),
    indexMap: indexMap.slice(prefixLength),
  };
}

function normalizeMappedText(text, indexMap) {
  let normalizedText = "";
  const normalizedMap = [];
  let previousWasSpace = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const isSpace = /\s/.test(character);

    if (isSpace) {
      if (normalizedText.length === 0 || previousWasSpace) continue;
      normalizedText += " ";
      normalizedMap.push(indexMap[index]);
      previousWasSpace = true;
      continue;
    }

    normalizedText += character;
    normalizedMap.push(indexMap[index]);
    previousWasSpace = false;
  }

  if (normalizedText.endsWith(" ")) {
    normalizedText = normalizedText.slice(0, -1);
    normalizedMap.pop();
  }

  return {
    text: normalizedText,
    indexMap: normalizedMap,
  };
}

function getMappedSpan(indexMap, startOffset, normalizedLength) {
  const safeStart = Math.max(0, Number(startOffset) || 0);
  const safeLength = Math.max(1, Number(normalizedLength) || 1);
  const startIndex = Number.isFinite(indexMap?.[safeStart]) ? indexMap[safeStart] : safeStart;
  const endOffset = Math.min(safeStart + safeLength - 1, Math.max((indexMap?.length || 1) - 1, 0));
  const endIndex = Number.isFinite(indexMap?.[endOffset]) ? indexMap[endOffset] : endOffset;

  return {
    column: startIndex + 1,
    sourceLength: Math.max(endIndex - startIndex + 1, 1),
  };
}

function extractMarkdownLanguageLines(content, predicate) {
  const sourceLines = String(content || "").split(/\r?\n/);
  const lines = [];
  let inCodeBlock = false;
  let fenceMarker = "";

  for (let index = 0; index < sourceLines.length; index += 1) {
    const sourceLine = sourceLines[index];
    const trimmed = sourceLine.trim();
    const fenceMatch = trimmed.match(/^(```+|~~~+)/);

    if (fenceMatch) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        fenceMarker = fenceMatch[1];
      } else if (trimmed.startsWith(fenceMarker)) {
        inCodeBlock = false;
        fenceMarker = "";
      }
      continue;
    }

    if (inCodeBlock) continue;
    if (!trimmed) continue;
    if (/^\s*\[[^\]]+\]:\s+.+$/.test(sourceLine)) continue;
    if (isTableLine(sourceLine)) continue;

    const blockType = classifyBlockType(sourceLine);
    const visible = extractVisibleTextWithMap(sourceLine);
    const strippedPrefix = stripMarkdownLinePrefix(visible.text, visible.indexMap, blockType);
    const normalized = normalizeMappedText(strippedPrefix.text, strippedPrefix.indexMap);

    if (predicate(normalized.text, blockType)) {
      lines.push({
        line: index + 1,
        text: normalized.text,
        indexMap: normalized.indexMap,
      });
    }
  }

  return lines;
}

function extractMarkdownProseLines(content) {
  return extractMarkdownLanguageLines(content, shouldGrammarCheckLine);
}

function extractMarkdownSpellingLines(content) {
  return extractMarkdownLanguageLines(content, shouldSpellCheckLine);
}

function maskMarkdownCodePreservingLayout(text) {
  const lines = (text || "").split("\n");
  const maskedLines = [];
  let inCodeBlock = false;
  let fenceMarker = "";

  for (const line of lines) {
    const trimmed = line.trim();
    const fenceMatch = trimmed.match(/^(```+|~~~+)/);

    if (fenceMatch) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        fenceMarker = fenceMatch[1];
      } else if (trimmed.startsWith(fenceMarker)) {
        inCodeBlock = false;
        fenceMarker = "";
      }

      maskedLines.push(" ".repeat(line.length));
      continue;
    }

    if (inCodeBlock) {
      maskedLines.push(" ".repeat(line.length));
      continue;
    }

    maskedLines.push(line.replace(/`[^`]*`/g, (match) => " ".repeat(match.length)));
  }

  return maskedLines.join("\n");
}

function runLocalGrammarFallback(proseLines) {
  const issues = [];

  for (const proseLine of proseLines || []) {
    const text = String(proseLine.text || "");

    const repeatedWordMatch = text.match(/\b([A-Za-z][A-Za-z'-]*)\s+\1\b/i);
    if (repeatedWordMatch) {
      const span = getMappedSpan(proseLine.indexMap, repeatedWordMatch.index, repeatedWordMatch[0].length);
      issues.push({
        line: proseLine.line,
        column: span.column,
        message: `Repeated word: "${repeatedWordMatch[1]}"`,
        ruleId: "grammar-repeated-word",
        severity: "info",
        suggestion: repeatedWordMatch[1],
        length: repeatedWordMatch[0].length,
        sourceLength: span.sourceLength,
      });
    }

    const startsLikeSentence = text.split(/\s+/).filter(Boolean).length >= 4;
    if (startsLikeSentence && /^[a-z]/.test(text.trim())) {
      const span = getMappedSpan(proseLine.indexMap, 0, 1);
      issues.push({
        line: proseLine.line,
        column: span.column,
        message: "Sentence should start with a capital letter",
        ruleId: "grammar-capitalization",
        severity: "info",
        suggestion: text.trim().charAt(0).toUpperCase(),
        length: 1,
        sourceLength: span.sourceLength,
      });
    }
  }

  return issues;
}

export async function checkSpelling(content) {
  const text = content || "";
  const issues = [];

  const proseLines = extractMarkdownSpellingLines(text);

  for (const proseLine of proseLines) {
    const line = proseLine.text;
    const wordRegex = /[A-Za-z][A-Za-z0-9'-]*/g;
    let match;

    while ((match = wordRegex.exec(line))) {
      const word = match[0];
      if (!isValidWord(word)) {
        const suggestion = suggestCorrection(word);
        const span = getMappedSpan(proseLine.indexMap, match.index, word.length);
        issues.push({
          line: proseLine.line,
          column: span.column,
          message: `Possible spelling: "${word}"`,
          ruleId: "spelling",
          severity: "warning",
          length: word.length,
          sourceLength: span.sourceLength,
          word,
          suggestion,
        });
      }
    }
  }

  return issues;
}

export async function checkGrammar(content) {
  // Use LanguageTool API for grammar checking
  const text = content || "";
  const proseLines = extractMarkdownProseLines(text);
  if (!proseLines.length) {
    return [];
  }

  const grammarInput = proseLines.map((item) => item.text).join("\n");

  try {
    // LanguageTool has a free public API
    const response = await fetch("https://api.languagetool.org/v2/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        text: grammarInput,
        language: "en-US",
      }).toString(),
    });

    if (!response.ok) {
      console.error("LanguageTool API error:", response.status);
      return runLocalGrammarFallback(proseLines);
    }

    const data = await response.json();
    const issues = [];
    const lineOffsets = [];
    let cursor = 0;

    for (const proseLine of proseLines) {
      lineOffsets.push({
        line: proseLine.line,
        start: cursor,
        end: cursor + proseLine.text.length,
        indexMap: proseLine.indexMap,
      });
      cursor += proseLine.text.length + 1;
    }

    function findLineForOffset(offset) {
      for (const entry of lineOffsets) {
        if (offset >= entry.start && offset <= entry.end) {
          return entry;
        }
      }
      return lineOffsets[lineOffsets.length - 1] || { line: 1, start: 0, end: 0 };
    }

    (data.matches || []).forEach((match) => {
      // Skip some overly pedantic rules
      if (
        match.rule?.id === "WHITESPACE_RULE" ||
        match.rule?.id === "COMMA_PARENTHESIS_WHITESPACE"
      ) {
        return;
      }

      const offset = match.offset || 0;
      const length = match.length || 0;
      const lineEntry = findLineForOffset(offset);
      const line = lineEntry.line;
      const relativeOffset = Math.max(0, offset - lineEntry.start);
      const span = getMappedSpan(lineEntry.indexMap, relativeOffset, length);

      issues.push({
        line,
        column: span.column,
        message: match.message || "Grammar issue",
        ruleId: match.rule?.id || "grammar",
        severity: match.rule?.issueType === "misspelling" ? "error" : "info",
        suggestion: (match.replacements || [])[0]?.value,
        length,
        sourceLength: span.sourceLength,
      });
    });

    return issues;
  } catch (error) {
    console.error("Grammar check failed:", error);
    return runLocalGrammarFallback(proseLines);
  }
}

export async function checkSpellingAndGrammar(content) {
  try {
    const [spellingIssues, grammarIssues] = await Promise.all([
      checkSpelling(content),
      checkGrammar(content),
    ]);

    // Combine and deduplicate issues
    const combined = [...spellingIssues, ...grammarIssues];
    combined.sort((a, b) => {
      if (a.line !== b.line) return a.line - b.line;
      return (a.column || 1) - (b.column || 1);
    });

    return combined;
  } catch (error) {
    console.error("Spell and grammar check failed:", error);
    return [];
  }
}
