import { describe, expect, it } from "vitest";
import { parseMarkdownTable, serializeMarkdownTable } from "../../utils/tableUtils";

describe("tableUtils", () => {
  it("parses escaped pipes inside cell content", () => {
    const parsed = parseMarkdownTable([
      "| h |",
      "| - |",
      "| a \\| b |",
    ].join("\n"));

    expect(parsed.rows).toEqual([["a | b"]]);
  });

  it("preserves plain backslashes in cell content", () => {
    const original = [
      "| path |",
      "| --- |",
      "| C:\\work\\notes |",
    ].join("\n");

    const parsed = parseMarkdownTable(original);
    expect(parsed.rows[0][0]).toBe("C:\\work\\notes");

    const serialized = serializeMarkdownTable(parsed, { originalMarkdown: original });
    expect(serialized).toContain("C:\\work\\notes");
  });

  it("preserves original spacing and delimiter style for same-shape edits", () => {
    const original = [
      "|a|  b  |",
      "|:-|:-:|",
      "|1|2|",
    ].join("\n");

    const parsed = parseMarkdownTable(original);
    parsed.rows[0][1] = "9";

    const serialized = serializeMarkdownTable(parsed, { originalMarkdown: original });

    expect(serialized).toBe([
      "|a|  b  |",
      "|:-|:-:|",
      "|1|9|",
    ].join("\n"));
  });

  it("falls back to normalized output when alignments change", () => {
    const original = [
      "|a|b|",
      "|:-|:-:|",
      "|1|2|",
    ].join("\n");

    const parsed = parseMarkdownTable(original);
    parsed.alignments = ["r", "c"];

    const serialized = serializeMarkdownTable(parsed, { originalMarkdown: original });

    expect(serialized).toContain("-:");
    expect(serialized).not.toBe(original);
  });

  it("falls back to normalized output when table shape changes", () => {
    const original = [
      "|a|b|",
      "|---|---|",
      "|1|2|",
    ].join("\n");

    const parsed = parseMarkdownTable(original);
    parsed.rows.push(["x", "y"]);

    const serialized = serializeMarkdownTable(parsed, { originalMarkdown: original });

    expect(serialized).toContain("| x | y |");
    expect(serialized).not.toBe([
      "|a|b|",
      "|---|---|",
      "|1|2|",
      "|x|y|",
    ].join("\n"));
  });
});
