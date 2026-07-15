/**
 * Typo checking utilities
 */

import nspell from "nspell";
import aff from "dictionary-en-us/index.aff?raw";
import dic from "dictionary-en-us/index.dic?raw";

// Cache for spell check results to avoid redundant computations
const spellCheckCache = new Map();
const MAX_CACHE_SIZE = 5000;

const KEYBOARD_ROWS = [
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
];

// Validation result cache
const validationCache = new Map();

const CUSTOM_WORDS = [
  "notely", "iiot", "genai", "mithapur", "solvay",
  "dcs", "scada", "ot", "it", "idmz", "mqtt", "iec", "isa",
  "json", "xml", "csv", "api", "rest", "html", "css", "javascript", "node",
  "sap", "kpi", "kpis", "esf", "bicarb", "hcl", "cogen",
  "date", "metadata", "cleansed", "rawnotes", "synthesis",
];

const spell = nspell(aff, dic);
for (const word of CUSTOM_WORDS) {
  spell.add(word);
}

function isKeyboardNeighborChar(sourceChar, targetChar) {
  if (!sourceChar || !targetChar) return false;
  const source = String(sourceChar).toLowerCase();
  const target = String(targetChar).toLowerCase();
  if (source === target) return false;

  for (const row of KEYBOARD_ROWS) {
    const sourceIndex = row.indexOf(source);
    if (sourceIndex === -1) continue;
    if (row[sourceIndex - 1] === target || row[sourceIndex + 1] === target) {
      return true;
    }
  }

  return false;
}

function isAdjacentTransposition(source, target) {
  if (!source || !target || source.length !== target.length || source === target) {
    return false;
  }

  let mismatchIndex = -1;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === target[index]) continue;
    mismatchIndex = index;
    break;
  }

  if (mismatchIndex < 0 || mismatchIndex >= source.length - 1) return false;
  if (source.slice(0, mismatchIndex) !== target.slice(0, mismatchIndex)) return false;
  if (source[mismatchIndex] !== target[mismatchIndex + 1]) return false;
  if (source[mismatchIndex + 1] !== target[mismatchIndex]) return false;
  return source.slice(mismatchIndex + 2) === target.slice(mismatchIndex + 2);
}

function scoreSuggestion(sourceWord, candidateWord) {
  const source = String(sourceWord || "").toLowerCase();
  const candidate = String(candidateWord || "").toLowerCase();
  if (!source || !candidate) return Number.NEGATIVE_INFINITY;

  let score = 0;
  if (isAdjacentTransposition(source, candidate)) {
    score += 250;
  }

  const minLength = Math.min(source.length, candidate.length);
  for (let index = 0; index < minLength; index += 1) {
    if (source[index] === candidate[index]) {
      score += 6;
    } else if (isKeyboardNeighborChar(source[index], candidate[index])) {
      score += 3;
    } else {
      score -= 2;
    }
  }

  score -= Math.abs(source.length - candidate.length) * 4;
  return score;
}

function isValidWord(word) {
  const cleanWord = word.replace(/[^\w'-]/g, "").toLowerCase();

  if (cleanWord.length === 0 || cleanWord.length <= 2 || /\d/.test(cleanWord)) return true;
  if (cleanWord.includes("-")) return true;
  
  // Check cache first
  if (validationCache.has(cleanWord)) {
    return validationCache.get(cleanWord);
  }
  const isValid = spell.correct(cleanWord);
  
  // Store in cache (with size limit to prevent memory leaks)
  if (validationCache.size >= MAX_CACHE_SIZE) {
    const firstKey = validationCache.keys().next().value;
    validationCache.delete(firstKey);
  }
  validationCache.set(cleanWord, isValid);
  
  return isValid;
}

function suggestCorrection(word) {
  const cleanWord = word.replace(/[^\w'-]/g, "").toLowerCase();
  if (!cleanWord) return [];

  // Check cache first
  if (spellCheckCache.has(cleanWord)) {
    return spellCheckCache.get(cleanWord);
  }

  if (cleanWord.length < 3 || /^\d+/.test(cleanWord)) {
    spellCheckCache.set(cleanWord, []);
    return [];
  }

  const suggestionSet = new Set();

  // Prioritize adjacent transposition fixes (e.g., "liek" -> "like").
  for (let index = 0; index < cleanWord.length - 1; index += 1) {
    const chars = cleanWord.split("");
    const nextIndex = index + 1;
    [chars[index], chars[nextIndex]] = [chars[nextIndex], chars[index]];
    const candidate = chars.join("");
    if (candidate !== cleanWord && spell.correct(candidate)) {
      suggestionSet.add(candidate);
    }
  }

  const suggestions = spell.suggest(cleanWord);
  if (Array.isArray(suggestions)) {
    suggestions
      .map((entry) => String(entry || "").trim().toLowerCase())
      .filter(Boolean)
      .forEach((entry) => suggestionSet.add(entry));
  }

  const result = Array.from(suggestionSet)
    .sort((left, right) => {
      const scoreDelta = scoreSuggestion(cleanWord, right) - scoreSuggestion(cleanWord, left);
      if (scoreDelta !== 0) return scoreDelta;
      return left.localeCompare(right);
    })
    .slice(0, 8);
  
  // Cache with size limit
  if (spellCheckCache.size >= MAX_CACHE_SIZE) {
    const firstKey = spellCheckCache.keys().next().value;
    spellCheckCache.delete(firstKey);
  }
  spellCheckCache.set(cleanWord, result);
  
  return result;
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

function isShortProseFragment(text) {
  const normalized = stripMarkdownArtifacts(text || "");
  if (!normalized) return false;

  const words = normalized.split(/\s+/).filter(Boolean);
  return words.length >= 2 && normalized.length >= 8;
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

    if (source[index] === "{") {
      const closeCurly = source.indexOf("}", index + 1);
      if (closeCurly >= 0) {
        index = closeCurly + 1;
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

function extractMarkdownSpellingLines(content) {
  return extractMarkdownLanguageLines(content, shouldSpellCheckLine);
}

export async function checkSpelling(content, options = {}) {
  const text = content || "";
  const issues = [];
  const ignoredWords = new Set(
    Array.isArray(options.ignoredWords)
      ? options.ignoredWords
        .map((word) => String(word || "").trim().toLowerCase())
        .filter(Boolean)
      : []
  );

  const proseLines = extractMarkdownSpellingLines(text);

  for (const proseLine of proseLines) {
    const line = proseLine.text;
    const wordRegex = /[A-Za-z][A-Za-z0-9'-]*/g;
    let match;

    while ((match = wordRegex.exec(line))) {
      const word = match[0];
      if (ignoredWords.has(String(word).toLowerCase())) {
        continue;
      }
      if (!isValidWord(word)) {
        const suggestions = suggestCorrection(word);
        const suggestion = suggestions[0] || "";
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
          suggestions,
        });
      }
    }
  }

  return issues;
}

