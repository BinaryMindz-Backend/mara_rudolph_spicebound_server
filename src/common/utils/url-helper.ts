/**
 * URL helper for affiliate links and normalization
 */

export function buildAmazonUrl(asin: string, affiliate: boolean = false): string {
  const baseUrl = `https://amazon.com/dp/${asin}`;
  if (!affiliate) return baseUrl;
  // Placeholder for affiliate tag setup
  return `${baseUrl}?tag=spicebound-20`;
}

export function buildBookshopUrl(
  isbn: string | null,
  affiliate: boolean = false,
): string {
  if (!isbn) return 'https://bookshop.org';

  const baseUrl = `https://bookshop.org/books/isbn/${isbn}`;
  if (!affiliate) return baseUrl;
  // Placeholder for affiliate setup
  return `${baseUrl}?aid=spicebound`;
}

export function isAmazonUrl(url: string): boolean {
  return /amazon\.[a-z.]+\/.*\/dp\//.test(url);
}

export function isGoodreadsUrl(url: string): boolean {
  return /goodreads\.com\/book\/show\//.test(url);
}

export function extractGoodreadsBookId(url: string): string | null {
  const match = url.match(/goodreads\.com\/book\/show\/(\d+)/);
  return match ? match[1] : null;
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove common tracking parameters
    parsed.searchParams.delete('tag');
    parsed.searchParams.delete('ref');
    parsed.searchParams.delete('utm_source');
    parsed.searchParams.delete('utm_medium');
    parsed.searchParams.delete('utm_campaign');
    parsed.searchParams.delete('utm_content');
    parsed.searchParams.delete('utm_term');

    return parsed.toString();
  } catch {
    return url;
  }
}
