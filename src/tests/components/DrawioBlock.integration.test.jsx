// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrawioBlock } from "../../components/DrawioBlock";

const drawioExistsMock = vi.fn();
const drawioReadSourceMock = vi.fn();
const drawioReadImageMock = vi.fn();

beforeEach(() => {
  drawioExistsMock.mockReset();
  drawioReadSourceMock.mockReset();
  drawioReadImageMock.mockReset();

  globalThis.notesApi = {
    drawioExists: (...args) => drawioExistsMock(...args),
    drawioReadSource: (...args) => drawioReadSourceMock(...args),
    drawioReadImage: (...args) => drawioReadImageMock(...args),
  };
});

afterEach(() => {
  delete globalThis.notesApi;
  document.body.innerHTML = "";
});

function renderBlock(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  act(() => {
    root.render(<DrawioBlock {...props} />);
  });

  return {
    host,
    unmount() {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function waitFor(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

describe("DrawioBlock", () => {
  it("renders placeholder state when diagram does not exist", async () => {
    drawioExistsMock.mockResolvedValue({ success: true, exists: false });

    const view = renderBlock({
      diagramId: "test-id",
    });

    await act(async () => {
      await waitFor(50);
    });

    expect(view.host.textContent).toContain("Click to create a Draw.io diagram");
    view.unmount();
  });

  it("renders preview image and action buttons when diagram exists", async () => {
    drawioExistsMock.mockResolvedValue({ success: true, exists: true });
    drawioReadImageMock.mockResolvedValue({ success: true, data: "data:image/png;base64,TEST" });

    const view = renderBlock({
      diagramId: "test-id",
    });

    await act(async () => {
      await waitFor(50);
    });

    const img = view.host.querySelector("img");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("data:image/png;base64,TEST");

    const buttons = view.host.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    view.unmount();
  });
});
