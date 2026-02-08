export enum InputType {
  ISBN = 'ISBN',
  AMAZON_URL = 'AMAZON_URL',
  GOOGLE_BOOKS_URL = 'GOOGLE_BOOKS_URL',
  OPEN_LIBRARY_URL = 'OPEN_LIBRARY_URL',
  FREE_TEXT = 'FREE_TEXT',
}

export interface ExternalBookData {
  title?: string;
  author?: string;
  description?: string;
  publishedYear?: number;

  isbn13?: string;
  googleVolumeId?: string;
  openLibraryId?: string;
  asin?: string;

  externalAvgRating?: number;
  externalRatingCount?: number;

  // Series-related fields
  seriesName?: string;
  seriesIndex?: number;
  seriesTotal?: number;
  seriesStatus?: string;
}
