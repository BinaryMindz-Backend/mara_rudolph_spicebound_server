/**
 * Generate affiliate/purchase links for a book based on available identifiers
 */
export interface BookLinks {
  amazon?: string;
  bookshop?: string;
  goodreads?: string;
}

/**
 * Converts ISBN-13 to ISBN-10 for Amazon routing
 */
function isbn13To10(isbn13: string): string | undefined {
  const clean = isbn13.replace(/[-\s]/g, '');
  if (clean.length !== 13 || !clean.startsWith('978')) return undefined;

  const core = clean.substring(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * parseInt(core.charAt(i), 10);
  }

  const check = (11 - (sum % 11)) % 11;
  const checkDigit = check === 10 ? 'X' : check.toString();

  return core + checkDigit;
}

/**
 * Generate Amazon link. Direct /dp/ when we have ASIN or ISBN-10; otherwise search.
 */
export function generateAmazonLink(
  title: string,
  author: string,
  asin?: string,
  isbn13?: string,
): string | undefined {
  if (asin && asin.trim().length >= 10) {
    return `https://www.amazon.com/dp/${asin.trim()}`;
  }
  const isbn10 = isbn13 ? isbn13To10(isbn13) : undefined;
  if (isbn10) {
    return `https://www.amazon.com/dp/${isbn10}`;
  }
  const searchTerms = isbn13 ? `${isbn13.replace(/[-\s]/g, '')} ${title}` : `${title} ${author}`;
  return `https://www.amazon.com/s?k=${encodeURIComponent(searchTerms)}`;
}

/**
 * Generate Bookshop link. /a/0/ISBN is unreliable; use search by ISBN or title+author so the link opens a working page.
 */
export function generateBookshopLink(
  title: string,
  author: string,
  isbn13?: string,
): string | undefined {
  if (isbn13) {
    return `https://bookshop.org/search?q=${encodeURIComponent(isbn13)}`;
  }
  return `https://bookshop.org/search?q=${encodeURIComponent(`${title} ${author}`)}`;
}

/**
 * Generate Goodreads link. Only /book/show/ID goes to the book page; /book/isbn/ returns 404.
 * Use direct show URL when we have Goodreads book ID, otherwise search.
 */
export function generateGoodreadsLink(
  title: string,
  author: string,
  isbn13?: string,
  goodreadsBookId?: string,
): string | undefined {
  if (goodreadsBookId) {
    return `https://www.goodreads.com/book/show/${goodreadsBookId}`;
  }
  return `https://www.goodreads.com/search?q=${encodeURIComponent(`${title} ${author}`)}`;
}

/**
 * Generate all available purchase/reference links (direct to book when IDs available)
 * Prefers direct /dp/ASIN and /book/show/ID so links always open the exact book page.
 */
export function generateLinks(
  title: string,
  author: string,
  asin?: string,
  isbn13?: string,
  existingAmazonUrl?: string,
  existingBookshopUrl?: string,
  goodreadsBookId?: string,
): BookLinks {
  return {
    amazon: generateAmazonLink(title, author, asin, isbn13) || existingAmazonUrl,
    bookshop: existingBookshopUrl || generateBookshopLink(title, author, isbn13),
    goodreads: generateGoodreadsLink(title, author, isbn13, goodreadsBookId),
  };
}
