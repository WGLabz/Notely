// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { DocumentDetail } from "../../components/DocumentDetail";
import { NoteTabBar } from "../../components/NoteTabBar";
import { LandingListControls } from "../../components/LandingListControls";

vi.mock("../../components/ExcalidrawEditor", () => ({
  default: () => null,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

function renderComponent(jsx) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  act(() => {
    root.render(jsx);
  });

  return {
    host,
    unmount() {
      try {
        act(() => {
          root.unmount();
        });
      } catch {
        // ignore
      }
      if (host.parentNode) {
        host.parentNode.removeChild(host);
      }
    },
  };
}

describe("Reload Capabilities Integration Tests", () => {
  describe("DocumentDetail Disk Banner Reload", () => {
    it("calls onOpenDocument with forceReload: true when clicking Reload content from disk banner button", async () => {
      const onOpenDocumentMock = vi.fn().mockResolvedValue(undefined);
      const onNotifyMock = vi.fn();
      let diskChangeCallback;

      window.notesApi = {
        onDocumentChangedOnDisk: vi.fn((cb) => {
          diskChangeCallback = cb;
          return () => {};
        }),
        startWatching: vi.fn(),
        stopWatching: vi.fn(),
      };

      const doc = {
        filePath: "/workspace/note.md",
        title: "Test Note",
        header: "",
        rawNotes: "Original content",
        cleansed: "",
        hasRawNotes: true,
        hasCleansed: false,
      };

      const { host, unmount } = renderComponent(
        <DocumentDetail
          document={doc}
          onOpenDocument={onOpenDocumentMock}
          onNotify={onNotifyMock}
          autosaveEnabled={true}
          setAutosaveEnabled={vi.fn()}
        />
      );

      // Simulate external disk change event
      act(() => {
        diskChangeCallback?.({ filePath: "/workspace/note.md" });
      });

      // Banner should now be visible
      const reloadBtn = Array.from(host.querySelectorAll("button")).find((btn) =>
        btn.textContent.includes("Reload content from disk")
      );
      expect(reloadBtn).not.toBeNull();

      // Click reload button
      await act(async () => {
        reloadBtn.click();
      });

      expect(onOpenDocumentMock).toHaveBeenCalledWith("/workspace/note.md", {
        forceReload: true,
        preserveActiveTab: true,
      });
      expect(onNotifyMock).toHaveBeenCalledWith("Note reloaded from disk.", "success");

      unmount();
    });

    it("calls onReloadFromDisk when clicking Reload content from disk banner button if onReloadFromDisk is provided", async () => {
      const onReloadFromDiskMock = vi.fn().mockResolvedValue(undefined);
      const onNotifyMock = vi.fn();
      let diskChangeCallback;

      window.notesApi = {
        onDocumentChangedOnDisk: vi.fn((cb) => {
          diskChangeCallback = cb;
          return () => {};
        }),
        startWatching: vi.fn(),
        stopWatching: vi.fn(),
      };

      const doc = {
        filePath: "/workspace/note.md",
        title: "Test Note",
        header: "",
        rawNotes: "Original content",
        cleansed: "",
        hasRawNotes: true,
        hasCleansed: false,
      };

      const { host, unmount } = renderComponent(
        <DocumentDetail
          document={doc}
          onReloadFromDisk={onReloadFromDiskMock}
          onNotify={onNotifyMock}
          autosaveEnabled={true}
          setAutosaveEnabled={vi.fn()}
        />
      );

      act(() => {
        diskChangeCallback?.({ filePath: "/workspace/note.md" });
      });

      const reloadBtn = Array.from(host.querySelectorAll("button")).find((btn) =>
        btn.textContent.includes("Reload content from disk")
      );
      expect(reloadBtn).not.toBeNull();

      await act(async () => {
        reloadBtn.click();
      });

      expect(onReloadFromDiskMock).toHaveBeenCalledWith("/workspace/note.md");
      expect(onNotifyMock).toHaveBeenCalledWith("Note reloaded from disk.", "success");

      unmount();
    });
  });

  describe("NoteTabBar Context Menu", () => {
    it("renders Reload from Disk option in tab context menu and triggers onReloadFromDisk", () => {
      const onReloadFromDiskMock = vi.fn();

      const { host, unmount } = renderComponent(
        <NoteTabBar
          openTabs={["/workspace/note1.md", "/workspace/note2.md"]}
          activeTabPath="/workspace/note1.md"
          onReloadFromDisk={onReloadFromDiskMock}
        />
      );

      const activeTab = host.querySelector(".note-tab.active");
      expect(activeTab).not.toBeNull();

      // Right-click on active tab
      act(() => {
        activeTab.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
      });

      const contextMenu = host.querySelector(".tab-context-menu");
      expect(contextMenu).not.toBeNull();

      const reloadMenuItem = Array.from(contextMenu.querySelectorAll("button")).find((btn) =>
        btn.textContent.includes("Reload from Disk")
      );
      expect(reloadMenuItem).toBeDefined();

      act(() => {
        reloadMenuItem.click();
      });

      expect(onReloadFromDiskMock).toHaveBeenCalledWith("/workspace/note1.md");

      unmount();
    });
  });

  describe("LandingListControls Workspace Reload", () => {
    it("renders Reload button and triggers onReloadWorkspace when clicked", () => {
      const onReloadWorkspaceMock = vi.fn();

      const { host, unmount } = renderComponent(
        <LandingListControls
          query=""
          onQueryChange={vi.fn()}
          typeFilter="all"
          onTypeFilterChange={vi.fn()}
          sortBy="updated-desc"
          onSortByChange={vi.fn()}
          visibleCount={5}
          totalCount={5}
          visibleFolderCount={1}
          totalFolderCount={1}
          visibleNoteCount={4}
          totalNoteCount={4}
          onReloadWorkspace={onReloadWorkspaceMock}
        />
      );

      const reloadBtn = host.querySelector(".landing-reload-btn");
      expect(reloadBtn).not.toBeNull();
      expect(reloadBtn.textContent).toContain("Reload");

      act(() => {
        reloadBtn.click();
      });

      expect(onReloadWorkspaceMock).toHaveBeenCalledTimes(1);

      unmount();
    });
  });
});
