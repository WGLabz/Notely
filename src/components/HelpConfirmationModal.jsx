import { ExternalLink, Globe, HelpCircle, X } from "lucide-react";
import { OverlayDialog } from "./OverlayDialog";

export function HelpConfirmationModal({ open, onClose }) {
  if (!open) return null;

  const docUrl = "https://thenotelyapp.github.io";

  const handleConfirm = () => {
    window.open(docUrl, "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <OverlayDialog
      open={open}
      onClose={onClose}
      ariaLabel="Open Help Center Confirmation"
      cardClassName="help-confirmation-card"
    >
      <div className="help-confirmation-content" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "32px 24px 24px 24px" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "48px", height: "48px", borderRadius: "50%", background: "var(--surface-accent)", color: "var(--accent-solid)", marginBottom: "16px" }}>
          <HelpCircle size={20} />
        </div>

        <h3 style={{ fontSize: "1.2rem", fontWeight: "600", color: "var(--text-strong)", margin: "0 0 8px 0" }}>
          Open Documentation Website?
        </h3>

        <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", margin: "0 0 16px 0", lineHeight: "1.5" }}>
          This will open the help documentation site in your default system web browser.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--surface-muted)", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "8px 12px", fontSize: "0.85rem", color: "var(--accent-strong)", fontFamily: "var(--vp-font-family-mono, monospace)", marginBottom: "24px" }}>
          <span>{docUrl}</span>
          <ExternalLink size={14} />
        </div>

        <div style={{ display: "flex", gap: "12px", width: "100%" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              flex: 1,
              padding: "10px 16px",
              borderRadius: "6px",
              border: "1px solid var(--border-default)",
              background: "transparent",
              color: "var(--text-strong)",
              fontSize: "0.9rem",
              fontWeight: "500",
              cursor: "pointer",
              transition: "background 0.2s"
            }}
          >
            <X size={16} />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              flex: 1,
              padding: "10px 16px",
              borderRadius: "6px",
              border: "none",
              background: "var(--accent-solid)",
              color: "#ffffff",
              fontSize: "0.9rem",
              fontWeight: "600",
              cursor: "pointer",
              transition: "background 0.2s"
            }}
          >
            <Globe size={16} />
            Open Browser
          </button>
        </div>
      </div>
    </OverlayDialog>
  );
}
