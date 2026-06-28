import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkSpelling } from "./spellAndGrammarCheck";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("typo checker", () => {
  it("detects possible spelling issues", async () => {
    const content = "This is a sentance with a mispelling";
    const issues = await checkSpelling(content);
    
    // Should find "sentance" and "mispelling"
    expect(issues.length).toBeGreaterThan(0);
    const words = issues.map(i => i.message);
    expect(words.some(m => m.includes("sentance") || m.includes("Possible spelling"))).toBe(true);
  });

  it("skips code blocks from spell checking", async () => {
    const content = `Here is some code:
\`\`\`js
const mispelling = "should not flag this";
\`\`\`

But this sentance has an eror.`;
    
    const issues = await checkSpelling(content);
    const messages = issues.map(i => i.message).join(" ");
    
    // Should not flag words inside code block
    expect(messages.includes("mispelling")).toBe(false);
    // But should flag actual errors
    expect(issues.length).toBeGreaterThan(0);
  });

  it("skips inline code from spell checking", async () => {
    const content = "Use `mispeling` inside code, but flag this sentance.";

    const issues = await checkSpelling(content);
    const messages = issues.map((issue) => issue.message).join(" ");

    expect(messages.includes("mispeling")).toBe(false);
    expect(messages.includes("sentance") || messages.includes("Possible spelling")).toBe(true);
  });

  it("ignores image paths while still checking surrounding prose", async () => {
    const content = "This sentence has an image ![Power Plant Team Meeting](./images/Power Plant Team Meeting.png) and a typo mispeling.";
    const issues = await checkSpelling(content);
    const messages = issues.map((issue) => issue.message).join(" ");

    expect(messages).not.toContain("./images/Power Plant Team Meeting.png");
    expect(messages).not.toContain("Power Plant Team Meeting.png");
    expect(messages).toContain("mispeling");
  });

  it("does not spell check table cells", async () => {
    const content = `| Column | Value |
| --- | --- |
| aksadsdbnjasd | okay |`;

    const issues = await checkSpelling(content);
    const messages = issues.map((issue) => issue.message).join(" ");

    expect(messages).not.toContain("Column");
    expect(messages).not.toContain("aksadsdbnjasd");
  });

  it("skips title-like markdown fragments but keeps lowercase standalone typos", async () => {
    const titleLikeSamples = ["# Column", "- Column", "> Column"];

    for (const content of titleLikeSamples) {
      const issues = await checkSpelling(content);
      const messages = issues.map((issue) => issue.message).join(" ");
      expect(messages).not.toContain("Column");
    }

    const typoSamples = ["- aksadsdbnjasd", "> aksadsdbnjasd"];

    for (const content of typoSamples) {
      const issues = await checkSpelling(content);
      const messages = issues.map((issue) => issue.message).join(" ");
      expect(messages).toContain("aksadsdbnjasd");
    }
  });

  it("checks heading typos without flagging common domain words", async () => {
    const content = "# Capttive Power Plant Analysis";

    const issues = await checkSpelling(content);
    const messages = issues.map((issue) => issue.message).join(" ");

    expect(messages).toContain("Capttive");
    expect(messages).not.toContain("Power");
    expect(messages).not.toContain("Plant");
    expect(messages).not.toContain("Analysis");
  });

  it("ignores common abbreviations", async () => {
    const content = "API and REST are common terms. See the docs at https://example.com";
    const issues = await checkSpelling(content);
    
    // Should not flag API, REST, etc.
    const messages = issues.map(i => i.message);
    expect(messages.some(m => m.includes("API"))).toBe(false);
  });

  it("does not flag common metadata words like Date", async () => {
    const issues = await checkSpelling("Date: June 28");
    const messages = issues.map((issue) => issue.message).join(" ");

    expect(messages).not.toContain("Date");
    expect(messages).not.toContain("date");
  });

  it("does not flag synthesis", async () => {
    const issues = await checkSpelling("Prepared as: Working consulting synthesis from client documents");
    const messages = issues.map((issue) => issue.message).join(" ");

    expect(messages).not.toContain("synthesis");
  });

  it("handles empty content gracefully", async () => {
    const issues = await checkSpelling("");
    expect(issues).toEqual([]);
  });

  it("skips spelling issues for ignored words", async () => {
    const content = "This sentance should be ignored but eror should still appear.";
    const baselineIssues = await checkSpelling(content);
    const issues = await checkSpelling(content, { ignoredWords: ["sentance"] });
    const messages = issues.map((issue) => issue.message).join(" ");

    expect(messages).not.toContain("sentance");
    expect(issues.length).toBeLessThan(baselineIssues.length);
  });

  it("sorts issues by line and column", async () => {
    const content = `First line with erors
Second line with mispelling
Third line is fine`;
    
    const issues = await checkSpelling(content);
    
    if (issues.length > 1) {
      for (let i = 0; i < issues.length - 1; i += 1) {
        const current = issues[i];
        const next = issues[i + 1];
        
        if (current.line === next.line) {
          expect(current.column).toBeLessThanOrEqual(next.column);
        } else {
          expect(current.line).toBeLessThan(next.line);
        }
      }
    }
  });
});
