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
        <div className="confirmation-dialog">
          {confirmState.title && (
            <h3 className="confirmation-dialog__title">
              {confirmState.title}
            </h3>
          )}
          <p className="confirmation-dialog__message">
            {confirmState.message}
          </p>
          <div className="confirmation-dialog__actions">
            <AppButton
              variant="small"
              onClick={handleCancel}
            >
              <X size={14} />
              <span>{confirmState.cancelLabel}</span>
            </AppButton>
            <AppButton
              variant="primary"
              className={confirmState.variant === "danger" ? "danger" : ""}
              onClick={handleConfirm}
            >
              <Check size={14} />
              <span>{confirmState.confirmLabel}</span>
            </AppButton>
          </div>
        </div>
      </OverlayDialog>
    </ConfirmationContext.Provider>
  );
}
