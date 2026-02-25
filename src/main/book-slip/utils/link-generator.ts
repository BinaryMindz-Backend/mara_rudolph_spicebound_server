/**
 * Generate affiliate/purchase links for a book based on available identifiers
 */
export interface BookLinks {
  amazon?: string;
  bookshop?: string;
  goodreads?: string;
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
  // Amazon ONLY accepts direct routing for ASINs/ISBN-10s.
  if (asin) {
    return `https://www.amazon.com/dp/${asin}`;
  }
  // Amazon 404s on 13-digit ISBN dp strings. Route to isolated ISBN search page.
  const searchKey = isbn13 || encodeURIComponent(`${title} ${author}`);
  return `https://www.amazon.com/s?k=${searchKey}`;
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
