import React from "react";
import { Eye, X } from "lucide-react";
import { DashboardPanels } from "../DashboardPanels";
import { LandingListControls } from "../LandingListControls";
import { DocumentList } from "../DocumentList";

export function LandingView({
  isRootLandingView,
  landingSidebarWidth,
  landingLayoutRef,
  startLandingSidebarResize,
  handleLandingSidebarResizerKeyDown,
  documents,
  workspaceTaskDocuments,
  loading,
  onOpenListItem,
  onOpenReferencedDocument,
  onOpenAllTasks,
  onOpenRecentNotes,
  onOpenFavorites,
  onDashboardAction,
  continueDashboardNotes,
  favoriteNotes,
  landingListQuery,
  setLandingListQuery,
  landingEntryFilter,
  setLandingEntryFilter,
  landingSortMode,
  setLandingSortMode,
  visibleDocuments,
  visibleFolderCount,
  folderCount,
  visibleNoteCount,
  noteCount,
  notesViewMode,
  notesDensityMode,
  onToggleFavorite,
  onRemoveListEntry,
  landingTitle,
  breadcrumbSegments,
  onLandingNavigateTo,
  updateStatus,
  updateDetails,
  onShowUpdateModal,
  onDismissUpdate,
  onCopyLinkPath,
}) {
  return (
    <div className="landing-shell">
      {updateStatus === "available" && (
        <div
          className="update-banner"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface-accent)",
            border: "1px solid var(--border-soft)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3) var(--space-5)",
            fontSize: "var(--font-size-body-sm)",
            color: "var(--accent-strong)",
            fontWeight: "500",
            zIndex: 2,
            marginBottom: "var(--space-5)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
            <span>🎉</span>
            <span>A new version of Notely (v{String(updateDetails?.latestVersion || "").replace(/^v/, "")}) is available!</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
            <button
              onClick={onShowUpdateModal}
              style={{
                background: "var(--accent-solid)",
                color: "var(--text-on-accent)",
                border: "none",
                padding: "3px 8px",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--font-size-caption)",
                fontWeight: "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
              }}
              type="button"
            >
              <Eye size={12} />
              View Update
            </button>
            <button
              onClick={onDismissUpdate}
              style={{
                background: "transparent",
                color: "var(--text-muted)",
                border: "none",
                fontSize: "var(--font-size-caption)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "var(--space-2) var(--space-3)",
              }}
              type="button"
            >
              <X size={12} />
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div
        className="landing-workspace-layout"
        ref={landingLayoutRef}
        style={{
          "--landing-sidebar-width": `${landingSidebarWidth}px`,
        }}
      >
        <aside className="landing-dashboard-rail" aria-label="Workspace dashboard rail">
          <DashboardPanels
            documents={documents}
            taskDocuments={workspaceTaskDocuments}
            loading={loading}
            onOpen={onOpenListItem}
            onOpenTask={onOpenReferencedDocument}
            onOpenAllTasks={onOpenAllTasks}
            onOpenRecentNotes={onOpenRecentNotes}
            onOpenFavorites={onOpenFavorites}
            onAction={onDashboardAction}
            continueNotes={continueDashboardNotes}
            favorites={favoriteNotes}
            layout="rail"
          />
        </aside>
        <div
          className="split-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize workspace sidebar"
          aria-valuemin={200}
          aria-valuemax={450}
          aria-valuenow={landingSidebarWidth}
          aria-valuetext={`${landingSidebarWidth}px sidebar width`}
          tabIndex={0}
          onPointerDown={startLandingSidebarResize}
          onKeyDown={handleLandingSidebarResizerKeyDown}
        />
        <div className="landing-notes-pane">
          {!isRootLandingView && (
            <div className="landing-header" style={{ marginBottom: "var(--space-4)" }}>
              <div className="landing-header-main">
                <div className="landing-title-row">
                  <h1>{landingTitle}</h1>
                </div>
                <nav className="landing-path" aria-label="Folder path">
                  {breadcrumbSegments.map((segment, index) => {
                    const isLast = index === breadcrumbSegments.length - 1;
                    return (
                      <span className="landing-path-part" key={segment.path}>
                        <button
                          className={`landing-path-segment${isLast ? " active" : ""}`}
                          type="button"
                          disabled={isLast}
                          data-tooltip={segment.label}
                          onClick={() => {
                            if (!isLast) {
                              void onLandingNavigateTo(segment.path);
                            }
                          }}
                        >
                          {segment.label}
                        </button>
                        {!isLast ? <span className="landing-path-separator" aria-hidden="true">/</span> : null}
                      </span>
                    );
                  })}
                </nav>
              </div>
            </div>
          )}
          <LandingListControls
            query={landingListQuery}
            onQueryChange={setLandingListQuery}
            typeFilter={landingEntryFilter}
            onTypeFilterChange={setLandingEntryFilter}
            sortBy={landingSortMode}
            onSortByChange={setLandingSortMode}
            visibleCount={visibleDocuments.length}
            totalCount={documents.length}
            visibleFolderCount={visibleFolderCount}
            totalFolderCount={folderCount}
            visibleNoteCount={visibleNoteCount}
            totalNoteCount={noteCount}
            onCreateNote={() => onDashboardAction("new-note")}
          />
          <DocumentList
            documents={visibleDocuments}
            onOpen={onOpenListItem}
            onRemove={onRemoveListEntry}
            loading={loading}
            viewMode={notesViewMode}
            density={notesDensityMode}
            favorites={favoriteNotes}
            onToggleFavorite={onToggleFavorite}
            emptyMessage="No notes or folders match your current filters."
            onCopyLinkPath={onCopyLinkPath}
          />
        </div>
      </div>
    </div>
  );
}
