import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { X, Plus, ChevronDown, FolderOpen, ExternalLink, Edit2 } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useWorkspaceMetadata } from "../hooks/useWorkspaceMetadata";
import { IconColorPickerModal } from "./IconColorPickerModal";
import { getContrastColor } from "../utils/colorUtils";

export function NoteTabBar({
  openTabs = [],
  activeTabPath = null,
  tabStates = {},
  documents = [],
  onSelectTab,
  onCloseTab,
  onNewTab,
  onNewFolder,
  onCloseOthers,
  onCloseToRight,
  onCloseSaved,
  onCloseAll,
  onOpenInEditor,
  onRevealInExplorer,
}) {
  const barRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, filePath }
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const [pickerState, setPickerState] = useState({ isOpen: false, entry: null });
  const { getMetadata, updateMetadata } = useWorkspaceMetadata();

  // Measure container width
  useEffect(() => {
    if (!barRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(barRef.current);
    return () => observer.disconnect();
  }, []);


  // Close menus on click-away
  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null);
      setDropdownOpen(false);
      setAddDropdownOpen(false);
    };
    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("contextmenu", handleGlobalClick);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("contextmenu", handleGlobalClick);
    };
  }, []);

  const docMap = useMemo(() => {
    return new Map((documents || []).map((doc) => [doc.filePath, doc]));
  }, [documents]);

  const closedNotes = useMemo(() => {
    return (documents || [])
      .filter((doc) => doc.entryType === "file" && !openTabs.includes(doc.filePath));
  }, [documents, openTabs]);

  const getTabTitle = useCallback((filePath) => {
    const cachedDoc = tabStates[filePath]?.doc;
    if (cachedDoc?.title) return cachedDoc.title;
    const metaDoc = docMap.get(filePath);
    if (metaDoc?.title) return metaDoc.title;
    const parts = filePath.split(/[\\/]/);
    const basename = parts[parts.length - 1] || filePath;
    return basename.replace(/\.md$/i, "");
  }, [tabStates, docMap]);

  // Listen for set-icon-and-color action from main menu
  useEffect(() => {
    const handleSetIcon = () => {
      if (activeTabPath) {
        setPickerState({ isOpen: true, entry: { filePath: activeTabPath, title: getTabTitle(activeTabPath) } });
      }
    };
    window.addEventListener("app:set-icon-and-color", handleSetIcon);
    return () => window.removeEventListener("app:set-icon-and-color", handleSetIcon);
  }, [activeTabPath, getTabTitle]);

  const isTabDirty = (filePath) => {
    const state = tabStates[filePath];
    if (!state) return false;
    const { doc, savedHash } = state;
    if (!doc) return false;
    const currentHash = JSON.stringify({
      header: doc.header || "",
      rawNotes: doc.rawNotes || "",
      cleansed: doc.cleansed || "",
    });
    return currentHash !== savedHash;
  };

  // Calculate visible vs overflow tabs
  // Subtract space for: + button (30px), overflow dropdown (80px), paddings (20px) -> ~130px
  const availableWidth = Math.max(200, containerWidth - 130);
  const maxTabs = Math.max(1, Math.floor(availableWidth / 125));

  let visibleTabs = [...openTabs];
  let overflowTabs = [];

  if (openTabs.length > maxTabs) {
    const limit = Math.max(1, maxTabs - 1);
    const activeIndex = openTabs.indexOf(activeTabPath);

    if (activeIndex >= limit && activeIndex !== -1) {
      // Active tab is in overflow section; bubble it to the visible section
      const reordered = [
        activeTabPath,
        ...openTabs.filter((p) => p !== activeTabPath),
      ];
      visibleTabs = reordered.slice(0, limit);
      overflowTabs = reordered.slice(limit);
    } else {
      visibleTabs = openTabs.slice(0, limit);
      overflowTabs = openTabs.slice(limit);
    }
  }

  const handleContextMenu = (e, filePath) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      filePath,
    });
    setDropdownOpen(false);
    setAddDropdownOpen(false);
  };

  if (!openTabs.length) return null;

  return (
    <div className="note-tab-bar" ref={barRef} role="tablist" aria-label="Open notes">
      <div className="note-tab-list">
        {visibleTabs.map((filePath) => {
          const isActive = filePath === activeTabPath;
          const isDirty = isTabDirty(filePath);
          const title = getTabTitle(filePath);
          const meta = getMetadata(filePath) || {};
          const TabIcon = meta.icon && LucideIcons[meta.icon] ? LucideIcons[meta.icon] : null;

          return (
            <div
              key={filePath}
              className={`note-tab${isActive ? " active" : ""}${isDirty ? " dirty" : ""}`}
              role="tab"
              aria-selected={isActive}
              title={filePath}
              onContextMenu={(e) => handleContextMenu(e, filePath)}
              style={meta.color ? {
                backgroundColor: meta.color,
                color: getContrastColor(meta.color),
                '--tab-text': getContrastColor(meta.color)
              } : {}}
            >
              <button
                className="note-tab-title-btn"
                type="button"
                onClick={() => onSelectTab?.(filePath)}
                style={meta.color ? { color: 'inherit' } : {}}
              >
                {TabIcon && <TabIcon size={14} style={{ marginRight: 6 }} />}
                <span className="note-tab-text">
                  {title}
                </span>
                {isDirty && <span className="note-tab-dirty-dot" aria-label="Unsaved changes" style={meta.color ? { backgroundColor: 'currentColor' } : {}} />}
              </button>
              <button
                className="note-tab-close-btn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab?.(filePath);
                }}
                aria-label={`Close ${title}`}
                style={meta.color ? { color: 'inherit' } : {}}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}

        {overflowTabs.length > 0 && (
          <div className="note-tab-overflow-container">
            <button
              className="note-tab-overflow-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDropdownOpen(!dropdownOpen);
                setContextMenu(null);
                setAddDropdownOpen(false);
              }}
              aria-haspopup="true"
              aria-expanded={dropdownOpen}
            >
              <span>+{overflowTabs.length} more</span>
              <ChevronDown size={12} />
            </button>

            {dropdownOpen && (
              <div className="note-tab-overflow-dropdown" role="menu">
                {overflowTabs.map((filePath) => {
                  const isDirty = isTabDirty(filePath);
                  const title = getTabTitle(filePath);
                  const isActive = filePath === activeTabPath;
                  const meta = getMetadata(filePath) || {};
                  const TabIcon = meta.icon && LucideIcons[meta.icon] ? LucideIcons[meta.icon] : null;

                  return (
                    <button
                      key={filePath}
                      className={`note-tab-overflow-item${isActive ? " active" : ""}${isDirty ? " dirty" : ""}`}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onSelectTab?.(filePath);
                        setDropdownOpen(false);
                      }}
                      onContextMenu={(e) => handleContextMenu(e, filePath)}
                      title={filePath}
                      style={meta.color ? {
                        backgroundColor: meta.color,
                        color: getContrastColor(meta.color)
                      } : {}}
                    >
                      {TabIcon && <TabIcon size={14} style={{ marginRight: 6 }} />}
                      <span className="note-tab-text">{title}</span>
                      {isDirty && <span className="note-tab-dirty-dot" style={meta.color ? { backgroundColor: 'currentColor' } : {}} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="note-tab-add-container">
        <button
          className="note-tab-add-btn"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setAddDropdownOpen(!addDropdownOpen);
            setContextMenu(null);
            setDropdownOpen(false);
          }}
          title="Create or open note"
          data-tooltip="Create or open note"
          aria-label="Create or open note"
          aria-haspopup="true"
          aria-expanded={addDropdownOpen}
        >
          <Plus size={14} />
        </button>

        {addDropdownOpen && (
          <div className="note-tab-add-dropdown" role="menu" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onNewTab?.();
                setAddDropdownOpen(false);
              }}
            >
              Create New Note...
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onNewFolder?.();
                setAddDropdownOpen(false);
              }}
            >
              Create New Folder...
            </button>
            
            {closedNotes.length > 0 && (
              <>
                <div className="note-tab-add-dropdown-separator" />
                <div className="note-tab-add-dropdown-header">Open Note</div>
                <div className="note-tab-add-dropdown-scroll">
                  {closedNotes.map((note) => (
                    <button
                      key={note.filePath}
                      type="button"
                      role="menuitem"
                      className="note-tab-add-dropdown-item"
                      title={note.filePath}
                      onClick={() => {
                        onSelectTab?.(note.filePath);
                        setAddDropdownOpen(false);
                      }}
                    >
                      {note.title || note.filePath.split(/[\\/]/).pop().replace(/\.md$/i, "")}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right-click Context Menu */}
      {contextMenu && (
        <div
          className="tab-context-menu"
          style={{
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
          }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCloseTab?.(contextMenu.filePath);
              setContextMenu(null);
            }}
          >
            <X size={14} />
            Close Tab
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCloseOthers?.(contextMenu.filePath);
              setContextMenu(null);
            }}
          >
            Close Other Tabs
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCloseToRight?.(contextMenu.filePath);
              setContextMenu(null);
            }}
          >
            Close Tabs to the Right
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCloseSaved?.();
              setContextMenu(null);
            }}
          >
            Close Saved Tabs
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCloseAll?.();
              setContextMenu(null);
            }}
          >
            Close All Tabs
          </button>
          <div className="tab-context-menu-separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenInEditor?.(contextMenu.filePath);
              setContextMenu(null);
            }}
          >
            <ExternalLink size={14} />
            Open in VS Code
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onRevealInExplorer?.(contextMenu.filePath);
              setContextMenu(null);
            }}
          >
            <FolderOpen size={14} />
            Reveal in File Explorer
          </button>
          <div className="tab-context-menu-separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setPickerState({ isOpen: true, entry: { filePath: contextMenu.filePath, title: getTabTitle(contextMenu.filePath) } });
              setContextMenu(null);
            }}
          >
            <Edit2 size={14} />
            Set Icon & Color
          </button>
        </div>
      )}
      {pickerState.isOpen && (
        <IconColorPickerModal
          isOpen={true}
          onClose={() => setPickerState({ isOpen: false, entry: null })}
          initialIcon={getMetadata(pickerState.entry?.filePath)?.icon}
          initialColor={getMetadata(pickerState.entry?.filePath)?.color}
          targetName={pickerState.entry?.title}
          onSave={(updates) => updateMetadata(pickerState.entry?.filePath, updates)}
        />
      )}
    </div>
  );
}
