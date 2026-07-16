// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceExportDialog } from "../../components/WorkspaceExportDialog";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderDialog(overrides = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  const props = {
    isOpen: true,
    values: {
      mode: "pdf",
      contentMode: "combined",
      includeMetadata: false,
      destinationPath: "C:/exports",
      fileName: "workspace.zip",
    },
    onClose: vi.fn(),
    onChange: vi.fn(),
    onBrowse: vi.fn(),
    onExport: vi.fn(),
    ...overrides,
  };

  act(() => {
    root.render(<WorkspaceExportDialog {...props} />);
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

describe("WorkspaceExportDialog", () => {
  it("closes export format and section export dropdowns after selection", () => {
    const view = renderDialog();

    const formatTrigger = view.host.querySelector("#workspace-export-mode");
    expect(formatTrigger).toBeTruthy();

    act(() => {
      formatTrigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(view.host.querySelector(".app-select-panel")).toBeTruthy();

    const webOption = Array.from(view.host.querySelectorAll(".app-select-option")).find((node) =>
      node.textContent?.includes("Web format"),
    );
    expect(webOption).toBeTruthy();

    act(() => {
      webOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      webOption.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(view.host.querySelector(".app-select-panel")).toBeFalsy();

    const sectionTrigger = view.host.querySelector("#workspace-export-content-mode");
    expect(sectionTrigger).toBeTruthy();

    act(() => {
      sectionTrigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(view.host.querySelector(".app-select-panel")).toBeTruthy();

    const separateOption = Array.from(view.host.querySelectorAll(".app-select-option")).find((node) =>
      node.textContent?.includes("Separate files"),
    );
    expect(separateOption).toBeTruthy();

    act(() => {
      separateOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      separateOption.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(view.host.querySelector(".app-select-panel")).toBeFalsy();

    view.unmount();
  });
});
