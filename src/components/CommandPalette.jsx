import { useEffect, useMemo, useRef, useState } from "react";

function matchesQuery(command, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  const haystack = `${command.label} ${command.group || ""}`.toLowerCase();
  return haystack.includes(needle);
}

export function CommandPalette({ isOpen, commands = [], onClose, onRun }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const filtered = useMemo(() => commands.filter((command) => matchesQuery(command, query)), [commands, query]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex((index) => Math.min(index, Math.max(filtered.length - 1, 0)));
  }, [filtered, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="overlay-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="overlay-dialog-card command-palette-card">
        <div className="command-palette-header">
          <input
            ref={inputRef}
            className="command-palette-input"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
              }

              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
                return;
              }

              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
                return;
              }

              if (event.key === "Enter") {
                event.preventDefault();
                const selected = filtered[activeIndex];
                if (selected) onRun(selected.id);
              }
            }}
            placeholder="Type a command or action"
            aria-label="Filter commands"
          />
          <span className="command-palette-hint">Esc</span>
        </div>

        <div className="command-palette-results" role="listbox" aria-label="Command results">
          {!filtered.length ? (
            <div className="command-palette-empty">No matching command</div>
          ) : (
            filtered.map((command, index) => (
              <button
                key={command.id}
                className={`command-palette-item${index === activeIndex ? " active" : ""}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onRun(command.id)}
              >
                <span className="command-palette-item-text">
                  <strong>{command.label}</strong>
                  {command.group ? <small>{command.group}</small> : null}
                </span>
                {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}