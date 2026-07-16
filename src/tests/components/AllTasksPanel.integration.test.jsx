// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AllTasksPanel } from "../../components/AllTasksPanel";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderPanel(overrides = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  const docs = [
    {
      entryType: "file",
      filePath: "C:/notes/a.md",
      title: "Alpha",
      searchText: "- [ ] first task\n- [x] done task",
    },
  ];

  const props = {
    isOpen: true,
    documents: docs,
    onClose: vi.fn(),
    onOpenNote: vi.fn(),
    ...overrides,
  };

  act(() => {
    root.render(<AllTasksPanel {...props} />);
  });

  return {
    host,
    props,
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

describe("AllTasksPanel", () => {
  it("keeps search input and status segmented controls in the same controls row", () => {
    const view = renderPanel();

    const controls = view.host.querySelector(".tasks-panel-controls");
    expect(controls).toBeTruthy();

    const directChildren = Array.from(controls.children);
    expect(directChildren).toHaveLength(2);
    expect(directChildren[0].classList.contains("tasks-panel-search")).toBe(true);
    expect(directChildren[1].classList.contains("tasks-panel-filter-row")).toBe(true);

    const chips = Array.from(view.host.querySelectorAll(".tasks-status-chip"));
    expect(chips).toHaveLength(3);

    const labels = chips.map((node) => node.textContent?.trim().replace(/\s+/g, " "));
    expect(labels).toEqual(["All", "Open", "Closed"]);

    chips.forEach((chip) => {
      const icon = chip.querySelector("svg");
      expect(icon).toBeTruthy();
    });

    view.unmount();
  });
});
