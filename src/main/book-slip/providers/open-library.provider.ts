import { Injectable, Logger } from '@nestjs/common';
import { ExternalBookData } from '../types/book-source.types.js';

@Injectable()
export class OpenLibraryProvider {
  private readonly logger = new Logger(OpenLibraryProvider.name);
  private readonly baseUrl = 'https://openlibrary.org/search.json';
  /**
   * Search Open Library by title/author
   */
  async search(query: string): Promise<ExternalBookData | null> {
    try {
      this.logger.log(`🔍 OpenLibrary search query: ${query}`);

      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(
        query,
      )}&limit=1`;

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

      const doc = data.docs[0];
      const workId = doc.key?.replace('/works/', '');

      const mapped: ExternalBookData = {
        title: doc.title ?? undefined,
        author: doc.author_name?.[0] ?? undefined,
        publishedYear: doc.first_publish_year ?? undefined,
        isbn13: doc.isbn?.find((i: string) => i.length === 13),
        openLibraryId: workId,
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
      };

      this.logger.log('✅ OpenLibrary fetchById mapped:', mapped);
      return mapped;
    } catch (error) {
      this.logger.error('❌ OpenLibrary fetchById error', error);
      return null;
    }
  }
}
