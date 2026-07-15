import { useContext } from "react";
import { ConfirmationContext } from "../components/ConfirmationProvider";

export function useConfirm() {
  const context = useContext(ConfirmationContext);
  if (!context) {
    return {
      confirm: async (options = {}) => {
        return window.confirm(options.message || "Are you sure?");
      }
    };
  }
  return context;
}

export default useConfirm;
