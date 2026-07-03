import { Children, forwardRef, isValidElement, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

function setForwardedRef(ref, value) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (ref && typeof ref === "object") {
    ref.current = value;
  }
}

function buildOptionGroups(children) {
  const groups = [];
  let fallbackIndex = 0;

  const ensureUngrouped = () => {
    if (!groups.length || groups[groups.length - 1].label !== null) {
      groups.push({ key: "ungrouped", label: null, options: [] });
    }
    return groups[groups.length - 1];
  };

  const appendOption = (group, child) => {
    const optionValue = child.props.value ?? child.props.children;
    group.options.push({
      key: child.key ?? `option-${fallbackIndex++}`,
      value: String(optionValue ?? ""),
      label: child.props.children,
      disabled: child.props.disabled === true,
    });
  };

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;

    if (child.type === "option") {
      appendOption(ensureUngrouped(), child);
      return;
    }

    if (child.type === "optgroup") {
      const group = {
        key: child.key ?? `group-${fallbackIndex++}`,
        label: String(child.props.label || ""),
        options: [],
      };
      Children.forEach(child.props.children, (optionChild) => {
        if (!isValidElement(optionChild) || optionChild.type !== "option") return;
        appendOption(group, optionChild);
      });
      if (group.options.length) {
        groups.push(group);
      }
    }
  });

  return groups.filter((group) => group.options.length > 0);
}

function createSelectEvent(value, id, name) {
  const target = { value, id, name };
  return { target, currentTarget: target };
}

export const AppSelect = forwardRef(function AppSelect(
  {
    id,
    name,
    className = "",
    children,
    value,
    onChange,
    disabled = false,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    ...rest
  },
  ref,
) {
  const generatedId = useId().replace(/:/g, "");
  const triggerId = id || `app-select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const optionGroups = useMemo(() => buildOptionGroups(children), [children]);
  const flatOptions = useMemo(
    () => optionGroups.flatMap((group) => group.options),
    [optionGroups],
  );
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedIndex = useMemo(
    () => flatOptions.findIndex((option) => option.value === String(value ?? "")),
    [flatOptions, value],
  );
  const fallbackIndex = flatOptions.findIndex((option) => !option.disabled);
  const resolvedSelectedIndex = selectedIndex >= 0 ? selectedIndex : fallbackIndex;
  const selectedOption = resolvedSelectedIndex >= 0 ? flatOptions[resolvedSelectedIndex] : null;

  useEffect(() => {
    setActiveIndex(open ? resolvedSelectedIndex : -1);
  }, [open, resolvedSelectedIndex]);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    function handleFocusIn(event) {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    function handleEscape(event) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const commitValue = (nextValue) => {
    onChange?.(createSelectEvent(nextValue, id, name));
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveActiveIndex = (direction) => {
    if (!flatOptions.length) return;
    let nextIndex = activeIndex >= 0 ? activeIndex : resolvedSelectedIndex >= 0 ? resolvedSelectedIndex : -1;

    for (let step = 0; step < flatOptions.length; step += 1) {
      nextIndex = (nextIndex + direction + flatOptions.length) % flatOptions.length;
      if (!flatOptions[nextIndex]?.disabled) {
        setActiveIndex(nextIndex);
        return;
      }
    }
  };

  const handleTriggerKeyDown = (event) => {
    if (disabled) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
      }
      moveActiveIndex(event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const candidate = flatOptions[activeIndex];
      if (candidate && !candidate.disabled) {
        commitValue(candidate.value);
      }
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      const firstIndex = flatOptions.findIndex((option) => !option.disabled);
      if (firstIndex >= 0) {
        setOpen(true);
        setActiveIndex(firstIndex);
      }
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      for (let index = flatOptions.length - 1; index >= 0; index -= 1) {
        if (flatOptions[index]?.disabled) continue;
        setOpen(true);
        setActiveIndex(index);
        break;
      }
    }
  };

  return (
    <div ref={rootRef} className={`app-select-root${className ? ` ${className}` : ""}${disabled ? " disabled" : ""}`}>
      <button
        {...rest}
        ref={(node) => {
          triggerRef.current = node;
          setForwardedRef(ref, node);
        }}
        id={triggerId}
        type="button"
        className={`app-select-trigger${open ? " open" : ""}`}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((currentOpen) => !currentOpen);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="app-select-trigger-text">{selectedOption?.label ?? "Select"}</span>
        <ChevronDown size={16} className="app-select-trigger-icon" aria-hidden="true" />
      </button>

      {open ? (
        <div id={listboxId} className="app-select-panel" role="listbox" aria-labelledby={triggerId}>
          {optionGroups.map((group) => (
            <div className="app-select-group" key={group.key}>
              {group.label ? <div className="app-select-group-label">{group.label}</div> : null}
              {group.options.map((option) => {
                const optionIndex = flatOptions.findIndex((entry) => entry.key === option.key);
                const isSelected = option.value === selectedOption?.value;
                const isActive = optionIndex === activeIndex;

                return (
                  <button
                    key={option.key}
                    type="button"
                    role="option"
                    className={`app-select-option${isSelected ? " selected" : ""}${isActive ? " active" : ""}`}
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onMouseEnter={() => {
                      if (!option.disabled) {
                        setActiveIndex(optionIndex);
                      }
                    }}
                    onClick={() => {
                      if (!option.disabled) {
                        commitValue(option.value);
                      }
                    }}
                  >
                    <span className="app-select-option-label">{option.label}</span>
                    {isSelected ? <Check size={14} className="app-select-option-check" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});

export default AppSelect;
