import { Injectable, Logger } from '@nestjs/common';
import { ExternalBookData } from '../types/book-source.types.js';

@Injectable()
export class GoogleBooksProvider {
  private readonly logger = new Logger(GoogleBooksProvider.name);
  private readonly baseUrl = 'https://www.googleapis.com/books/v1/volumes';

  private readonly EDITION_EXCLUSION_KEYWORDS = [
    'box set',
    'collection',
    'special edition',
    'illustrated edition',
    'complete series',
    'omnibus',
    'anniversary edition',
  ];

  async search(query: string): Promise<ExternalBookData | undefined> {
    try {
      // Request multiple results to allow filtering
      const url = `${this.baseUrl}?q=${encodeURIComponent(query)}&maxResults=10&key=${process.env.GOOGLE_BOOKS_KEY}`;
      this.logger.log(`🔹 Google Books search URL: ${url}`);

      const res = await fetch(url);
      if (!res.ok) {
        this.logger.error(
          `Google Books API error: ${res.status} ${res.statusText}`,
        );
        return undefined;
      }

      const data = await res.json();
      if (!data.items?.length) {
        this.logger.warn('No results from Google Books');
        return undefined;
      }

      // Filter and rank results
      const filtered = this.filterAndRankResults(data.items, query);
      if (!filtered) {
        this.logger.warn('No valid results after filtering');
        return undefined;
      }

      return this.mapVolumeToExternalData(filtered);
    } catch (error) {
      this.logger.error('Google Books search failed', error);
      return undefined;
    }
  }

  async fetchByVolumeId(
    volumeId: string,
  ): Promise<ExternalBookData | undefined> {
    try {
      const url = `${this.baseUrl}/${volumeId}?key=${process.env.GOOGLE_BOOKS_KEY}`;

      const res = await fetch(url);
      if (!res.ok) return undefined;

      const data = await res.json();
      return this.mapVolumeToExternalData(data);
    } catch (error) {
      this.logger.error('Google Books fetchByVolumeId failed', error);
      return undefined;
    }
  }

  /**
   * Filter and rank Google Books results
   * Prefers standard editions with good ratings
   */
  private filterAndRankResults(items: any[], query: string): any | undefined {
    // Filter out special editions and box sets
    const filtered = items.filter((item) => {
      const title = (item.volumeInfo?.title || '').toLowerCase();
      return !this.EDITION_EXCLUSION_KEYWORDS.some((keyword) =>
        title.includes(keyword),
      );
    });

    if (!filtered.length) {
      this.logger.warn('All results filtered as special editions');
      return items[0]; // Fall back to first result
    }

    const normalizedQuery = query.toLowerCase().trim();
    // if query contains " by ", take the first part as assumed title
    const assumedQueryTitle = normalizedQuery.split(' by ')[0].trim();

    // Sort by exact title match first, then by ratingsCount (descending), then by averageRating
    filtered.sort((a, b) => {
      const titleA = (a.volumeInfo?.title || '').toLowerCase().trim();
      const titleB = (b.volumeInfo?.title || '').toLowerCase().trim();

      const aIsExactMatch = titleA === assumedQueryTitle || titleA === normalizedQuery;
      const bIsExactMatch = titleB === assumedQueryTitle || titleB === normalizedQuery;

      if (aIsExactMatch && !bIsExactMatch) return -1;
      if (!aIsExactMatch && bIsExactMatch) return 1;

      // Partial contain matches
      const aContainsMatch = titleA.includes(assumedQueryTitle);
      const bContainsMatch = titleB.includes(assumedQueryTitle);

      if (aContainsMatch && !bContainsMatch) return -1;
      if (!aContainsMatch && bContainsMatch) return 1;

      // Fallback to popularity
      const aRatings = a.volumeInfo?.ratingsCount || 0;
      const bRatings = b.volumeInfo?.ratingsCount || 0;

      if (aRatings !== bRatings) {
        return bRatings - aRatings; // Prefer more ratings
      }

      const aAvg = a.volumeInfo?.averageRating || 0;
      const bAvg = b.volumeInfo?.averageRating || 0;
      return bAvg - aAvg; // Then prefer higher average
    });

    this.logger.log(
      `🔹 Selected Google Books result: ${filtered[0].volumeInfo?.title}`,
    );
    return filtered[0];
  }

  private mapVolumeToExternalData(volume: any): ExternalBookData {
    const info = volume.volumeInfo ?? {};

    const isbn13 = info.industryIdentifiers?.find(
      (id: any) => id.type === 'ISBN_13',
    )?.identifier;

    // Attempt to extract series information if present
    const seriesName =
      info.series?.[0] ?? info?.seriesInfo?.volumeSeries?.title ?? undefined;

    // Google Books does not consistently expose series index/total; leave undefined unless present
    let seriesIndex: number | undefined = undefined;
    if (info?.seriesInfo?.volumeNumber) {
      const pn = Number(info.seriesInfo.volumeNumber);
      if (!Number.isNaN(pn)) seriesIndex = pn;
    }

    return {
      title: info.title,
      author: info.authors?.[0],
      description: info.description,
      publishedYear: info.publishedDate
        ? Number(info.publishedDate.split('-')[0])
        : undefined,

      isbn13,
      googleVolumeId: volume.id,

      externalAvgRating: info.averageRating,
      externalRatingCount: info.ratingsCount,

      seriesName,
      seriesIndex,
    };
  }
}
