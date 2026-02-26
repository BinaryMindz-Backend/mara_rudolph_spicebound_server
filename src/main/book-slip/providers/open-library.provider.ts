import { Injectable, Logger } from '@nestjs/common';
import { ExternalBookData } from '../types/book-source.types.js';

@Injectable()
export class OpenLibraryProvider {
  private readonly logger = new Logger(OpenLibraryProvider.name);
  private readonly baseUrl = 'https://openlibrary.org/search.json';

  private readonly EDITION_EXCLUSION_KEYWORDS = [
    'box set',
    'boxed set',
    'collection',
    'special edition',
    'illustrated edition',
    'complete series',
    'omnibus',
    'anniversary edition',
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
  ];
  /**
   * Search Open Library by title/author
   */
  async search(query: string): Promise<ExternalBookData | null> {
    try {
      this.logger.log(`🔍 OpenLibrary search query: ${query}`);

      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(
        query,
      )}&limit=10`;

      const res = await fetch(url);

      if (!res.ok) {
        this.logger.warn(
          `⚠️ OpenLibrary search failed: ${res.status} ${res.statusText}`,
        );
        return null;
      }

      const data = await res.json();

      if (!data?.docs?.length) {
        this.logger.log('ℹ️ OpenLibrary: no results found');
        return null;
      }

      // Filter and rank results
      const items = data.docs;
      const filtered = items.filter((item: any) => {
        const title = (item.title || '').toLowerCase();
        return !this.EDITION_EXCLUSION_KEYWORDS.some((keyword) =>
          title.includes(keyword),
        ) && !this.CONTENT_EXCLUSION_KEYWORDS.some((keyword) =>
          title.includes(keyword),
        );
      });

      if (!filtered.length) {
        this.logger.warn('All results filtered from OpenLibrary');
        return null;
      }

      // Simple ranking: exact title match first, then by edition count (proxy for popularity)
      filtered.sort((a: any, b: any) => {
        const scoreA = this.calculateScore(a, query);
        const scoreB = this.calculateScore(b, query);

        if (scoreA !== scoreB) return scoreB - scoreA;
        return (b.edition_count || 0) - (a.edition_count || 0);
      });

      const doc = filtered[0];
      const workId = doc.key?.replace('/works/', '');

      const mapped: ExternalBookData = {
        title: doc.title ?? undefined,
        author: doc.author_name?.[0] ?? undefined,
        publishedYear: doc.first_publish_year ?? undefined,
        isbn13: doc.isbn?.find((i: string) => i.length === 13),
        openLibraryId: workId,
        seriesName: doc.series?.[0] ?? undefined,
      };

      this.logger.log('✅ OpenLibrary search mapped:', mapped);

      // Fetch full work details to get description
      if (workId) {
        const enrichedData = await this.fetchById(workId);
        if (enrichedData?.description) {
          mapped.description = enrichedData.description;
          this.logger.log(
            '✅ OpenLibrary fetched description for work:',
            workId,
          );
        }
      }

      return mapped;
    } catch (error) {
      this.logger.error('❌ OpenLibrary search error', error);
      return null;
    }
  }

  private calculateScore(item: any, query: string): number {
    let score = 0;
    const title = (item.title || '').toLowerCase().trim();
    const q = query.toLowerCase().trim();

    if (title === q) score += 100;
    else if (title.includes(q)) score += 40;

    return score;
  }

  /**
   * Fetch Open Library work by ID
   * Example ID: OL45804W
   */
  async fetchById(id: string): Promise<ExternalBookData | null> {
    try {
      const cleanId = id.replace('/works/', '');
      this.logger.log(`🔍 OpenLibrary fetchById: ${cleanId}`);

      const url = `https://openlibrary.org/works/${cleanId}.json`;
      const res = await fetch(url);

      if (!res.ok) {
        this.logger.warn(
          `⚠️ OpenLibrary fetchById failed: ${res.status} ${res.statusText}`,
        );
        return null;
      }

      const data = await res.json();

      const mapped: ExternalBookData = {
        title: data.title ?? undefined,
        description:
          typeof data.description === 'string'
            ? data.description
            : (data.description?.value ?? undefined),
        openLibraryId: cleanId,
        seriesName: Array.isArray(data.series)
          ? data.series[0]
          : (data.series ?? undefined),
      };

      this.logger.log('✅ OpenLibrary fetchById mapped:', mapped);
      return mapped;
    } catch (error) {
      this.logger.error('❌ OpenLibrary fetchById error', error);
      return null;
    }
  }
}
