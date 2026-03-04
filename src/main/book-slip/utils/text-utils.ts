/**
 * Normalize strings for canonical matching
 */
export function normalizeText(value: string): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}
