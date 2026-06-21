import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkGrammar, checkSpelling, checkSpellingAndGrammar } from "./spellAndGrammarCheck";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("spell and grammar checker", () => {
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
    const content = "This sentence has an image ![Power Plant Team Meeting](./images/Power Plant Team Meeting.png) included.";
    const issues = await checkSpelling(content);
    const messages = issues.map((issue) => issue.message).join(" ");

    expect(messages).not.toContain("./images/Power Plant Team Meeting.png");
    expect(messages).not.toContain("Power Plant Team Meeting.png");
    expect(issues.length).toBeGreaterThan(0);
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

  it("handles empty content gracefully", async () => {
    const issues = await checkSpelling("");
    expect(issues).toEqual([]);
  });

  it("returns combined spell and grammar issues", async () => {
    const content = "This is a test sentance.";
    const issues = await checkSpellingAndGrammar(content);
    
    // Should return array of issues (may include grammar checks from API if available)
    expect(Array.isArray(issues)).toBe(true);
  });

  it("masks code blocks before grammar checking", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const content = `Outside text.
\`\`\`js
const sentance = "mispeling inside code";
\`\`\`

More outside text.`;

    await checkSpellingAndGrammar(content);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = fetchMock.mock.calls[0][1].body.toString();
    const requestText = new URLSearchParams(body).get("text") || "";
    expect(requestText).not.toContain("sentance");
    expect(requestText).not.toContain("mispeling");
    expect(requestText).toContain("Outside text.");
    expect(requestText).toContain("More outside text.");
  });

  it("masks image paths before grammar checking", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const content = "This sentence has an image ![Power Plant Team Meeting](./images/Power Plant Team Meeting.png) included.";

    await checkSpellingAndGrammar(content);

    const body = fetchMock.mock.calls[0][1].body.toString();
    const requestText = new URLSearchParams(body).get("text") || "";
    expect(requestText).not.toContain("./images/Power Plant Team Meeting.png");
    expect(requestText).toContain("This sentence has an image");
    expect(requestText).toContain("included.");
    expect(requestText).not.toContain("Power Plant Team Meeting");
  });

  it("includes headings and short bullet fragments in grammar checking input", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const content = `# Captive Power Plant Analysis

- Need review soon`;

    await checkSpellingAndGrammar(content);

    const body = fetchMock.mock.calls[0][1].body.toString();
    const requestText = new URLSearchParams(body).get("text") || "";
    expect(requestText).toContain("Captive Power Plant Analysis");
    expect(requestText).toContain("Need review soon");
  });

  it("falls back to local grammar heuristics when remote grammar check fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const issues = await checkGrammar("this is is duplicated text.");
    const messages = issues.map((issue) => issue.message).join(" ");

    expect(messages).toContain("Repeated word");
    expect(messages).toContain("capital letter");
  });

  it("skips grammar checks for technical count fragments but still allows spelling checks", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await checkGrammar("7 boiler (5 High Pressure, 2 Low Pressure)");

    expect(fetchMock).not.toHaveBeenCalled();

    const spellingIssues = await checkSpelling("7 boilar (5 High Pressure, 2 Low Pressure)");
    const messages = spellingIssues.map((issue) => issue.message).join(" ");
    expect(messages).toContain("boilar");
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
