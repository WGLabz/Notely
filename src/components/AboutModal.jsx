import { X } from "lucide-react";
import notelyMark from "../assets/branding/notely-mark.png";
import AppIconButton from "./AppIconButton";
import { OverlayDialog } from "./OverlayDialog";

function buildVersionText(appInfo) {
  const version = String(appInfo?.version || "0.0.0");
  const core = String(appInfo?.versionCore || version);
  const hash = String(appInfo?.commitHash || "").trim();
  return hash ? `${version}  |  core ${core}` : version;
}

export function AboutModal({ open, onClose, appInfo }) {
  if (!open) return null;

  const appName = String(appInfo?.appName || "Notely");
  const versionText = buildVersionText(appInfo);

  return (
    <OverlayDialog open={open} onClose={onClose} ariaLabel="About Notely" cardClassName="about-dialog-card">
        <div className="overlay-dialog-header">
          <h2>About {appName}</h2>
          <AppIconButton onClick={onClose} aria-label="Close about dialog">
            <X size={16} />
          </AppIconButton>
        </div>

        <div className="about-dialog-content">
          <img className="about-brand-mark" src={notelyMark} alt="Notely logo" />
          <h3>{appName}</h3>
          <p className="about-version">{versionText}</p>
          <p className="about-copy">
            Notely is a professional desktop Markdown workspace for structured authoring,
            document history, media operations, and collaboration workflows.
          </p>
        </div>
    </OverlayDialog>
  );
}
