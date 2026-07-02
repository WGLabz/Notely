import { X } from "lucide-react";
import { useMemo, useState } from "react";
import MarkdownIt from "markdown-it";

const TREE_GROUPS = [
  {
    id: "start",
    title: "Getting Started",
    slugs: ["overview", "user-guide", "top-tasks"],
  },
  {
    id: "features",
    title: "Features",
    slugs: ["feature-reference", "feature-availability"],
  },
  {
    id: "safety",
    title: "Data and Support",
    slugs: ["data-sync-security", "troubleshooting"],
  },
];

function normalizeDocPath(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return raw.replace(/^\.?\//, "");
}

function resolveDocSlugFromHref(href, docs) {
  const rawHref = String(href || "").trim();
  if (!rawHref) return "";

  const [pathPart] = rawHref.split("#");
  const normalizedPath = normalizeDocPath(pathPart);
  if (!normalizedPath.endsWith(".md")) {
    return "";
  }

  const match = docs.find((entry) => {
    const fileName = normalizeDocPath(entry?.fileName);
    const slugPath = `${normalizeDocPath(entry?.slug)}.md`;
    return normalizedPath === fileName || normalizedPath === slugPath;
  });

  return String(match?.slug || "");
}

export function HelpCenterModal({ open, onClose, _appInfo, documents = [] }) {
  // Memoize normalized docs to ensure stable reference for dependency arrays
  const normalizedDocs = useMemo(
    () => (Array.isArray(documents) ? documents : []),
    [documents]
  );
  
  // Call all hooks unconditionally at the top (before any conditional returns)
  const [activeSlug, setActiveSlug] = useState(() => String(normalizedDocs?.[0]?.slug || ""));
  const [expandedGroups, setExpandedGroups] = useState(() => ({
    start: true,
    features: true,
    safety: true,
    other: true,
  }));

  const markdownRenderer = useMemo(() => {
    return new MarkdownIt({
      html: false,
      linkify: true,
      breaks: false,
      typographer: true,
    });
  }, []);

  const firstSlug = String(normalizedDocs?.[0]?.slug || "");
  const resolvedSlug = normalizedDocs.some((entry) => entry?.slug === activeSlug)
    ? activeSlug
    : firstSlug;
  const activeDocument = normalizedDocs.find((entry) => entry?.slug === resolvedSlug) || null;
  const renderedHtml = activeDocument
    ? markdownRenderer.render(String(activeDocument.markdown || ""))
    : "";

  const groupedDocuments = useMemo(() => {
    const docsBySlug = new Map(normalizedDocs.map((entry) => [String(entry?.slug || ""), entry]));
    const used = new Set();

    const groups = TREE_GROUPS.map((group) => {
      const items = group.slugs
        .map((slug) => docsBySlug.get(slug))
        .filter(Boolean);
      for (const item of items) {
        used.add(String(item.slug || ""));
      }
      return {
        id: group.id,
        title: group.title,
        items,
      };
    }).filter((group) => group.items.length > 0);

    const uncategorized = normalizedDocs.filter((entry) => !used.has(String(entry?.slug || "")));
    if (uncategorized.length) {
      groups.push({
        id: "other",
        title: "Other",
        items: uncategorized,
      });
    }

    return groups;
  }, [normalizedDocs]);

  // Now we can return early if not open (after all hooks are called)
  if (!open) return null;

  function toggleGroup(groupId) {
    setExpandedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }

  function activateDocumentSlug(slug) {
    const nextSlug = String(slug || "").trim();
    if (!nextSlug) return;

    setActiveSlug(nextSlug);

    const parentGroup = groupedDocuments.find((group) => {
      return group.items.some((entry) => String(entry?.slug || "") === nextSlug);
    });

    if (parentGroup?.id) {
      setExpandedGroups((current) => ({
        ...current,
        [parentGroup.id]: true,
      }));
    }
  }

  function handleMarkdownLinkClick(event) {
    const anchor = event.target?.closest?.("a[href]");
    if (!anchor) return;

    const href = String(anchor.getAttribute("href") || "").trim();
    if (!href) return;

    if (/^https?:\/\//i.test(href)) {
      event.preventDefault();
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }

    const docSlug = resolveDocSlugFromHref(href, normalizedDocs);
    if (docSlug) {
      event.preventDefault();
      activateDocumentSlug(docSlug);
    }
  }

  return (
    <div
      className="overlay-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Help center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="overlay-dialog-card help-center-dialog-card">
        <div className="overlay-dialog-header">
          <h2>Documentation</h2>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Close help center">
            <X size={16} />
          </button>
        </div>

        <div className="help-center-content">
          <div className="help-doc-layout" aria-label="Documentation viewer">
            <aside className="help-doc-nav" aria-label="Help sections">
              {groupedDocuments.length ? groupedDocuments.map((group) => {
                const isExpanded = expandedGroups[group.id] !== false;
                return (
                  <section className="help-doc-tree-group" key={group.id}>
                    <button
                      type="button"
                      className="help-doc-tree-group-toggle"
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={isExpanded}
                    >
                      <span className="help-doc-tree-chevron" aria-hidden="true">{isExpanded ? "▾" : "▸"}</span>
                      <span>{group.title}</span>
                    </button>
                    {isExpanded ? (
                      <ul className="help-doc-tree-items" role="list">
                        {group.items.map((entry) => {
                          const isActive = entry.slug === resolvedSlug;
                          return (
                            <li className="help-doc-tree-item" key={entry.slug || entry.fileName}>
                              <button
                                type="button"
                                className={`help-doc-nav-item${isActive ? " active" : ""}`}
                                onClick={() => activateDocumentSlug(entry.slug)}
                                aria-current={isActive ? "page" : undefined}
                                title={entry.title || "Documentation"}
                              >
                                <span className="help-doc-nav-title">{entry.title || "Documentation"}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </section>
                );
              }) : (
                <p className="help-doc-empty">No documentation files were found in docs/.</p>
              )}
            </aside>

            <article className="help-doc-article" aria-label="Documentation content">
              {activeDocument ? (
                <>
                  <header className="help-doc-article-header">
                    <h3>{activeDocument.title || "Documentation"}</h3>
                    <p>{activeDocument.summary || "Detailed guidance for this topic."}</p>
                  </header>
                  <div
                    className="help-doc-markdown"
                    onClick={handleMarkdownLinkClick}
                    dangerouslySetInnerHTML={{ __html: renderedHtml }}
                  />
                </>
              ) : (
                <p className="help-doc-empty">Select a section to view documentation.</p>
              )}
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
