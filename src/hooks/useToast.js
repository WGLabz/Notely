import { useCallback, useState } from "react";

// Transient toast notifications. Each toast auto-dismisses after a fixed delay.
export function useToast(autoDismissMs = 3000) {
  const [toasts, setToasts] = useState([]);

  const notify = useCallback(
    (message, type = "info", action = null) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((currentToasts) => [...currentToasts, { id, message, type, action }]);
      window.setTimeout(() => {
        setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
      }, autoDismissMs);
    },
    [autoDismissMs]
  );

  const dismiss = useCallback((id) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, notify, dismiss };
}
