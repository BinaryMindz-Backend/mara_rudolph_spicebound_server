import { ExternalBookData } from '../types/book-source.types.js';

export function mergeExternalData(
  google?: ExternalBookData,
  openLibrary?: ExternalBookData,
  goodreads?: ExternalBookData,
): ExternalBookData {
  // Goodreads (e.g. from URL fetch) can override title/author/description when provided
  const title = goodreads?.title ?? google?.title ?? openLibrary?.title;
  const author = goodreads?.author ?? google?.author ?? openLibrary?.author;
  const description =
    goodreads?.description ?? google?.description ?? openLibrary?.description;

  return {
    title,
    author,
    description,
    publishedYear:
      google?.publishedYear ??
      openLibrary?.publishedYear ??
      goodreads?.publishedYear,

    isbn13: google?.isbn13 ?? openLibrary?.isbn13 ?? goodreads?.isbn13,
    googleVolumeId: google?.googleVolumeId,
    openLibraryId: openLibrary?.openLibraryId,
    asin: google?.asin ?? openLibrary?.asin ?? goodreads?.asin,
    goodreadsId:
      goodreads?.goodreadsId ?? google?.goodreadsId ?? openLibrary?.goodreadsId,

    externalAvgRating: google?.externalAvgRating,
    externalRatingCount: google?.externalRatingCount,

    // Series info
    seriesName: google?.seriesName ?? openLibrary?.seriesName,
    seriesIndex: google?.seriesIndex ?? openLibrary?.seriesIndex,
    seriesTotal: google?.seriesTotal ?? openLibrary?.seriesTotal,
    seriesStatus: google?.seriesStatus ?? openLibrary?.seriesStatus,
  };
}
