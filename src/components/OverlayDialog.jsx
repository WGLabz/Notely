import { useEffect } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

export function OverlayDialog({
  open = true,
  onClose,
  ariaLabel,
  overlayClassName = "",
  cardClassName = "",
  useDefaultCardClass = true,
  initialFocusRef = null,
  cardRef = null,
  onCardKeyDown,
  children,
}) {
  const dialogRef = useFocusTrap(open, initialFocusRef);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const cardClasses = [
    useDefaultCardClass ? "overlay-dialog-card" : "",
    cardClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const setCardRef = (node) => {
    dialogRef.current = node;
    if (!cardRef) return;
    if (typeof cardRef === "function") {
      cardRef(node);
      return;
    }
    cardRef.current = node;
  };

  return (
    <div
      className={`overlay-dialog${overlayClassName ? ` ${overlayClassName}` : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        ref={setCardRef}
        className={cardClasses}
        onKeyDown={onCardKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default OverlayDialog;