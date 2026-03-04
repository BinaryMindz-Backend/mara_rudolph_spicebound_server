import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';

export interface GoodreadsBookData {
    title?: string;
    author?: string;
    description?: string;
    isbn13?: string;
}

@Injectable()
export class GoodreadsProvider {
  private readonly logger = new Logger(GoodreadsProvider.name);

    /**
     * Fetches book metadata from a Goodreads book/show page by book ID.
     * Used when user pastes a Goodreads URL so we can resolve title/author for search.
     */
    async fetchByBookId(bookId: string): Promise<GoodreadsBookData | null> {
        try {
            const url = `https://www.goodreads.com/book/show/${bookId}`;
            this.logger.log(`🔍 Fetching Goodreads book page: ${url}`);

            const response = await fetch(url, {
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });

            if (!response.ok) {
                this.logger.warn(`⚠️ Goodreads book page failed with status: ${response.status}`);
                return null;
            }

            const html = await response.text();
            const $ = cheerio.load(html);

            // Goodreads: #bookTitle (often with trailing newline), author in .authorName or [itemprop="author"]
            const titleEl = $('#bookTitle');
            const title = titleEl.length ? titleEl.first().text().trim() : undefined;

            const authorEl = $('a.authorName, [itemprop="author"]').first();
            const author = authorEl.length ? authorEl.text().trim() : undefined;

            if (!title && !author) {
                this.logger.warn(`⚠️ Could not parse title/author from Goodreads book ${bookId}`);
                return null;
            }

            // Optional: description from #description span(s)
            let description: string | undefined;
            const descSpan = $('#description span').first();
            if (descSpan.length) {
                description = descSpan.text().trim().slice(0, 2000) || undefined;
            }

            this.logger.log(`✅ Goodreads book resolved: ${title ?? '?'} by ${author ?? '?'}`);
            return { title, author, description };
        } catch (error) {
            this.logger.error(`❌ Failed to fetch Goodreads book ${bookId}`, error);
            return null;
        }
    }

    /**
     * Scrapes Goodreads search results to find the average rating and rating count
     * for a given book title and author.
     */
    async getRatings(
        title: string,
        author: string,
    ): Promise<{ averageRating?: number; ratingsCount?: number } | null> {
        try {
            const query = `${title} ${author}`;
            const url = `https://www.goodreads.com/search?q=${encodeURIComponent(query)}`;

      this.logger.log(`🔍 Fetching Goodreads ratings for: ${query}`);

      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!response.ok) {
        this.logger.warn(
          `⚠️ Goodreads search failed with status: ${response.status}`,
        );
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Goodreads sometimes injects a phantom 0.00 rating element as the very first child.
      // Loop through until we find a real rating.
      let averageRating: number | undefined = undefined;
      let ratingsCount: number | undefined = undefined;

      $('.minirating').each((_i, el) => {
        if (averageRating !== undefined) return; // break loop if already found

        const miniratingText = $(el).text().trim();
        if (!miniratingText) return;

        // Expected format: " 3.62 avg rating — 206,107 ratings"
        // Replace all unicode dashes with standard dashes first for safety.
        const cleanText = miniratingText.replace(/—/g, '-').replace(/–/g, '-');

        const avgMatch = cleanText.match(/([\d.]+)\s+avg rating/);
        const countMatch = cleanText.match(/-\s+([\d,]+)\s+rating\w*/);

        if (avgMatch && countMatch) {
          const parsedAvg = parseFloat(avgMatch[1]);
          const parsedCount = parseInt(countMatch[1].replace(/,/g, ''), 10);

          if (!isNaN(parsedAvg) && !isNaN(parsedCount) && parsedCount > 0) {
            averageRating = parsedAvg;
            ratingsCount = parsedCount;
          }
        }
      });

      if (averageRating === undefined || ratingsCount === undefined) {
        this.logger.warn(
          `⚠️ Could not find valid non-zero rating string on Goodreads for ${query}`,
        );
        return null;
      }

      this.logger.log(
        `✅ Goodreads ratings parsed: Avg=${averageRating}, Count=${ratingsCount}`,
      );

      return { averageRating, ratingsCount };
    } catch (error) {
      this.logger.error('❌ Failed to fetch Goodreads ratings', error);
      return null;
    }
  }
}
