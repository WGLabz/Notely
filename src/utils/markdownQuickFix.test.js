import { describe, expect, it } from "vitest";
import { applyMarkdownQuickFix, applyValidationSuggestion, getIssueFixType } from "./markdownQuickFix";

describe("markdown quick fix", () => {
  it("detects supported issue types", () => {
    expect(getIssueFixType({ ruleId: "table-separator" })).toBe("table-separator");
    expect(getIssueFixType({ ruleId: "table-columns" })).toBe("table-columns");
    expect(getIssueFixType({ message: "Fenced code block is not closed" })).toBe("code-fence");
  });

  it("adds missing closing code fence", () => {
    const value = "```js\nconsole.log('x')";
    const result = applyMarkdownQuickFix(value, { message: "Fenced code block is not closed" });

    expect(result.changed).toBe(true);
    expect(result.nextValue.endsWith("\n```")).toBe(true);
  });

  it("repairs table separator columns", () => {
    const value = [
      "| A | B | C |",
      "| --- |",
      "| 1 | 2 | 3 |",
    ].join("\n");

    const result = applyMarkdownQuickFix(value, {
      ruleId: "table-separator",
      line: 2,
      message: "Table separator should match header columns",
    });

    expect(result.changed).toBe(true);
    expect(result.nextValue.split("\n")[1]).toBe("| --- | --- | --- |");
  });

  it("repairs short table row by padding cells", () => {
    const value = [
      "| A | B | C |",
      "| --- | --- | --- |",
      "| 1 | 2 |",
    ].join("\n");

    const result = applyMarkdownQuickFix(value, {
      ruleId: "table-columns",
      line: 3,
      message: "Table row has inconsistent column count",
    });

    expect(result.changed).toBe(true);
    expect(result.nextValue.split("\n")[2]).toBe("| 1 | 2 |   |");
  });

  it("applies spelling suggestion without over-replacing text", () => {
    const result = applyValidationSuggestion("teh cat", {
      line: 1,
      column: 1,
      sourceLength: 3,
      ruleId: "spelling",
      suggestion: "thee",
      word: "teh",
    });

    expect(result.changed).toBe(true);
    expect(result.nextValue).toBe("thee cat");
  });

  it("preserves title case for spelling suggestion", () => {
    const result = applyValidationSuggestion("Teh cat", {
      line: 1,
      column: 1,
      sourceLength: 3,
      ruleId: "spelling",
      suggestion: "the",
      word: "Teh",
    });

    expect(result.nextValue).toBe("The cat");
  });

  it("preserves all-caps for spelling suggestion", () => {
    const result = applyValidationSuggestion("TEH cat", {
      line: 1,
      column: 1,
      sourceLength: 3,
      ruleId: "spelling",
      suggestion: "the",
      word: "TEH",
    });

    expect(result.nextValue).toBe("THE cat");
  });
});
