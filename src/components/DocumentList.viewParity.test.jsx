// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentList } from "./DocumentList";

vi.mock("../services/electronService", () => ({
  readImage: vi.fn(async () => "data:image/png;base64,"),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderList(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  act(() => {
    root.render(<DocumentList {...props} />);
  });

  return {
    host,
    rerender(nextProps) {
      act(() => {
        root.render(<DocumentList {...nextProps} />);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function collectActionLabels(host) {
  return Array.from(host.querySelectorAll(".document-card-actions [aria-label]"))
    .map((node) => node.getAttribute("aria-label"))
    .filter(Boolean)
    .sort();
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DocumentList table/tile parity", () => {
  const docs = [
    {
      entryType: "folder",
      title: "Work",
      filePath: "C:/notes/Work",
      updatedAt: "2026-07-01T10:00:00.000Z",
      metadata: {},
    },
    {
      entryType: "file",
      title: "Sprint Notes",
      filePath: "C:/notes/Work/sprint.md",
      updatedAt: "2026-07-01T11:00:00.000Z",
      metadata: { time: "10:00", location: "Room A" },
      previewImages: [],
    },
  ];

  const baseProps = {
    documents: docs,
    onOpen: vi.fn(),
    onRemove: vi.fn(),
    loading: false,
    favorites: ["C:/notes/Work/sprint.md"],
    onToggleFavorite: vi.fn(),
  };

  it("keeps metadata and action affordances equivalent between table and tile", () => {
    const view = renderList({ ...baseProps, viewMode: "table" });
    const tableActionLabels = collectActionLabels(view.host);

    expect(view.host.textContent).toContain("Contains notes and subfolders");
    expect(view.host.textContent).toContain("10:00 - Room A");

    view.rerender({ ...baseProps, viewMode: "tile" });
    const tileActionLabels = collectActionLabels(view.host);

    expect(view.host.textContent).toContain("Contains notes and subfolders");
    expect(view.host.textContent).toContain("10:00 - Room A");
    expect(tileActionLabels).toEqual(tableActionLabels);

    view.unmount();
  });
});
