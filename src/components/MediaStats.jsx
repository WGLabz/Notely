/**
 * MediaStats - Component to display media statistics and insights
 */

import { useMemo } from "react";
import { Trash2, AlertCircle } from "lucide-react";
import { getMediaTypeFromExtension } from "../utils/mediaUtils";
import { formatFileSize } from "../utils/imageProcessingUtils";

export function MediaStats({ allMedia, onDeleteUnused, isDeleting = false }) {
  const stats = useMemo(() => {
    if (!allMedia || allMedia.length === 0) {
      return {
        total: 0,
        used: 0,
        unused: 0,
        byType: {},
        totalSize: 0,
        unusedSize: 0,
        duplicates: [],
      };
    }

    const byType = {};
    let totalSize = 0;
    let unusedSize = 0;
    const pathMap = new Map();
    let used = 0;
    let unused = 0;

    allMedia.forEach((media) => {
      const ext = media.path.split(".").pop()?.toLowerCase();
      const type = getMediaTypeFromExtension(ext) || "unknown";

      if (!byType[type]) {
        byType[type] = { count: 0, size: 0, used: 0, unused: 0 };
      }
      byType[type].count += 1;

      const fileSize = media.fileSize || 0;
      totalSize += fileSize;
      byType[type].size += fileSize;

      const isUsed = (media.referenceCount || 0) > 0;
      if (isUsed) {
        used += 1;
        byType[type].used += 1;
      } else {
        unused += 1;
        unusedSize += fileSize;
        byType[type].unused += 1;
      }

      // Detect potential duplicates (same size, similar name)
      const fileName = media.path.split("/").pop()?.split(".")[0] || "";
      const key = `${fileSize}:${fileName.substring(0, 5).toLowerCase()}`;
      if (!pathMap.has(key)) {
        pathMap.set(key, []);
      }
      pathMap.get(key).push(media.path);
    });

    const duplicates = Array.from(pathMap.values()).filter((paths) => paths.length > 1);

    return {
      total: allMedia.length,
      used,
      unused,
      byType,
      totalSize,
      unusedSize,
      duplicates,
    };
  }, [allMedia]);

  return (
    <div className="media-stats-inline" data-tooltip="Media statistics">
      <span
        className="inline-main"
        data-tooltip={`${stats.total} media, total size ${formatFileSize(stats.totalSize)}`}
      >
        📊 {stats.total} media ({formatFileSize(stats.totalSize)})
      </span>

      {stats.byType && Object.keys(stats.byType).length > 1 && (
        <span className="inline-types">
          {Object.entries(stats.byType).map(([type, data]) => (
            <span
              key={type}
              className="inline-chip"
              data-tooltip={`${type}: ${data.count} item${data.count === 1 ? "" : "s"}, ${formatFileSize(data.size)}`}
            >
              <span className="type-icon">
                {type === "image" && "🖼️"}
                {type === "video" && "🎬"}
                {type === "audio" && "🎵"}
                {type === "pdf" && "📄"}
                {type === "document" && "📃"}
                {type === "unknown" && "📎"}
              </span>
              <span>{data.count}</span>
            </span>
          ))}
        </span>
      )}

      {stats.unused > 0 && (
        <span
          className="inline-unused-group"
          data-tooltip={`${stats.unused} unused${stats.unusedSize > 0 ? `, ${formatFileSize(stats.unusedSize)}` : ""}`}
        >
          <span className="inline-unused">
            <AlertCircle size={14} />
            <span><strong>{stats.unused}</strong> unused{stats.unusedSize > 0 ? ` (${formatFileSize(stats.unusedSize)})` : ""}</span>
          </span>
          <button
            className="cleanup-button icon-only"
            onClick={onDeleteUnused}
            disabled={isDeleting}
            data-tooltip={isDeleting ? "Cleaning unused media..." : "Delete all unused media files"}
            aria-label={isDeleting ? "Cleaning unused media" : "Delete all unused media files"}
          >
            <Trash2 size={12} />
          </button>
        </span>
      )}

      {stats.duplicates.length > 0 && (
        <span className="inline-duplicates" data-tooltip={`${stats.duplicates.length} potential duplicate group${stats.duplicates.length === 1 ? "" : "s"}`}>
          Found <strong>{stats.duplicates.length}</strong> duplicates
        </span>
      )}
    </div>
  );
}
