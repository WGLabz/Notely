// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitStatusBar } from "../../components/GitStatusBar";
import { GitCommitDialog } from "../../components/GitCommitDialog";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("GitStatusBar", () => {
  it("renders loading state", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(<GitStatusBar gitState={{ loading: true }} />);
    });

    const button = host.querySelector("button");
    expect(button).toBeTruthy();
    expect(button.textContent).toContain("Git…");
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it("renders non-repo warn state", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onClick = vi.fn();

    act(() => {
      root.render(
        <GitStatusBar
          gitState={{ gitAvailable: true, isRepo: false, loading: false }}
          onClick={onClick}
        />
      );
    });

    const button = host.querySelector("button");
    expect(button).toBeTruthy();
    expect(button.textContent).toContain("No repo");
    expect(button.classList.contains("git-status-bar--warn")).toBe(true);

    act(() => {
      button.click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it("renders clean branch state", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <GitStatusBar
          gitState={{ gitAvailable: true, isRepo: true, branch: "main", pendingCount: 0, loading: false }}
        />
      );
    });

    const button = host.querySelector("button");
    expect(button).toBeTruthy();
    expect(button.textContent).toContain("main");
    expect(button.classList.contains("git-status-bar--clean")).toBe(true);
    expect(host.querySelector(".git-status-bar__badge")).toBeFalsy();

    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it("renders pending count state", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <GitStatusBar
          gitState={{ gitAvailable: true, isRepo: true, branch: "feature-branch", pendingCount: 5, loading: false }}
        />
      );
    });

    const button = host.querySelector("button");
    expect(button).toBeTruthy();
    expect(button.textContent).toContain("feature-branch");
    expect(button.classList.contains("git-status-bar--pending")).toBe(true);

    const badge = host.querySelector(".git-status-bar__badge");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe("5");

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});

describe("GitCommitDialog", () => {
  it("allows typing a commit message and triggers commit", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onCommit = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();

    const files = [
      { path: "note1.md", status: "modified" },
      { path: "note2.md", status: "added" }
    ];

    act(() => {
      root.render(
        <GitCommitDialog
          open={true}
          onClose={onClose}
          onCommit={onCommit}
          stagedFiles={files}
          workspacePath="C:/notes"
        />
      );
    });

    // Check that files are rendered
    const fileLabels = host.querySelectorAll(".git-commit-dialog__file-path");
    expect(fileLabels).toHaveLength(2);
    expect(fileLabels[0].textContent).toBe("note1.md");

    // Message input
    const textarea = host.querySelector("textarea");
    expect(textarea).toBeTruthy();

    act(() => {
      const nativeValueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      ).set;
      nativeValueSetter.call(textarea, "feat: add new notes");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Locate primary submit button
    const buttons = host.querySelectorAll("button");
    let commitBtn = null;
    buttons.forEach((btn) => {
      if (btn.textContent.includes("Commit")) {
        commitBtn = btn;
      }
    });
    expect(commitBtn).toBeTruthy();

    // Trigger commit
    await act(async () => {
      commitBtn.click();
    });

    expect(onCommit).toHaveBeenCalledWith({
      message: "feat: add new notes",
      filePaths: ["note1.md", "note2.md"]
    });

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});
