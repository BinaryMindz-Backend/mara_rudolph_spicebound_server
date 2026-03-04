import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';

@Injectable()
export class GoodreadsProvider {
  private readonly logger = new Logger(GoodreadsProvider.name);

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
