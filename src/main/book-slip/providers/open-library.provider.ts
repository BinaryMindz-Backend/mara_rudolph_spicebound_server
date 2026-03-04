import { Injectable, Logger } from '@nestjs/common';
import { ExternalBookData } from '../types/book-source.types.js';
import { normalizeText } from '../utils/text-utils.js';

@Injectable()
export class OpenLibraryProvider {
  private readonly logger = new Logger(OpenLibraryProvider.name);
  private readonly baseUrl = 'https://openlibrary.org/search.json';

  private readonly EDITION_EXCLUSION_KEYWORDS = [
    'anniversary edition',
    "collector's edition",
    'deluxe edition',
    'illustrated edition',
    'special edition',
    'box set',
    'boxed set',
    'complete collection',
    'collection of',
    'entire series',
    'set of',
    'omnibus',
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
    'how well do you know',
    'test your knowledge',
    'trivia challenge',
    'unofficial guide',
  ];

  private readonly ABBREVIATIONS: Record<string, string> = {
    acotar: 'a court of thorns and roses',
    tog: 'throne of glass',
    cc: 'crescent city',
    fbaa: 'from blood and ash',
    asotte: 'a soul of ash and blood',
    hosab: 'house of sky and breath',
    hoscas: 'house of sky and breath',
    hoeab: 'house of earth and blood',
    hofas: 'house of flame and shadow',
    acomaf: 'a court of mist and fury',
    acowar: 'a court of wings and ruin',
    acofas: 'a court of frost and starlight',
    acosf: 'a court of silver flames',
  };

  /**
   * Search Open Library by title/author
   */
  async search(query: string): Promise<ExternalBookData | null> {
    try {
      // Pre-search: Expand popular abbreviations
      const normalizedQuery = query.toLowerCase().trim();
      const expandedQuery = this.ABBREVIATIONS[normalizedQuery] || query;

      this.logger.log(`🔍 OpenLibrary search query: ${expandedQuery}`);

      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(
        expandedQuery,
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
        return (
          !this.EDITION_EXCLUSION_KEYWORDS.some((keyword) =>
            title.includes(keyword),
          ) &&
          !this.CONTENT_EXCLUSION_KEYWORDS.some((keyword) =>
            title.includes(keyword),
          )
        );
      });

      if (!filtered.length) {
        this.logger.warn('All results filtered from OpenLibrary');
        return null;
      }

      // Simple ranking: exact title match first, then by edition count (proxy for popularity)
      filtered.sort((a: any, b: any) => {
        const scoreA = this.calculateScore(a, expandedQuery);
        const scoreB = this.calculateScore(b, expandedQuery);

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
        asin: doc.isbn?.find((i: string) => i.length === 10),
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
    const itemTitle = (item.title || '').toLowerCase().trim();
    const cleanTitleQuery = query.toLowerCase().trim();

    // Handle Abbreviations (expanded query is passed in, so we check against it)
    if (itemTitle === cleanTitleQuery) {
      score += 100;
    } else if (
      itemTitle.includes(cleanTitleQuery) ||
      cleanTitleQuery.includes(itemTitle)
    ) {
      score += 40;
    }

    // Penalize quiz-like titles
    if (itemTitle.includes('(') && itemTitle.includes(')')) {
      const abbreviationInParens = normalizeText(
        itemTitle.substring(itemTitle.indexOf('(') + 1, itemTitle.indexOf(')')),
      );
      if (this.ABBREVIATIONS[abbreviationInParens]) {
        score -= 60;
      }
    }

    // Series Search Prioritization (Prefer Book 1 over Box Sets)
    const isBoxSet =
      itemTitle.includes('box set') || itemTitle.includes('collection');
    const isBookOne =
      itemTitle.includes('book 1') ||
      itemTitle.includes('#1') ||
      itemTitle.includes('book one') ||
      itemTitle.includes('part 1');

    if (isBoxSet) {
      score -= 100; // Heavy penalty for composite products
    } else if (isBookOne) {
      score += 70; // Strong boost for first book in series
    }

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
