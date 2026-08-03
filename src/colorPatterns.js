export const DEFAULT_COLOR_PATTERN = "classic";

export const COLOR_PATTERNS = [
  { id: "classic", label: "Classic Blue" },
  { id: "sunrise", label: "Sunrise Orange" },
  { id: "forest", label: "Forest Green" },
  { id: "ocean", label: "Ocean Cyan" },
  { id: "slate", label: "Slate Gray" },
  { id: "coffee", label: "Coffee Brown" },
  { id: "emerald", label: "Emerald Teal" },
  { id: "midnight", label: "Midnight Navy" },
  { id: "high-contrast", label: "High Contrast" },
];

export const isValidColorPattern = (patternId) => {
  return COLOR_PATTERNS.some((pattern) => pattern.id === patternId);
};
