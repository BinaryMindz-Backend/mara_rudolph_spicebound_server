import { MINIMUM_RATINGS_TO_DISPLAY } from '../constants/index.js';

export interface CombinedRating {
  display: string;
  value: number | null;
  sources: string[];
}

/**
 * Combined rating calculation logic
 * Primary: If Spicebound has ratings, compute weighted combined rating
 * Fallback: external rating if present and meets minimum threshold
 * Null: if insufficient ratings on both sources
 */
export function calculateCombinedRating(
  externalAvg: number | null | undefined,
  externalCount: number | null | undefined,
  spiceboundAvg: number | null | undefined,
  spiceboundCount: number | null | undefined,
): CombinedRating {
  const sources: string[] = [];

  // Check minimum thresholds
  const hasExternalRatings =
    externalAvg !== null &&
    externalAvg !== undefined &&
    externalCount !== null &&
    externalCount !== undefined &&
    externalCount >= MINIMUM_RATINGS_TO_DISPLAY;

  const hasSpiceboundRatings =
    spiceboundAvg !== null &&
    spiceboundAvg !== undefined &&
    spiceboundCount !== null &&
    spiceboundCount !== undefined &&
    spiceboundCount >= MINIMUM_RATINGS_TO_DISPLAY;

  // If we have both ratings, calculate weighted average
  if (hasExternalRatings && hasSpiceboundRatings) {
    const externalWeight = 0.6;
    const spiceboundWeight = 0.4;

    const weightedAvg =
      externalAvg! * externalWeight + spiceboundAvg! * spiceboundWeight;

    return {
      display: weightedAvg.toFixed(1),
      value: parseFloat(weightedAvg.toFixed(1)),
      sources: ['External', 'Spicebound'],
    };
  }

  // Only Spicebound ratings
  if (hasSpiceboundRatings) {
    return {
      display: spiceboundAvg!.toFixed(1),
      value: parseFloat(spiceboundAvg!.toFixed(1)),
      sources: ['Spicebound'],
    };
  }

  // Only external ratings
  if (hasExternalRatings) {
    return {
      display: externalAvg!.toFixed(1),
      value: parseFloat(externalAvg!.toFixed(1)),
      sources: ['External'],
    };
  }

  // Insufficient data
  return {
    display: '–',
    value: null,
    sources: [],
  };
}
