import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function readSource(relativePath) {
  const filePath = path.resolve(process.cwd(), relativePath);
  return fs.readFileSync(filePath, "utf8");
}

describe("Accessibility smoke coverage", () => {
  it("keeps required dialog semantics and keyboard escape handling", () => {
    const overlayDialog = readSource("src/components/OverlayDialog.jsx");
    expect(overlayDialog).toMatch(/role="dialog"/);
    expect(overlayDialog).toMatch(/aria-modal="true"/);
    expect(overlayDialog).toMatch(/aria-label=\{ariaLabel\}/);
    expect(overlayDialog).toMatch(/event\.key === "Escape"/);
  });

  it("keeps command palette keyboard navigation semantics", () => {
    const commandPalette = readSource("src/components/CommandPalette.jsx");
    expect(commandPalette).toMatch(/role="listbox"/);
    expect(commandPalette).toMatch(/role="option"/);
    expect(commandPalette).toMatch(/event\.key === "ArrowDown"/);
    expect(commandPalette).toMatch(/event\.key === "ArrowUp"/);
    expect(commandPalette).toMatch(/event\.key === "Home"/);
    expect(commandPalette).toMatch(/event\.key === "End"/);
  });

  it("keeps keyboard-openable note rows in table mode", () => {
    const documentList = readSource("src/components/DocumentList.jsx");
    expect(documentList).toMatch(/role="button"/);
    expect(documentList).toMatch(/tabIndex=\{0\}/);
    expect(documentList).toMatch(/event\.key === "Enter" \|\| event\.key === " "/);
  });
});
