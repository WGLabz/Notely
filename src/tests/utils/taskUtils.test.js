import { describe, expect, it } from "vitest";
import { extractOpenTasksFromDocuments, extractTasksFromDocuments, extractTasksFromText, getTaskCountsFromDocuments, getTaskCountsFromText } from "../../utils/taskUtils";

describe("taskUtils", () => {
  it("extracts open and closed tasks from note text", () => {
    const tasks = extractTasksFromText("- [ ] First\n- [x] Done\n* [ ] Second");

    expect(tasks).toEqual([
      expect.objectContaining({ status: "open", text: "First" }),
      expect.objectContaining({ status: "closed", text: "Done" }),
      expect.objectContaining({ status: "open", text: "Second" }),
    ]);

    expect(getTaskCountsFromText("- [ ] First\n- [x] Done\n* [ ] Second")).toEqual({
      open: 2,
      closed: 1,
      total: 3,
    });
  });

  it("reads task content from workspace document entries", () => {
    const documents = [
      {
        entryType: "file",
        filePath: "C:/notes/one.md",
        title: "One",
        searchText: "- [ ] Alpha\n- [x] Beta",
      },
      {
        entryType: "file",
        filePath: "C:/notes/two.md",
        title: "Two",
        rawNotes: "- [ ] Gamma",
      },
      {
        entryType: "folder",
        filePath: "C:/notes/sub",
        title: "Sub",
      },
    ];

    expect(extractOpenTasksFromDocuments(documents)).toEqual([
      expect.objectContaining({ filePath: "C:/notes/one.md", text: "Alpha" }),
      expect.objectContaining({ filePath: "C:/notes/two.md", text: "Gamma" }),
    ]);

    expect(extractTasksFromDocuments(documents)).toEqual([
      expect.objectContaining({ filePath: "C:/notes/one.md", status: "open", text: "Alpha" }),
      expect.objectContaining({ filePath: "C:/notes/one.md", status: "closed", text: "Beta" }),
      expect.objectContaining({ filePath: "C:/notes/two.md", status: "open", text: "Gamma" }),
    ]);

    expect(getTaskCountsFromDocuments(documents)).toEqual({
      open: 2,
      closed: 1,
      total: 3,
    });
  });
});