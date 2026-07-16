// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppSelect from "../../components/AppSelect";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderSelectInLabel({ value = "a", onChange = vi.fn() } = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  act(() => {
    root.render(
      <label htmlFor="test-select" className="overlay-dialog-field">
        <span>Pick</span>
        <AppSelect id="test-select" value={value} onChange={onChange}>
          <option value="a">Option A</option>
          <option value="b">Option B</option>
          <option value="c">Option C</option>
        </AppSelect>
      </label>,
    );
  });

  return {
    host,
    root,
    onChange,
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

describe("AppSelect", () => {
  it("closes after option selection when wrapped by a label", () => {
    const view = renderSelectInLabel();

    const trigger = view.host.querySelector("#test-select");
    expect(trigger).toBeTruthy();

    act(() => {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(view.host.querySelector(".app-select-panel")).toBeTruthy();

    const optionB = Array.from(view.host.querySelectorAll(".app-select-option")).find((node) =>
      node.textContent?.includes("Option B"),
    );
    expect(optionB).toBeTruthy();

    act(() => {
      optionB.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      optionB.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(view.onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ value: "b", id: "test-select" }),
      }),
    );
    expect(view.host.querySelector(".app-select-panel")).toBeFalsy();

    view.unmount();
  });
});
