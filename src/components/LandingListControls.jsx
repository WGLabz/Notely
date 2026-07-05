import { FilePlus2, FileText, Folder } from "lucide-react";
import AppButton from "./AppButton";
import AppSelect from "./AppSelect";

export function LandingListControls({
  query,
  onQueryChange,
  typeFilter,
  onTypeFilterChange,
  sortBy,
  onSortByChange,
  visibleCount,
  totalCount,
  visibleFolderCount,
  totalFolderCount,
  visibleNoteCount,
  totalNoteCount,
  onCreateNote,
}) {
  return (
    <div className="landing-list-controls" aria-label="List controls">
      <label className="landing-list-search" htmlFor="landing-list-query">
        <span>Search</span>
        <input
          id="landing-list-query"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Filter notes and folders"
        />
      </label>

      <label className="landing-list-select" htmlFor="landing-list-type-filter">
        <span>Type</span>
        <AppSelect
          id="landing-list-type-filter"
          value={typeFilter}
          onChange={(event) => onTypeFilterChange(event.target.value)}
        >
          <option value="all">All</option>
          <option value="notes">Notes</option>
          <option value="folders">Folders</option>
        </AppSelect>
      </label>

      <label className="landing-list-select" htmlFor="landing-list-sort">
        <span>Sort</span>
        <AppSelect
          id="landing-list-sort"
          value={sortBy}
          onChange={(event) => onSortByChange(event.target.value)}
        >
          <option value="updated-desc">Updated (Newest)</option>
          <option value="updated-asc">Updated (Oldest)</option>
          <option value="title-asc">Title (A-Z)</option>
          <option value="title-desc">Title (Z-A)</option>
        </AppSelect>
      </label>

      <div className="landing-list-count" aria-live="polite">
        <span className="landing-list-count-item">
          Showing <strong>{visibleCount}</strong> of <strong>{totalCount}</strong>
        </span>
        <span className="landing-list-count-separator" aria-hidden="true">|</span>
        <span className="landing-list-count-item landing-list-count-icon-item">
          <Folder size={14} aria-hidden="true" />
          <strong>{visibleFolderCount}</strong>
          <span>/</span>
          <span>{totalFolderCount}</span>
          <em>Folders</em>
        </span>
        <span className="landing-list-count-separator" aria-hidden="true">|</span>
        <span className="landing-list-count-item landing-list-count-icon-item">
          <FileText size={14} aria-hidden="true" />
          <strong>{visibleNoteCount}</strong>
          <span>/</span>
          <span>{totalNoteCount}</span>
          <em>Notes</em>
        </span>
      </div>

      {onCreateNote && (
        <AppButton
          variant="small"
          className="landing-new-note-btn"
          onClick={onCreateNote}
          data-tooltip="Create a new note"
          aria-label="Create a new note"
        >
          <FilePlus2 size={16} />
          <span>New Note</span>
        </AppButton>
      )}
    </div>
  );
}
