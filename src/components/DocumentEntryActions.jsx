import { Star, Trash2 } from "lucide-react";

export function DocumentEntryActions({
  entry,
  isFavorite,
  onToggleFavorite,
  onRemove,
  useButtonElements = true,
  showFavorite = true,
  showRemove = true,
}) {
  const isNote = entry?.entryType === "file";

  function renderAction({ className, label, title, onActivate, children }) {
    if (useButtonElements) {
      return (
        <button
          type="button"
          className={className}
          aria-label={label}
          data-tooltip={title}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onActivate();
          }}
        >
          {children}
        </button>
      );
    }

    return (
      <span
        role="button"
        tabIndex={0}
        className={className}
        aria-label={label}
        data-tooltip={title}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onActivate();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onActivate();
          }
        }}
      >
        {children}
      </span>
    );
  }

  return (
    <span className="document-card-actions">
      {showRemove ? renderAction({
        className: "remove-toggle",
        label: `Move ${entry?.title || "item"} to removed`,
        title: "Move to removed",
        onActivate: () => onRemove?.(entry),
        children: <Trash2 size={12} />,
      }) : null}

      {isNote && showFavorite ? (
        renderAction({
          className: `favorite-toggle ${isFavorite ? "active" : ""}`,
          label: isFavorite ? `Remove ${entry.title} from favorites` : `Add ${entry.title} to favorites`,
          title: isFavorite ? "Remove from favorites" : "Add to favorites",
          onActivate: () => onToggleFavorite?.(entry.filePath),
          children: <Star size={12} />,
        })
      ) : null}
    </span>
  );
}
