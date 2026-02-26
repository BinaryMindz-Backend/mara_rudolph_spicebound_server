import { Injectable, Logger } from '@nestjs/common';
import { ExternalBookData } from '../types/book-source.types.js';

@Injectable()
export class GoogleBooksProvider {
  private readonly logger = new Logger(GoogleBooksProvider.name);
  private readonly baseUrl = 'https://www.googleapis.com/books/v1/volumes';

  private readonly EDITION_EXCLUSION_KEYWORDS = [
    'box set',
    'boxed set',
    'collection',
    'special edition',
    'illustrated edition',
    'complete series',
    'omnibus',
    'anniversary edition',
    'collector\'s edition',
    'deluxe edition',
  ];

  private readonly CONTENT_EXCLUSION_KEYWORDS = [
    'quiz',
    'trivia',
    'study guide',
    'summary',
    'analysis',
    'workbook',
    'notebook',
    'coloring book',
    'journal',
    'companion',
    'key takeaways',
    'review of',
    'synopsis',
    'cliff notes',
  ];

  private readonly ABBREVIATIONS: Record<string, string> = {
    'acotar': 'a court of thorns and roses',
    'tog': 'throne of glass',
    'cc': 'crescent city',
    'fbaa': 'from blood and ash',
    'asotte': 'a soul of ash and blood',
    'hosab': 'house of sky and breath',
    'hoscas': 'house of sky and breath', // common typo
    'hoeab': 'house of earth and blood',
    'hofas': 'house of flame and shadow',
    'acomaf': 'a court of mist and fury',
    'acowar': 'a court of wings and ruin',
    'acofas': 'a court of frost and starlight',
    'acosf': 'a court of silver flames',
  };

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
   * Prefers exact matches, accurate authors, and Romance/Fantasy books
   */
  private filterAndRankResults(items: any[], query: string): any | undefined {
    const filtered = items.filter((item) => {
      const title = (item.volumeInfo?.title || '').toLowerCase();
      const description = (item.volumeInfo?.description || '').toLowerCase();

      // Check for edition exclusions
      const isSpecialEdition = this.EDITION_EXCLUSION_KEYWORDS.some((keyword) =>
        title.includes(keyword),
      );
      if (isSpecialEdition) return false;

      // Check for content exclusions (quizzes, guides, etc.)
      const isJunkContent = this.CONTENT_EXCLUSION_KEYWORDS.some((keyword) =>
        title.includes(keyword) || (title.length < 50 && description.includes(keyword)),
      );
      if (isJunkContent) return false;

      return true;
    });

    if (!filtered.length) {
      this.logger.warn('All results filtered as special editions or non-book content');
      return undefined; // Do NOT fall back to junk
    }

    const normalizedQuery = query.toLowerCase().trim();
    let assumedQueryTitle = normalizedQuery;
    let assumedAuthor = '';

    if (normalizedQuery.includes(' by ')) {
      const parts = normalizedQuery.split(' by ');
      assumedQueryTitle = parts[0].trim();
      assumedAuthor = parts[1].trim();
    }

    // Rank by scoring algorithm to find the absolute closest match
    filtered.sort((a, b) => {
      const scoreA = this.calculateMatchScore(a, assumedQueryTitle, assumedAuthor);
      const scoreB = this.calculateMatchScore(b, assumedQueryTitle, assumedAuthor);

      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Descending order
      }

      // Tie breaker: Ratings count (popularity)
      const aRatings = a.volumeInfo?.ratingsCount || 0;
      const bRatings = b.volumeInfo?.ratingsCount || 0;
      return bRatings - aRatings;
    });

    this.logger.log(
      `🔹 Selected Google Books result: ${filtered[0].volumeInfo?.title} (Score: ${this.calculateMatchScore(filtered[0], assumedQueryTitle, assumedAuthor)})`,
    );
    return filtered[0];
  }

  /**
   * Weights the relevance of an API result against the user's intent
   */
  private calculateMatchScore(item: any, titleQuery: string, authorQuery: string): number {
    let score = 0;
    const info = item.volumeInfo || {};

    // 1. Title Match (Exact vs Partial Containment text)
    const itemTitle = (info.title || '').toLowerCase().trim();
    const cleanTitleQuery = titleQuery.toLowerCase().trim();

    // Handle Abbreviations
    const expandedQuery = this.ABBREVIATIONS[cleanTitleQuery] || cleanTitleQuery;

    if (itemTitle === expandedQuery) {
      score += 100; // Perfect exact title match
    } else if (itemTitle.includes(expandedQuery) || expandedQuery.includes(itemTitle)) {
      score += 40; // Partial match
    }

    // Boost if the original query was an abbreviation and matches exactly
    if (this.ABBREVIATIONS[cleanTitleQuery] && itemTitle === this.ABBREVIATIONS[cleanTitleQuery]) {
      score += 50; // Extra certainty for "acotar" -> "A Court of Thorns and Roses"
    }

    // 2. Author Match
    if (authorQuery && info.authors?.length) {
      const itemAuthors = info.authors.map((a: string) => a.toLowerCase());
      const hasAuthorMatch = itemAuthors.some((a: string) =>
        a.includes(authorQuery.toLowerCase()) || authorQuery.toLowerCase().includes(a)
      );
      if (hasAuthorMatch) {
        score += 80;
      }
    }

    // 3. Genre/Category Match (Spicebound focuses on Romance/Fantasy logic)
    const targetGenres = ['romance', 'fantasy', 'fiction', 'young adult', 'new adult', 'erotica', 'paranormal'];
    if (info.categories?.length) {
      const itemCats = info.categories.map((c: string) => c.toLowerCase());
      const matchesGenre = itemCats.some((cat: string) =>
        targetGenres.some(tg => cat.includes(tg))
      );
      if (matchesGenre) {
        score += 20; // Genre affinity boost for ambiguous names (e.g. "Darkfever")
      }
    }

    return score;
  }

  private mapVolumeToExternalData(volume: any): ExternalBookData {
    const info = volume.volumeInfo ?? {};

    const isbn13 = info.industryIdentifiers?.find(
      (id: any) => id.type === 'ISBN_13',
    )?.identifier;

    const isbn10 = info.industryIdentifiers?.find(
      (id: any) => id.type === 'ISBN_10',
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
      asin: isbn10,
      googleVolumeId: volume.id,

      externalAvgRating: info.averageRating,
      externalRatingCount: info.ratingsCount,

      seriesName,
      seriesIndex,
    };
  }
}
