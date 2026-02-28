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
 * Generate Amazon link using ASIN or ISBN or Title+Author fallback
 */
export function generateAmazonLink(
  title: string,
  author: string,
  asin?: string,
  isbn13?: string,
): string | undefined {
  // Amazon prefers direct routing for ASINs/ISBN-10s.
  if (asin) {
    return `https://www.amazon.com/dp/${asin}`;
  }

  // Fallback to converting ISBN-13 to 10 for direct routing
  if (isbn13) {
    const isbn10 = isbn13To10(isbn13);
    if (isbn10) {
      return `https://www.amazon.com/dp/${isbn10}`;
    }
  }

  // If no direct ID, use a precise search query
  const searchTerms = isbn13
    ? `${isbn13} ${title}`
    : `${title} ${author}`;

  return `https://www.amazon.com/s?k=${encodeURIComponent(searchTerms)}`;
}

/**
 * Generate Bookshop link using ISBN or Title+Author fallback
 */
export function generateBookshopLink(title: string, author: string, isbn13?: string): string | undefined {
  if (isbn13) {
    return `https://bookshop.org/a/0/${isbn13}`;
  }
  return `https://bookshop.org/search?q=${encodeURIComponent(`${title} ${author}`)}`;
}

/**
 * Generate Goodreads link using ISBN or Title+Author fallback
 */
export function generateGoodreadsLink(title: string, author: string, isbn13?: string): string | undefined {
  if (isbn13) {
    return `https://www.goodreads.com/book/isbn/${isbn13}`;
  }
  return `https://www.goodreads.com/search?q=${encodeURIComponent(`${title} ${author}`)}`;
}

/**
 * Generate all available purchase/reference links
 */
export function generateLinks(
  title: string,
  author: string,
  asin?: string,
  isbn13?: string,
  existingAmazonUrl?: string,
  existingBookshopUrl?: string,
): BookLinks {
  return {
    amazon: existingAmazonUrl || generateAmazonLink(title, author, asin, isbn13),
    bookshop: existingBookshopUrl || generateBookshopLink(title, author, isbn13),
    goodreads: generateGoodreadsLink(title, author, isbn13),
  };
}