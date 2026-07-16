import React, { useEffect, useState, useRef } from "react";
import "../styles/GlobalTooltip.css";

/**
 * GlobalTooltip listens to all mouse events and displays a tooltip when the mouse hovers over an element with a data-tooltip attribute.
 * It's positioned absolutely over the whole app.
 */
export default function GlobalTooltip() {
  const [tooltipState, setTooltipState] = useState({
    visible: false,
    content: "",
    x: 0,
    y: 0,
    placement: "bottom"
  });

  const tooltipRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const targetElementRef = useRef(null);

  useEffect(() => {
    const handleMouseOver = (e) => {
      // Find the closest element with a data-tooltip attribute
      const target = e.target.closest("[data-tooltip]");
      if (!target) {
        if (targetElementRef.current) {
          handleMouseOut();
        }
        return;
      }

      // If we hover over the same element, ignore
      if (target === targetElementRef.current) return;
      targetElementRef.current = target;

      const content = target.getAttribute("data-tooltip");
      if (!content || !content.trim()) return;

      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      
      // Delay before showing tooltip
      hoverTimeoutRef.current = setTimeout(() => {
        const rect = target.getBoundingClientRect();
        
        setTooltipState({
          visible: true,
          content: content.trim(),
          x: rect.left + rect.width / 2,
          y: rect.bottom + 8, // By default position below
          placement: "bottom",
          targetRect: rect,
        });
      }, 400); // 400ms delay to match typical native tooltip feel but look better
    };

    const handleMouseOut = () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      targetElementRef.current = null;
      setTooltipState((prev) => ({ ...prev, visible: false }));
    };

    const handleMouseDown = () => {
      // Hide tooltip when clicking
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      setTooltipState((prev) => ({ ...prev, visible: false }));
    };

    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("mouseout", handleMouseOut, true);
    document.addEventListener("mousedown", handleMouseDown, true);

    return () => {
      document.removeEventListener("mouseover", handleMouseOver, true);
      document.removeEventListener("mouseout", handleMouseOut, true);
      document.removeEventListener("mousedown", handleMouseDown, true);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    // Adjust placement if it falls off screen
    if (tooltipState.visible && tooltipRef.current && tooltipState.targetRect) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const targetRect = tooltipState.targetRect;

      let newX = tooltipState.x;
      let newY = tooltipState.y;
      let newPlacement = tooltipState.placement;

      // Check right edge
      if (newX + tooltipRect.width / 2 > windowWidth - 10) {
        newX = windowWidth - tooltipRect.width / 2 - 10;
      }
      
      // Check left edge
      if (newX - tooltipRect.width / 2 < 10) {
        newX = tooltipRect.width / 2 + 10;
      }

      // Check bottom edge
      if (newY + tooltipRect.height > windowHeight - 10) {
        // Place above the element
        newY = targetRect.top - tooltipRect.height - 8;
        newPlacement = "top";
      }

      // Only update if changed significantly
      if (Math.abs(newX - tooltipState.x) > 1 || Math.abs(newY - tooltipState.y) > 1 || newPlacement !== tooltipState.placement) {
        setTooltipState((prev) => ({
          ...prev,
          x: newX,
          y: newY,
          placement: newPlacement
        }));
      }
    }
  }, [tooltipState.visible, tooltipState.content, tooltipState.targetRect, tooltipState.x, tooltipState.y, tooltipState.placement]);

  if (!tooltipState.visible && !tooltipState.content) return null;

  return (
    <div
      ref={tooltipRef}
      className={`global-tooltip ${tooltipState.visible ? "visible" : ""} placement-${tooltipState.placement}`}
      style={{
        left: tooltipState.x,
        top: tooltipState.y,
      }}
      role="tooltip"
    >
      {tooltipState.content}
    </div>
  );
}
