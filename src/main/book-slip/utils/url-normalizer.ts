/**
 * Extract ASIN from Amazon URL
 * Handles various Amazon URL formats and strips tracking parameters
 */
export function extractAsin(url: string): string | null {
  try {
    // Remove query parameters first
    const cleanUrl = url.split('?')[0];

    // Match /dp/ or /gp/product/ patterns (10-character alphanumeric)
    const match = cleanUrl.match(/\/(dp|gp\/product)\/([A-Z0-9]{10})/);
    if (match) {
      return match[2];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extract book ID from Goodreads URL
 * Goodreads URLs typically are: /book/show/{book_id}
 */
export function extractGoodreadsId(url: string): string | null {
  try {
    const match = url.match(/goodreads\.com\/book\/show\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Extract Google Books volume ID from URL
 */
export function extractGoogleBooksVolumeId(url: string): string | null {
  try {
    const match = url.match(/id=([A-Za-z0-9\-_]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Extract Open Library ID from URL
 */
export function extractOpenLibraryId(url: string): string | null {
  try {
    const match = url.match(/openlibrary\.org\/works\/([A-Z0-9]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
