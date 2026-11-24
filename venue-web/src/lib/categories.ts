// Venue and deal categories offered in the portal. "Other" lets a venue type
// its own; that typed text is what gets saved as the category.
export const CATEGORIES = [
  "Bar", "Restaurant", "Cafe", "Bowling", "Mini Golf",
  "Escape Room", "Arcade", "Pool / Billiards", "Karaoke", "Darts", "Other",
];

export const OTHER = "Other";

/** True when a saved category is one of the standard options (not a typed "Other"). */
export function isStandardCategory(value: string): boolean {
  return CATEGORIES.includes(value) && value !== OTHER;
}
