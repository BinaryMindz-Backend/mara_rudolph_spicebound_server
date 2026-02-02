/**
 * Spice rating scale for romance books
 */
export const SPICE_RATING_SCALE = {
  0: { label: 'None', description: 'No romance' },
  1: { label: 'Cute', description: 'Kissing' },
  2: { label: 'Sweet', description: 'Closed door' },
  3: { label: 'Warm', description: '1–2 open door scenes' },
  4: { label: 'Spicy', description: 'Descriptive, >2 scenes, ≥ NA' },
  5: {
    label: 'Hot Spicy',
    description: 'Heavy spice, descriptive and regular',
  },
  6: { label: 'Explicit/Kink', description: 'Erotica, light-no plot' },
} as const;

export type SpiceRating = keyof typeof SPICE_RATING_SCALE;

export function isValidSpiceRating(rating: number): rating is SpiceRating {
  return rating >= 0 && rating <= 6 && Number.isInteger(rating);
}
