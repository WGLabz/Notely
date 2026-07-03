import { ExternalLink, Github, Heart, User, X } from "lucide-react";
import notelyMark from "../assets/branding/notely-mark.png";
import AppIconButton from "./AppIconButton";
import { OverlayDialog } from "./OverlayDialog";

function buildVersionText(appInfo) {
  return String(appInfo?.version || "0.0.0");
}

export function AboutModal({ open, onClose, appInfo }) {
  if (!open) return null;

  const appName = String(appInfo?.appName || "Notely");
  const versionText = buildVersionText(appInfo);
  const repositoryUrl = "https://github.com/wglabz/notely";

  return (
    <OverlayDialog open={open} onClose={onClose} ariaLabel="About Notely" cardClassName="about-dialog-card">
        <div className="overlay-dialog-header about-dialog-header">
          <AppIconButton onClick={onClose} aria-label="Close about dialog">
            <X size={16} />
          </AppIconButton>
        </div>

        <div className="about-dialog-content">
          <div className="about-brand-panel">
            <img className="about-brand-mark" src={notelyMark} alt="Notely logo" />
            <h3 className="about-brand-name">{appName}</h3>
            <p className="about-version-subscript">v{versionText}</p>
          </div>

          <div className="about-info-panel">
            <p className="about-copy">
              Open-source Markdown workspace software for structured authoring,
              version-aware documentation, and media-first note operations.
            </p>
            <div className="about-details-list" role="list" aria-label="About details">
              <p className="about-detail-row" role="listitem">
                <User size={15} aria-hidden="true" />
                <span>
                  <strong>Author:</strong> Bikash Narayan Panda
                </span>
              </p>
              <p className="about-detail-row" role="listitem">
                <Github size={15} aria-hidden="true" />
                <a
                  href={repositoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    event.preventDefault();
                    window.open(repositoryUrl, "_blank", "noopener,noreferrer");
                  }}
                >
                  github.com/wglabz/notely
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              </p>
              <p className="about-detail-row" role="listitem">
                <Heart size={15} aria-hidden="true" />
                <span>
                  Made with love by <strong>WGLabz</strong>
                </span>
              </p>
            </div>
          </div>
        </div>
    </OverlayDialog>
  );
}
