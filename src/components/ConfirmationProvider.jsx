import { createContext, useState, useCallback, useRef } from "react";
import OverlayDialog from "./OverlayDialog";
import AppButton from "./AppButton";
import { Check, X } from "lucide-react";

export const ConfirmationContext = createContext(null);

export function ConfirmationProvider({ children }) {
  const [confirmState, setConfirmState] = useState({
    open: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    variant: "primary"
  });

  const resolverRef = useRef(null);

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setConfirmState({
        open: true,
        title: options.title || "Confirm Action",
        message: options.message || "Are you sure?",
        confirmLabel: options.confirmLabel || "Confirm",
        cancelLabel: options.cancelLabel || "Cancel",
        variant: options.variant || "primary"
      });
    });
  }, []);

  const handleConfirm = () => {
    setConfirmState((prev) => ({ ...prev, open: false }));
    if (resolverRef.current) {
      resolverRef.current(true);
      resolverRef.current = null;
    }
  };

  const handleCancel = () => {
    setConfirmState((prev) => ({ ...prev, open: false }));
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
  };

  return (
    <ConfirmationContext.Provider value={{ confirm }}>
      {children}
      <OverlayDialog
        open={confirmState.open}
        onClose={handleCancel}
        closeOnClickOutside={false}
        ariaLabel={confirmState.title}
        cardClassName="confirmation-modal-card"
      >
        <div style={{
          padding: "24px 20px 20px 20px",
          textAlign: "center",
          maxWidth: "340px",
          margin: "0 auto"
        }}>
          {confirmState.title && (
            <h3 style={{
              margin: "0 0 12px 0",
              fontSize: "16px",
              fontWeight: "600",
              color: "var(--text-strong, var(--app-text))"
            }}>
              {confirmState.title}
            </h3>
          )}
          <p style={{
            margin: "0 0 24px 0",
            fontSize: "14px",
            color: "var(--text-muted, #7f8c8d)",
            lineHeight: "1.5"
          }}>
            {confirmState.message}
          </p>
          <div style={{
            display: "flex",
            justifyContent: "center",
            gap: "12px"
          }}>
            <AppButton
              variant={confirmState.variant === "danger" ? "primary" : confirmState.variant}
              onClick={handleConfirm}
              style={confirmState.variant === "danger" ? { background: "var(--accent-red, #e06c75)", border: "none", display: "inline-flex", alignItems: "center", gap: "6px" } : { display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <Check size={14} />
              <span>{confirmState.confirmLabel}</span>
            </AppButton>
            <AppButton
              variant="secondary"
              onClick={handleCancel}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <X size={14} />
              <span>{confirmState.cancelLabel}</span>
            </AppButton>
          </div>
        </div>
      </OverlayDialog>
    </ConfirmationContext.Provider>
  );
}
