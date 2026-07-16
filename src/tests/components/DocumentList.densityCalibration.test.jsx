// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentList } from "../../components/DocumentList";
import { DOCUMENT_DENSITY_PROFILES } from "../../components/documentDensityProfiles";

vi.mock("../../services/electronService", () => ({
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

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DocumentList density calibration", () => {
  const docs = [
    {
      entryType: "file",
      title: "Density Note",
      filePath: "C:/notes/density.md",
      updatedAt: "2026-07-02T00:00:00.000Z",
      metadata: { time: "10:00", location: "Room A" },
      previewImages: [],
    },
  ];

  const baseProps = {
    documents: docs,
    onOpen: vi.fn(),
    onRemove: vi.fn(),
    loading: false,
    favorites: [],
    onToggleFavorite: vi.fn(),
  };

  it("publishes measurable compact and comfortable targets", () => {
    expect(DOCUMENT_DENSITY_PROFILES.compact.targetRowsPerViewport).toBeGreaterThan(
      DOCUMENT_DENSITY_PROFILES.comfortable.targetRowsPerViewport,
    );
    expect(DOCUMENT_DENSITY_PROFILES.compact.targetCardsPerViewport).toBeGreaterThan(
      DOCUMENT_DENSITY_PROFILES.comfortable.targetCardsPerViewport,
    );

    const view = renderList({ ...baseProps, viewMode: "table", density: "compact" });
    const compactTable = view.host.querySelector(".document-table-wrap");
    expect(compactTable?.getAttribute("data-density")).toBe("compact");
    expect(compactTable?.getAttribute("data-density-target-rows")).toBe(
      String(DOCUMENT_DENSITY_PROFILES.compact.targetRowsPerViewport),
    );

    view.rerender({ ...baseProps, viewMode: "tile", density: "comfortable" });
    const comfortableGrid = view.host.querySelector(".document-grid");
    expect(comfortableGrid?.getAttribute("data-density")).toBe("comfortable");
    expect(comfortableGrid?.getAttribute("data-density-target-cards")).toBe(
      String(DOCUMENT_DENSITY_PROFILES.comfortable.targetCardsPerViewport),
    );

    view.unmount();
  });
});
