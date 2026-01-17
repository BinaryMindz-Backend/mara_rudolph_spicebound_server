import { InputType } from '../types/book-source.types';

export function detectInputType(input: string): InputType {
  if (/^97[89]\d{10}$/.test(input.replace(/-/g, ''))) {
    return InputType.ISBN;
  }

  if (input.includes('amazon.')) return InputType.AMAZON_URL;
  if (input.includes('books.google.com')) return InputType.GOOGLE_BOOKS_URL;
  if (input.includes('openlibrary.org')) return InputType.OPEN_LIBRARY_URL;

  return InputType.FREE_TEXT;
}
