export function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[^0-9X]/gi, '');
}
