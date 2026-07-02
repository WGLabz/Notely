import { useEffect, useMemo, useRef, useState } from "react";
import {
  Excalidraw,
  exportToCanvas,
  exportToSvg,
  loadLibraryFromBlob,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { writeDiagramImage } from "../services/diagramService";
import OverlayDialog from "./OverlayDialog";
import "./ExcalidrawEditor.css";

const BUNDLED_EXCALIDRAW_LIBRARY_URLS = Object.values(
  import.meta.glob(
    "../assets/excalidraw-libraries/*.excalidrawlib",
    { eager: true, import: "default", query: "?url" },
  ),
).sort((a, b) => String(a).localeCompare(String(b)));

const MAX_SEARCH_RESULTS = 12;

function sanitizeAppStateForPersistence(appState) {
  const safeAppState = {
    ...(appState || {}),
  };

  // collaborators is runtime collaboration state and cannot be faithfully JSON-serialized.
  delete safeAppState.collaborators;

  return safeAppState;
}

function normalizeInitialDiagramData(initialData) {
  if (!initialData || typeof initialData !== "object") {
    return {
      elements: [],
      appState: {
        viewBackgroundColor: "#ffffff",
      },
    };
  }

  const safeAppState = {
    ...(initialData.appState || {}),
  };

  const collaborators = safeAppState.collaborators;
  if (
    collaborators != null &&
    !(collaborators instanceof Map) &&
    !Array.isArray(collaborators)
  ) {
    safeAppState.collaborators = [];
  }

  if (!safeAppState.viewBackgroundColor) {
    safeAppState.viewBackgroundColor = "#ffffff";
  }

  return {
    ...initialData,
    elements: Array.isArray(initialData.elements) ? initialData.elements : [],
    appState: safeAppState,
    files: initialData.files || {},
  };
}

function createElementId() {
  return `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneLibraryElementsForInsertion(elements, targetCenterX, targetCenterY) {
  const safeElements = Array.isArray(elements) ? elements : [];
  if (!safeElements.length) return [];

  const bounds = safeElements.reduce(
    (acc, element) => {
      const width = Number(element?.width) || 0;
      const height = Number(element?.height) || 0;
      const x = Number(element?.x) || 0;
      const y = Number(element?.y) || 0;
      return {
        minX: Math.min(acc.minX, x),
        minY: Math.min(acc.minY, y),
        maxX: Math.max(acc.maxX, x + width),
        maxY: Math.max(acc.maxY, y + height),
      };
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );

  const sourceCenterX = (bounds.minX + bounds.maxX) / 2;
  const sourceCenterY = (bounds.minY + bounds.maxY) / 2;
  const deltaX = targetCenterX - sourceCenterX;
  const deltaY = targetCenterY - sourceCenterY;

  const idMap = new Map();
  const groupIdMap = new Map();
  for (const element of safeElements) {
    idMap.set(element.id, createElementId());
    for (const groupId of element.groupIds || []) {
      if (!groupIdMap.has(groupId)) {
        groupIdMap.set(groupId, createElementId());
      }
    }
  }

  return safeElements.map((element) => {
    const nextId = idMap.get(element.id) || createElementId();
    const next = {
      ...element,
      id: nextId,
      x: (Number(element?.x) || 0) + deltaX,
      y: (Number(element?.y) || 0) + deltaY,
      groupIds: (element.groupIds || []).map((groupId) => groupIdMap.get(groupId) || groupId),
      version: (Number(element?.version) || 1) + 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
      updated: Date.now(),
      isDeleted: false,
    };

    if (element.boundElements) {
      next.boundElements = element.boundElements.map((bound) => ({
        ...bound,
        id: idMap.get(bound.id) || bound.id,
      }));
    }
    if (element.containerId) {
      next.containerId = idMap.get(element.containerId) || element.containerId;
    }
    if (element.frameId) {
      next.frameId = idMap.get(element.frameId) || element.frameId;
    }
    if (element.startBinding?.elementId) {
      next.startBinding = {
        ...element.startBinding,
        elementId: idMap.get(element.startBinding.elementId) || element.startBinding.elementId,
      };
    }
    if (element.endBinding?.elementId) {
      next.endBinding = {
        ...element.endBinding,
        elementId: idMap.get(element.endBinding.elementId) || element.endBinding.elementId,
      };
    }

    return next;
  });
}

const ExcalidrawComponent = ({
  initialData,
  diagramId,
  documentPath,
  onClose,
  onSave,
}) => {
  const excalidrawAPIRef = useRef(null);
  const [isSaving, setIsSaving] = useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [loadedLibraryItems, setLoadedLibraryItems] = useState([]);
  const [libraryItemPreviews, setLibraryItemPreviews] = useState({});
  const [insertError, setInsertError] = useState("");
  const [libraryLoadError, setLibraryLoadError] = useState("");
  const hasLoadedBundledLibrariesRef = useRef(false);

  const filteredLibraryItems = useMemo(() => {
    const query = librarySearchQuery.trim().toLowerCase();
    if (!query) return [];

    return loadedLibraryItems
      .filter((item) => item.name.toLowerCase().includes(query))
      .slice(0, MAX_SEARCH_RESULTS);
  }, [loadedLibraryItems, librarySearchQuery]);

  const normalizedInitialData = useMemo(
    () => normalizeInitialDiagramData(initialData),
    [initialData],
  );

  useEffect(() => {
    if (!filteredLibraryItems.length) return;

    let isDisposed = false;

    const generatePreviews = async () => {
      for (const item of filteredLibraryItems) {
        if (libraryItemPreviews[item.key]) continue;

        try {
          const svg = await exportToSvg({
            elements: item.elements,
            appState: {
              viewBackgroundColor: "#ffffff",
              exportBackground: false,
            },
            files: null,
            skipInliningFonts: true,
          });
          const previewUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;

          if (isDisposed) return;
          setLibraryItemPreviews((previous) => {
            if (previous[item.key]) return previous;
            return {
              ...previous,
              [item.key]: previewUrl,
            };
          });
        } catch (error) {
          console.warn("Failed to build search preview for library item:", item.name, error);
        }
      }
    };

    void generatePreviews();
    return () => {
      isDisposed = true;
    };
  }, [filteredLibraryItems, libraryItemPreviews]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleSave = async () => {
    if (!excalidrawAPIRef.current || isSaving) return;

    setIsSaving(true);
    try {
      const elements = excalidrawAPIRef.current.getSceneElements();
      const appState = excalidrawAPIRef.current.getAppState();
      const files = excalidrawAPIRef.current.getFiles();

      const diagramData = {
        elements,
        appState: sanitizeAppStateForPersistence(appState),
        files,
      };

      const canvas = await exportToCanvas({
        elements,
        appState: {
          ...appState,
          exportBackground: true,
          // Always export a white image background so embedded note previews stay visually consistent.
          viewBackgroundColor: "#ffffff",
        },
        files,
      });
      const imageData = canvas.toDataURL("image/png");

      if (documentPath && diagramId) {
        await writeDiagramImage(documentPath, diagramId, imageData);
      }

      onSave?.(diagramData, imageData);
    } catch (err) {
      console.error("Failed to save Excalidraw diagram:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const insertLibraryItem = (libraryItem) => {
    const api = excalidrawAPIRef.current;
    if (!api || !libraryItem?.elements?.length) return;

    try {
      setInsertError("");
      const sceneElements = api.getSceneElements();
      const appState = api.getAppState();

      const scrollX = Number(appState?.scrollX) || 0;
      const scrollY = Number(appState?.scrollY) || 0;
      const zoom = Number(appState?.zoom?.value) || 1;
      const viewportWidth = Number(appState?.width) || 1280;
      const viewportHeight = Number(appState?.height) || 720;

      const viewportCenterX = -scrollX + viewportWidth / (2 * zoom);
      const viewportCenterY = -scrollY + viewportHeight / (2 * zoom);
      const insertOffset = Math.min(48, (sceneElements.length % 6) * 8);

      const clonedElements = cloneLibraryElementsForInsertion(
        libraryItem.elements,
        viewportCenterX + insertOffset,
        viewportCenterY + insertOffset,
      );

      if (!clonedElements.length) {
        setInsertError("Unable to insert this library item.");
        return;
      }

      api.updateScene({
        elements: [...sceneElements, ...clonedElements],
        appState: {
          ...appState,
          selectedElementIds: clonedElements.reduce((acc, element) => {
            acc[element.id] = true;
            return acc;
          }, {}),
        },
      });

      setLibrarySearchQuery("");
    } catch (error) {
      console.error("Failed to insert library item:", error);
      setInsertError("Unable to insert this library item.");
    }
  };

  const loadBundledLibraries = async () => {
    const api = excalidrawAPIRef.current;
    if (!api || hasLoadedBundledLibrariesRef.current) return;

    setLibraryLoadError("");
    setLoadedLibraryItems([]);
    setLibraryItemPreviews({});

    try {
      let loadedExternalLibraries = 0;
      let loadedExternalItems = 0;
      let failedExternalLibraries = 0;
      const indexedLibraryItems = [];

      for (const url of BUNDLED_EXCALIDRAW_LIBRARY_URLS) {
        try {
          const response = await fetch(url, { cache: "force-cache" });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const blob = await response.blob();
          const libraryItems = await loadLibraryFromBlob(blob, "published");

          if (!libraryItems?.length) {
            continue;
          }

          await api.updateLibrary({
            libraryItems,
            merge: true,
            defaultStatus: "published",
          });

          indexedLibraryItems.push(
            ...libraryItems
              .filter((item) => item?.elements?.length)
              .map((item, index) => ({
                key: `${item.id || "item"}-${loadedExternalLibraries}-${index}`,
                name: String(item.name || "Untitled Item"),
                elements: item.elements,
              })),
          );

          loadedExternalLibraries += 1;
          loadedExternalItems += libraryItems.length;
        } catch (error) {
          failedExternalLibraries += 1;
          console.warn("Skipped bundled Excalidraw library:", url, error);
        }
      }

      console.info("Excalidraw bundled library load summary:", {
        discovered: BUNDLED_EXCALIDRAW_LIBRARY_URLS.length,
        loadedExternalLibraries,
        loadedExternalItems,
        failedExternalLibraries,
        indexedLibraryItems: indexedLibraryItems.length,
      });

      setLoadedLibraryItems(indexedLibraryItems);

      if (!loadedExternalLibraries) {
        setLibraryLoadError("Bundled public libraries could not be loaded.");
      } else if (failedExternalLibraries > 0) {
        setLibraryLoadError("Some bundled public libraries could not be loaded.");
      }

      hasLoadedBundledLibrariesRef.current = true;
    } catch (error) {
      console.error("Failed to load bundled Excalidraw libraries:", error);
      setLibraryLoadError("Libraries could not be loaded. Please reopen the editor.");
    }
  };

  useEffect(() => {
    void loadBundledLibraries();
  }, []);

  return (
    <OverlayDialog
      onClose={onClose}
      ariaLabel="Create or edit diagram"
      overlayClassName="excalidraw-modal-overlay"
      cardClassName="excalidraw-modal-container"
      useDefaultCardClass={false}
    >
        <div className="excalidraw-modal-header">
          <h2>Create/Edit Diagram</h2>
          <div className="excalidraw-library-search" aria-label="Search library components">
            <input
              value={librarySearchQuery}
              onChange={(event) => setLibrarySearchQuery(event.target.value)}
              placeholder="Search library components..."
            />
            {librarySearchQuery.trim() ? (
              <div className="excalidraw-library-search-results">
                {filteredLibraryItems.length ? (
                  filteredLibraryItems.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => insertLibraryItem(item)}
                      title={item.name}
                    >
                      <span className="library-search-result-preview" aria-hidden="true">
                        {libraryItemPreviews[item.key] ? (
                          <img src={libraryItemPreviews[item.key]} alt="" />
                        ) : (
                          <span className="library-search-result-preview-fallback">Preview</span>
                        )}
                      </span>
                      <span className="library-search-result-name">{item.name}</span>
                    </button>
                  ))
                ) : (
                  <p>No matching library items.</p>
                )}
              </div>
            ) : null}
          </div>
          <div className="excalidraw-modal-actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Diagram"}
            </button>
            <button className="btn btn-secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
          </div>
        </div>

        <div className="excalidraw-workspace">
          <div className="excalidraw-editor-container">
            {insertError ? <p className="toolbar-inline-error">{insertError}</p> : null}
            {libraryLoadError ? <p className="toolbar-inline-error">{libraryLoadError}</p> : null}
            <Excalidraw
              excalidrawAPI={(api) => {
                excalidrawAPIRef.current = api;
                void loadBundledLibraries();
              }}
              initialData={normalizedInitialData}
              theme="light"
            />
          </div>
        </div>
    </OverlayDialog>
  );
};

export default ExcalidrawComponent;
