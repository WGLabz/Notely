import React, { useState, useEffect, useRef } from "react";
import { Minus, Square, Copy, X, Check, ChevronRight, Globe } from "lucide-react";
import notelyMark from "../../assets/branding/notely-mark.png";

export function TitleBar({ title = "Notely", onOpenWebsite }) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [menuStructure, setMenuStructure] = useState([]);
  const [activeMenuIndex, setActiveMenuIndex] = useState(null);
  const [activeSubmenuPath, setActiveSubmenuPath] = useState([]); // Array of indexes tracing active submenus

  const containerRef = useRef(null);

  useEffect(() => {
    // Check initial maximized state
    if (window.notesApi?.isWindowMaximized) {
      window.notesApi.isWindowMaximized().then(setIsMaximized).catch(() => {});
    }

    const loadMenuStructure = () => {
      if (window.notesApi?.getMenuStructure) {
        window.notesApi.getMenuStructure().then(setMenuStructure).catch(() => {});
      }
    };

    // Fetch initial dynamic menu structure
    loadMenuStructure();

    // Subscribe to menu updates from main process
    let unsubscribeMenu = () => {};
    if (window.notesApi?.onMenuUpdated) {
      unsubscribeMenu = window.notesApi.onMenuUpdated(loadMenuStructure);
    }

    // Subscribe to state changes from main process
    let unsubscribeMax = () => {};
    if (window.notesApi?.onWindowMaximizedChanged) {
      unsubscribeMax = window.notesApi.onWindowMaximizedChanged((maximized) => {
        setIsMaximized(maximized);
      });
    }

    return () => {
      unsubscribeMenu();
      unsubscribeMax();
    };
  }, []);

  // Handle clicking outside to close menus
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        closeAllMenus();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        closeAllMenus();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const closeAllMenus = () => {
    setActiveMenuIndex(null);
    setActiveSubmenuPath([]);
  };

  const handleMinimize = () => {
    window.notesApi?.minimizeWindow?.();
  };

  const handleMaximize = () => {
    window.notesApi?.maximizeWindow?.();
  };

  const handleClose = () => {
    window.notesApi?.closeWindow?.();
  };

  const handleTopLevelClick = (index) => {
    if (activeMenuIndex === index) {
      closeAllMenus();
    } else {
      setActiveMenuIndex(index);
      setActiveSubmenuPath([]);
    }
  };

  const handleTopLevelMouseEnter = (index) => {
    if (activeMenuIndex !== null) {
      setActiveMenuIndex(index);
      setActiveSubmenuPath([]);
    }
  };

  const handleItemClick = (item, indexPath) => {
    if (item.enabled === false) return;
    if (item.submenu) return; // Submenus open on hover/interaction

    window.notesApi?.executeMenuItem?.({
      indexPath
    });
    closeAllMenus();
  };

  // Helper to format shortcuts/accelerators (e.g. CmdOrCtrl+N -> Ctrl+N)
  const formatAccelerator = (acc) => {
    if (!acc) return "";
    const isMac = navigator.userAgent.toLowerCase().includes("mac");
    return acc
      .replace(/CmdOrCtrl\+/gi, isMac ? "⌘" : "Ctrl+")
      .replace(/Shift\+/gi, isMac ? "⇧" : "Shift+")
      .replace(/Alt\+/gi, isMac ? "⌥" : "Alt+");
  };

  const getLabel = (item) => {
    if (item.label) return item.label.replace(/&/g, "");
    if (item.role) {
      const roleLabels = {
        undo: "Undo",
        redo: "Redo",
        cut: "Cut",
        copy: "Copy",
        paste: "Paste",
        selectall: "Select All",
        reload: "Reload",
        forcereload: "Force Reload",
        toggledevtools: "Toggle Developer Tools",
        togglefullscreen: "Toggle Full Screen",
        minimize: "Minimize",
        close: "Close"
      };
      const normalized = item.role.toLowerCase();
      return roleLabels[normalized] || item.role.charAt(0).toUpperCase() + item.role.slice(1);
    }
    return "";
  };

  // Recursive submenu renderer
  const renderDropdownItems = (items, path = []) => {
    return (
      <ul className="titlebar-dropdown-list">
        {items.map((item, index) => {
          if (item.type === "separator") {
            return <li key={`sep-${index}`} className="titlebar-menu-separator" />;
          }

          const currentPath = [...path, index];
          const hasSubmenu = !!item.submenu;
          const isSubmenuOpen = activeSubmenuPath.length > path.length && activeSubmenuPath[path.length] === index;

          const handleMouseEnter = () => {
            const newPath = [...path, index];
            setActiveSubmenuPath(newPath);
          };

          return (
            <li
              key={item.label || index}
              className={`titlebar-menu-item${item.enabled === false ? " disabled" : ""}${hasSubmenu ? " has-submenu" : ""}`}
              onMouseEnter={handleMouseEnter}
              onClick={(e) => {
                e.stopPropagation();
                handleItemClick(item, currentPath);
              }}
            >
              <div className="titlebar-menu-item-check">
                {item.checked && <Check size={12} />}
              </div>
              <span className="titlebar-menu-item-label">
                {getLabel(item)}
              </span>
              {item.accelerator && (
                <span className="titlebar-menu-item-shortcut">
                  {formatAccelerator(item.accelerator)}
                </span>
              )}
              {hasSubmenu && (
                <ChevronRight className="titlebar-menu-item-chevron" size={12} />
              )}

              {hasSubmenu && isSubmenuOpen && (
                <div className="titlebar-submenu">
                  {renderDropdownItems(item.submenu, currentPath)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <header className="app-titlebar" ref={containerRef} onDoubleClick={handleMaximize}>
      <div className="titlebar-left">
        <div className="titlebar-brand">
          <img src={notelyMark} alt="Notely logo" className="titlebar-brand-icon" style={{ width: "16px", height: "16px", objectFit: "contain" }} />
          <span>Notely</span>
        </div>

        <div className="titlebar-menu">
          {menuStructure.map((menu, index) => {
            const isOpen = activeMenuIndex === index;
            return (
              <div key={menu.label || index} className={`titlebar-menu-container${isOpen ? " open" : ""}`}>
                <button
                  className="titlebar-menu-btn"
                  type="button"
                  onClick={() => handleTopLevelClick(index)}
                  onMouseEnter={() => handleTopLevelMouseEnter(index)}
                >
                  {menu.label ? menu.label.replace(/&/g, "") : ""}
                </button>
                {isOpen && menu.submenu && (
                  <div className="titlebar-dropdown">
                    {renderDropdownItems(menu.submenu, [index])}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="titlebar-title">{title}</div>

      <div className="titlebar-controls">
        {onOpenWebsite && (
          <button
            className="titlebar-btn web-view"
            onClick={onOpenWebsite}
            type="button"
            title="Open Website View"
            aria-label="Open Website View"
            style={{ marginRight: "4px" }}
          >
            <Globe size={14} />
          </button>
        )}
        <button
          className="titlebar-btn minimize"
          onClick={handleMinimize}
          type="button"
          aria-label="Minimize Window"
        >
          <Minus size={14} />
        </button>
        <button
          className="titlebar-btn maximize"
          onClick={handleMaximize}
          type="button"
          aria-label={isMaximized ? "Restore Window" : "Maximize Window"}
        >
          {isMaximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          className="titlebar-btn close"
          onClick={handleClose}
          type="button"
          aria-label="Close Window"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
