import { ExternalBookData } from "../types/book-source.types.js";

export function mergeExternalData(
  google?: ExternalBookData,
  openLibrary?: ExternalBookData,
): ExternalBookData {
  return {
    title: google?.title ?? openLibrary?.title,
    author: google?.author ?? openLibrary?.author,
    description: google?.description ?? openLibrary?.description,
    publishedYear: google?.publishedYear ?? openLibrary?.publishedYear,

    isbn13: google?.isbn13 ?? openLibrary?.isbn13,
    googleVolumeId: google?.googleVolumeId,
    openLibraryId: openLibrary?.openLibraryId,

    externalAvgRating: google?.externalAvgRating,
    externalRatingCount: google?.externalRatingCount,
  };
}
