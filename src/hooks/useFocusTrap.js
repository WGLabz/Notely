import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function getFocusable(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

/**
 * Traps keyboard focus within a container while `active` is true and restores
 * focus to the previously focused element when it deactivates/unmounts.
 *
 * Usage:
 *   const ref = useFocusTrap(isOpen);
 *   return <div ref={ref} role="dialog" aria-modal="true">…</div>;
 *
 * Pass `initialFocusRef` to direct initial focus at a specific element (e.g. a
 * search input) instead of the first focusable descendant. Pair with an Escape
 * handler for full modal semantics.
 */
export function useFocusTrap(active = true, initialFocusRef = null) {
  const containerRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;

    const container = containerRef.current;
    if (!container) return undefined;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Move focus into the dialog: preferred target, first focusable, else the
    // container itself.
    const preferred = initialFocusRef && initialFocusRef.current;
    const focusable = getFocusable(container);
    if (preferred && typeof preferred.focus === "function") {
      preferred.focus();
    } else if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      if (!container.hasAttribute("tabindex")) {
        container.setAttribute("tabindex", "-1");
      }
      container.focus();
    }

    const handleKeyDown = (event) => {
      if (event.key !== "Tab") return;

      const items = getFocusable(container);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;

      if (event.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", handleKeyDown);

    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      const previous = previouslyFocusedRef.current;
      if (previous && typeof previous.focus === "function") {
        previous.focus();
      }
    };
  }, [active, initialFocusRef]);

  return containerRef;
}

export default useFocusTrap;
