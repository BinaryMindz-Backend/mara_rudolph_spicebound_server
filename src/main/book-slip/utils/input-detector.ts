import { InputType } from '../types/book-source.types.js';

export function detectInputType(input: string): InputType {
  const trimmedInput = input.trim();

  // Check if it's a URL pattern first
  const isUrl =
    trimmedInput.startsWith('http://') || trimmedInput.startsWith('https://');

  if (isUrl) {
    // Goodreads URL
    if (trimmedInput.includes('goodreads.com')) {
      return InputType.GOODREADS_URL;
    }

    // Amazon URL
    if (trimmedInput.includes('amazon.')) {
      return InputType.AMAZON_URL;
    }

    // Google Books URL
    if (trimmedInput.includes('books.google.com')) {
      return InputType.GOOGLE_BOOKS_URL;
    }

    // Open Library URL
    if (trimmedInput.includes('openlibrary.org')) {
      return InputType.OPEN_LIBRARY_URL;
    }
  }

  // Check ISBN pattern (13 digits, may contain hyphens)
  if (/^97[89]\d{10}$/.test(trimmedInput.replace(/-/g, ''))) {
    return InputType.ISBN;
  }

  return InputType.FREE_TEXT;
}
