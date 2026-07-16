import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ALLOWED_ICON_SIZES = new Set([12, 14, 16, 18, 20]);

function collectComponentFiles(rootDir) {
  const output = [];
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".jsx")) {
        output.push(fullPath);
      }
    }
  }

  return output;
}

describe("Iconography normalization", () => {
  it("uses only approved Lucide icon size steps", () => {
    const componentsRoot = path.resolve(process.cwd(), "src/components");
    const files = collectComponentFiles(componentsRoot);
    const offenders = [];

    const iconSizePattern = /\bsize=\{(\d+)\}/g;

    for (const filePath of files) {
      const source = fs.readFileSync(filePath, "utf8");
      let match = iconSizePattern.exec(source);
      while (match) {
        const size = Number(match[1]);
        if (!ALLOWED_ICON_SIZES.has(size)) {
          const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
          offenders.push(`${relativePath}: size={${size}}`);
        }
        match = iconSizePattern.exec(source);
      }
    }

    expect(offenders).toEqual([]);
  });
});
