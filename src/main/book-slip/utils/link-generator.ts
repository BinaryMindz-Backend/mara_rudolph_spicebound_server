/**
 * Generate affiliate/purchase links for a book based on available identifiers
 */
export interface BookLinks {
  amazon?: string;
  bookshop?: string;
}

/**
 * Generate Amazon link from ASIN or ISBN
 */
export function generateAmazonLink(
  asin?: string,
  isbn13?: string,
): string | undefined {
  if (asin) {
    return `https://amazon.com/dp/${asin}`;
  }
  if (isbn13) {
    return `https://amazon.com/s?k=${isbn13}`;
  }
  return undefined;
}

/**
 * Generate Bookshop link from ISBN
 */
export function generateBookshopLink(isbn13?: string): string | undefined {
  if (isbn13) {
    return `https://bookshop.org/search?q=${isbn13}`;
  }
  return undefined;
}

/**
 * Generate all available purchase links
 */
export function generateLinks(
  asin?: string,
  isbn13?: string,
  existingAmazonUrl?: string,
  existingBookshopUrl?: string,
): BookLinks {
  return {
    amazon: existingAmazonUrl || generateAmazonLink(asin, isbn13),
    bookshop: existingBookshopUrl || generateBookshopLink(isbn13),
  };
}
