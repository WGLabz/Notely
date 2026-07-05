export const DOCUMENT_DENSITY_PROFILES = {
  comfortable: {
    tableCellPaddingY: 10,
    tableCellPaddingX: 12,
    tableCellFontSize: 13,
    cardMinHeight: 124,
    cardPadding: 14,
    cardGap: 12,
    metaFontSize: 12,
    thumbHeight: 42,
    targetRowsPerViewport: 9,
    targetCardsPerViewport: 6,
  },
  compact: {
    tableCellPaddingY: 4,
    tableCellPaddingX: 8,
    tableCellFontSize: 12,
    cardMinHeight: 76,
    cardPadding: 8,
    cardGap: 8,
    metaFontSize: 11,
    thumbHeight: 28,
    targetRowsPerViewport: 16,
    targetCardsPerViewport: 10,
  },
};

export function normalizeDocumentDensity(value) {
  return value === "compact" ? "compact" : "comfortable";
}

export function getDocumentDensityProfile(value) {
  const normalized = normalizeDocumentDensity(value);
  return DOCUMENT_DENSITY_PROFILES[normalized];
}
