import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

import { GoogleBooksProvider } from './providers/google-books.provider.js';
import { OpenLibraryProvider } from './providers/open-library.provider.js';
import { GoodreadsProvider } from './providers/goodreads.provider.js';
import { AiEnrichmentService } from './ai/ai-enrichment.service.js';
import { normalizeText } from './utils/text-utils.js';

import { BookSlipResponse } from './dto/book-slip.response.js';
import { detectInputType } from './utils/input-detector.js';
import {
  extractAsin,
  extractGoodreadsId,
  extractGoogleBooksVolumeId,
  extractOpenLibraryId,
} from './utils/url-normalizer.js';
import { mergeExternalData } from './utils/merge-book-data.js';
import { calculateCombinedRating } from '../../common/utils/rating-utils.js';
import {
  generateLinks,
  generateAmazonLink,
  generateBookshopLink,
} from './utils/link-generator.js';

import { ExternalBookData, InputType } from './types/book-source.types.js';
import {
  BookAliasType,
  AgeLevel,
  SeriesStatus,
} from '../../../prisma/generated/prisma-client/enums.js';

/**
 * Format chip strings for display (Title Case)
 */
function toTitleCase(str: string): string {
  if (!str) return str;
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format age level for display.
 * FIX #1: Uses CHILDRENS (with S) as the canonical key, matching schema enum and sanitizer output.
 */
function formatAgeLevel(level?: string): string | undefined {
  if (!level) return undefined;

  const ageMap: Record<string, string> = {
    CHILDRENS: "Children's",
    CHILDREN: "Children's",   // legacy fallback for any pre-migration records
    YA: 'YA',
    NA: 'New Adult',
    ADULT: 'Adult',
    EROTICA: 'Erotica',
    UNKNOWN: 'Unknown',
  };

  return ageMap[level] || level;
}

@Injectable()
export class BookSlipService {
  private readonly logger = new Logger(BookSlipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleBooks: GoogleBooksProvider,
    private readonly openLibrary: OpenLibraryProvider,
    private readonly goodreads: GoodreadsProvider,
    private readonly aiEnrichment: AiEnrichmentService,
  ) {}

  async discoverBook(input: string): Promise<BookSlipResponse> {
    this.logger.log(`🔹 discoverBook called with input: ${input}`);

    const inputType = detectInputType(input);
    this.logger.log(`🔹 Detected input type: ${inputType}`);

    let googleData: ExternalBookData | undefined;
    let openLibraryData: ExternalBookData | undefined;
    let goodreadsData: ExternalBookData | undefined;
    let asin: string | undefined;
    let isbn13: string | undefined;
    let googleVolumeId: string | undefined;
    let openLibraryId: string | undefined;
    let goodreadsId: string | undefined;
    let searchQuery = input;

    /**
     * 1️⃣ Extract all possible external IDs from input
     */
    if (inputType === InputType.AMAZON_URL) {
      asin = extractAsin(input) ?? undefined;
      this.logger.log(`🔹 Extracted ASIN from Amazon URL: ${asin}`);

      try {
        const urlObj = new URL(input);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        const dpIndex = pathParts.indexOf('dp');
        const gpIndex = pathParts.indexOf('product');

        if (dpIndex > 0) {
          searchQuery = decodeURIComponent(
            pathParts[dpIndex - 1].replace(/-/g, ' '),
          );
          this.logger.log(
            `🔹 Extracted search query from Amazon URL: ${searchQuery}`,
          );
        } else if (gpIndex > 1) {
          searchQuery = decodeURIComponent(
            pathParts[gpIndex - 2].replace(/-/g, ' '),
          );
        } else if (!asin) {
          searchQuery = urlObj.searchParams.get('k') || input;
        } else {
          searchQuery = asin;
          this.logger.log(`🔹 Using ASIN as search query: ${searchQuery}`);
        }
      } catch (e) {
        if (asin) searchQuery = asin;
      }
    } else if (inputType === InputType.GOODREADS_URL) {
      goodreadsId = extractGoodreadsId(input) ?? undefined;
      this.logger.log(`🔹 Extracted Goodreads book ID: ${goodreadsId}`);
      const slugMatch = input.match(
        /goodreads\.com\/book\/show\/\d+(?:[.-]([^?/#]+))?/,
      );
      if (slugMatch && slugMatch[1]) {
        searchQuery = decodeURIComponent(slugMatch[1].replace(/[-_]/g, ' '));
        this.logger.log(
          `🔹 Extracted search query from Goodreads URL slug: ${searchQuery}`,
        );
      }
    } else if (inputType === InputType.GOOGLE_BOOKS_URL) {
      googleVolumeId = extractGoogleBooksVolumeId(input) ?? undefined;
      this.logger.log(
        `🔹 Extracted Google Volume ID from URL: ${googleVolumeId}`,
      );
    } else if (inputType === InputType.OPEN_LIBRARY_URL) {
      openLibraryId = extractOpenLibraryId(input) ?? undefined;
      this.logger.log(
        `🔹 Extracted Open Library ID from URL: ${openLibraryId}`,
      );
    }

    /**
     * 2️⃣ Check DB for existing book using extracted IDs (before any API calls)
     */
    let existingBook = await this.checkBookByExternalIds(
      asin,
      googleVolumeId,
      openLibraryId,
      isbn13,
      goodreadsId,
    );

    // When we found by ASIN from an Amazon URL, verify the cached title matches the URL slug.
    // If it doesn't, the cache entry is for a different book — discard and re-enrich.
    if (
      existingBook &&
      inputType === InputType.AMAZON_URL &&
      asin &&
      searchQuery !== asin
    ) {
      const slugNorm = normalizeText(searchQuery);
      const titleNorm = normalizeText(existingBook.title ?? '');
      const slugWords = slugNorm.split(/\s+/).filter(Boolean).slice(0, 4);
      const titleContainsSlug =
        slugWords.length > 0 && slugWords.every((w) => titleNorm.includes(w));
      if (!titleContainsSlug) {
        this.logger.log(
          `🔹 Cached book title "${existingBook.title}" doesn't match Amazon URL slug "${searchQuery}" – re-enriching with Amazon context`,
        );
        existingBook = null;
      }
    }

    if (existingBook) {
      this.logger.log(
        `✅ Found existing book by external ID: ${existingBook.id} (no API calls needed)`,
      );
      existingBook = await this.refreshIncompleteSeriesIfNeeded(existingBook);
      return this.buildSlip(existingBook, false);
    }

    this.logger.log(
      `🔹 No book found by external IDs, proceeding with API calls`,
    );

    /**
     * 3️⃣ Fetch external metadata from APIs
     */
    if (goodreadsId && inputType === InputType.GOODREADS_URL && !existingBook) {
      const grBook = await this.goodreads.fetchByBookId(goodreadsId);
      if (grBook?.title || grBook?.author) {
        goodreadsData = {
          title: grBook.title,
          author: grBook.author,
          description: grBook.description,
          goodreadsId,
        };
        searchQuery = [grBook.title, grBook.author].filter(Boolean).join(' ');
        this.logger.log(
          `🔹 Using Goodreads-resolved search query: ${searchQuery}`,
        );
      }
    }

    if (googleVolumeId) {
      googleData = await this.googleBooks.fetchByVolumeId(googleVolumeId);
      this.logger.log('🔹 GoogleBooksProvider.fetchByVolumeId:', googleData);
    } else if (openLibraryId) {
      openLibraryData =
        (await this.openLibrary.fetchById(openLibraryId)) ?? undefined;
      this.logger.log('🔹 OpenLibraryProvider.fetchById:', openLibraryData);
    } else {
      const isLikelyUrl =
        searchQuery.startsWith('http://') || searchQuery.startsWith('https://');
      if (!isLikelyUrl) {
        const [googleResult, openLibraryResult] = await Promise.all([
          this.googleBooks.search(searchQuery).catch(() => undefined),
          this.openLibrary.search(searchQuery).catch(() => undefined),
        ]);
        googleData = googleResult || undefined;
        openLibraryData = openLibraryResult || undefined;
        this.logger.log('🔹 GoogleBooksProvider.search:', googleData);
        this.logger.log('🔹 OpenLibraryProvider.search:', openLibraryData);
      }
    }

    /**
     * 4️⃣ Merge sources
     */
    const merged = mergeExternalData(
      googleData,
      openLibraryData,
      goodreadsData,
    );
    this.logger.log('🔹 Merged data:', merged);

    if (!merged.title || !merged.author) {
      this.logger.error('❌ Missing title or author', merged);
      throw new Error('Unable to resolve book identity');
    }

    const normalizedTitle = normalizeText(merged.title);
    const normalizedAuthor = normalizeText(merged.author);

    /**
     * 5️⃣ Check existing book by normalized title + author (fallback)
     */
    existingBook = await this.prisma.book.findFirst({
      where: { normalizedTitle, normalizedAuthor },
    });

    if (!existingBook) {
      existingBook = await this.prisma.book.findFirst({
        where: { normalizedTitle },
      });
      if (existingBook) {
        this.logger.log(
          `🔹 Found book by title-only fuzzy match: ${existingBook.id}`,
        );
      }
    }

    if (existingBook) {
      this.logger.log(
        `✅ Found existing book by title/author: ${existingBook.id} (no AI call)`,
      );
      await this.updateAliasesIfNeeded(existingBook.id, merged, goodreadsId);
      existingBook = await this.refreshIncompleteSeriesIfNeeded(existingBook);
      return this.buildSlip(existingBook, false);
    }

    /**
     * 6️⃣ New book — run AI enrichment
     */
    this.logger.log(
      `🔹 Book not in DB, performing AI enrichment (this will be cached)`,
    );

    let enriched: any;
    try {
      const hasSeriesContext =
        merged.seriesName != null ||
        merged.seriesIndex != null ||
        merged.seriesTotal != null ||
        merged.seriesStatus != null;

      const enrichPayload: Record<string, unknown> = {
        title: merged.title,
        author: merged.author,
        description: merged.description,
        ...(hasSeriesContext && {
          seriesContext: {
            name: merged.seriesName,
            position: merged.seriesIndex,
            totalBooks: merged.seriesTotal,
            status: merged.seriesStatus,
          },
        }),
      };

      if (inputType === InputType.AMAZON_URL && asin) {
        enrichPayload.amazonAsin = asin;
        enrichPayload.titleFromUrl = searchQuery;
      }

      /**
       * 6b️⃣ Fetch Goodreads ratings in parallel if needed
       */
      const ratingsPromise =
        (merged.externalRatingCount || 0) < 50
          ? this.goodreads
              .getRatings(merged.title, merged.author)
              .catch((e) => {
                this.logger.error(
                  'Goodreads scraping failed in parallel execution',
                  e,
                );
                return null;
              })
          : Promise.resolve(null);

      const [aiResult, ratingsResult] = await Promise.all([
        this.aiEnrichment.enrichBook(enrichPayload),
        ratingsPromise,
      ]);

      enriched = aiResult;

      if (ratingsResult?.averageRating && ratingsResult?.ratingsCount) {
        merged.externalAvgRating = ratingsResult.averageRating;
        merged.externalRatingCount = ratingsResult.ratingsCount;
        this.logger.log(
          `✅ Parallel scrape replaced external ratings with Goodreads: ${merged.externalAvgRating} (${merged.externalRatingCount})`,
        );
      }
    } catch (error: any) {
      if (error.message === 'NON_BOOK_CONTENT') {
        this.logger.warn(
          `Rejecting search result as non-book content: ${merged.title}`,
        );
        throw new Error(
          'That looks like a quiz or study guide, not a book! Try searching for the full title.',
        );
      }
      throw error;
    }

    this.logger.log(
      '🔹 AI Enrichment result:',
      JSON.stringify(enriched, null, 2),
    );
    if (enriched.series) {
      this.logger.log(
        `🔹 AI identified series: ${enriched.series.name}, isMultiArc: ${enriched.series.isMultiArc}`,
      );
    } else {
      this.logger.warn('🔹 AI returned NO series info');
    }

    /**
     * 7️⃣ Create or update book with enriched data
     */
    const resolvedTitle = enriched.title ?? merged.title;
    const resolvedAuthor = enriched.author ?? merged.author;
    const resolvedNormalizedTitle = normalizeText(resolvedTitle);
    const resolvedNormalizedAuthor = normalizeText(resolvedAuthor);

    const aiReturnedAsin: string | undefined = enriched.amazonAsin || undefined;

    // If we had an Amazon URL and previously found a book by ASIN but rejected it (title mismatch),
    // update it with corrected title/author instead of creating a duplicate.
    if (inputType === InputType.AMAZON_URL && asin) {
      const existingByAsin = await this.prisma.bookAlias.findUnique({
        where: {
          type_value: { type: BookAliasType.ASIN, value: asin },
        },
        include: { book: true },
      });
      if (existingByAsin) {
        this.logger.log(
          `🔹 Updating existing book ${existingByAsin.bookId} with corrected title/author from Amazon URL`,
        );
        const amazonUrl = generateAmazonLink(
          resolvedTitle,
          resolvedAuthor || 'Unknown Author',
          asin,
          merged.isbn13,
        );
        const bookshopUrl = generateBookshopLink(
          resolvedTitle,
          resolvedAuthor || 'Unknown Author',
          merged.isbn13,
        );
        await this.prisma.book.update({
          where: { id: existingByAsin.bookId },
          data: {
            title: resolvedTitle,
            normalizedTitle: resolvedNormalizedTitle,
            primaryAuthor: resolvedAuthor,
            normalizedAuthor: resolvedNormalizedAuthor,
            shortDescription:
              enriched.description || merged.description || undefined,
            ageLevel: (enriched.ageLevel as AgeLevel) || undefined,
            spiceCategory: enriched.spiceCategory ?? undefined,
            spiceRating: enriched.spiceRating ?? undefined,
            spiceIncreasesInSeries:
              enriched.spiceIncreasesInSeries ?? undefined,
            tropes: enriched.tropes ?? undefined,
            creatures: enriched.creatures ?? undefined,
            subgenres: enriched.subgenres ?? undefined,
            amazonUrl: amazonUrl ?? undefined,
            bookshopUrl: bookshopUrl ?? undefined,
            seriesName: enriched.series?.name ?? undefined,
            seriesIndex: enriched.series?.position ?? undefined,
            seriesTotal: enriched.series?.totalBooks ?? undefined,
            seriesStatus:
              (enriched.series?.status as SeriesStatus) ?? undefined,
            isMultiArc: enriched.series?.isMultiArc ?? undefined,
            arcName: enriched.series?.arc?.name ?? undefined,
            // FIX #4: arcNumber = which arc in the series (e.g. 1, 2, 3)
            arcNumber: enriched.series?.arc?.arcNumber ?? undefined,
            // FIX #5: arcPosition = position within the arc (e.g. 1 of 2)
            arcPosition: enriched.series?.arc?.position ?? undefined,
            arcTotal: enriched.series?.arc?.totalBooks ?? undefined,
            arcStatus:
              (enriched.series?.arc?.status as SeriesStatus) ?? undefined,
            // FIX #2: persist confidence levels
            confidenceSpiceRating: enriched.confidence?.spiceRating ?? undefined,
            confidenceOverall: enriched.confidence?.overall ?? undefined,
          },
        });

        if (aiReturnedAsin && aiReturnedAsin !== asin) {
          await this.prisma.bookAlias.upsert({
            where: {
              type_value: {
                type: BookAliasType.ASIN,
                value: aiReturnedAsin,
              },
            },
            update: {},
            create: {
              bookId: existingByAsin.bookId,
              type: BookAliasType.ASIN,
              value: aiReturnedAsin,
            },
          });
        }

        const updatedBook = await this.prisma.book.findUniqueOrThrow({
          where: { id: existingByAsin.bookId },
        });
        return this.buildSlip(updatedBook, false, asin, merged.isbn13);
      }
    }

    const amazonUrl = generateAmazonLink(
      resolvedTitle,
      resolvedAuthor || 'Unknown Author',
      aiReturnedAsin || asin || merged.asin,
      merged.isbn13,
    );
    const bookshopUrl = generateBookshopLink(
      resolvedTitle,
      resolvedAuthor || 'Unknown Author',
      merged.isbn13,
    );

    /**
     * 8️⃣ Persist new book record with all enriched data including confidence
     */
    const book = await this.prisma.book.create({
      data: {
        title: resolvedTitle,
        normalizedTitle: resolvedNormalizedTitle,
        primaryAuthor: resolvedAuthor,
        normalizedAuthor: resolvedNormalizedAuthor,
        shortDescription: enriched.description || merged.description || null,
        firstPublishedYear: merged.publishedYear ?? null,

        externalAvgRating: merged.externalAvgRating ?? null,
        externalRatingCount: merged.externalRatingCount ?? null,

        ageLevel: (enriched.ageLevel as AgeLevel) || AgeLevel.UNKNOWN,
        spiceCategory: enriched.spiceCategory ?? null,
        spiceRating: enriched.spiceRating ?? null,
        spiceIncreasesInSeries: enriched.spiceIncreasesInSeries ?? false,
        tropes: enriched.tropes ?? [],
        creatures: enriched.creatures ?? [],
        subgenres: enriched.subgenres ?? [],

        amazonUrl: amazonUrl ?? null,
        bookshopUrl: bookshopUrl ?? null,

        seriesName: enriched.series?.name ?? merged.seriesName ?? null,
        seriesIndex: enriched.series?.position ?? merged.seriesIndex ?? null,
        seriesTotal: enriched.series?.totalBooks ?? merged.seriesTotal ?? null,
        seriesStatus:
          (enriched.series?.status as SeriesStatus) ??
          (merged.seriesStatus as SeriesStatus) ??
          SeriesStatus.UNKNOWN,

        isMultiArc: enriched.series?.isMultiArc ?? false,
        arcName: enriched.series?.arc?.name ?? null,
        // FIX #4: arcNumber = which arc in the series
        arcNumber: enriched.series?.arc?.arcNumber ?? null,
        // FIX #5: arcPosition = position within the arc
        arcPosition: enriched.series?.arc?.position ?? null,
        arcTotal: enriched.series?.arc?.totalBooks ?? null,
        arcStatus:
          (enriched.series?.arc?.status as SeriesStatus) ??
          SeriesStatus.UNKNOWN,

        // FIX #2: persist AI confidence levels for future review flagging
        confidenceSpiceRating: enriched.confidence?.spiceRating ?? null,
        confidenceOverall: enriched.confidence?.overall ?? null,
      },
    });

    this.logger.log(
      `✅ Book created and stored in DB: ${book.id} with all enriched data`,
    );

    /**
     * 9️⃣ Create aliases for external IDs
     */
    await this.createAliases(book.id, merged, asin, goodreadsId, aiReturnedAsin);

    return this.buildSlip(book, true, asin, merged.isbn13);
  }

  /**
   * Check if book exists by any external ID (ISBN, ASIN, Google Volume ID, Open Library ID, Goodreads ID)
   */
  private async checkBookByExternalIds(
    asin: string | undefined,
    googleVolumeId: string | undefined,
    openLibraryId: string | undefined,
    isbn13: string | undefined,
    goodreadsIdParam?: string,
  ): Promise<any | null> {
    if (isbn13) {
      const byIsbn = await this.prisma.bookAlias.findUnique({
        where: { type_value: { type: BookAliasType.ISBN_13, value: isbn13 } },
        include: { book: true },
      });
      if (byIsbn) {
        this.logger.log(`✅ Found book by ISBN-13: ${byIsbn.bookId}`);
        return byIsbn.book;
      }
    }

    if (asin) {
      const byAsin = await this.prisma.bookAlias.findUnique({
        where: { type_value: { type: BookAliasType.ASIN, value: asin } },
        include: { book: true },
      });
      if (byAsin) {
        this.logger.log(`✅ Found book by ASIN: ${byAsin.bookId}`);
        return byAsin.book;
      }
    }

    if (googleVolumeId) {
      const byGoogleId = await this.prisma.bookAlias.findUnique({
        where: {
          type_value: {
            type: BookAliasType.GOOGLE_VOLUME_ID,
            value: googleVolumeId,
          },
        },
        include: { book: true },
      });
      if (byGoogleId) {
        this.logger.log(
          `✅ Found book by Google Volume ID: ${byGoogleId.bookId}`,
        );
        return byGoogleId.book;
      }
    }

    if (openLibraryId) {
      const byOpenLibId = await this.prisma.bookAlias.findUnique({
        where: {
          type_value: {
            type: BookAliasType.OPEN_LIBRARY_ID,
            value: openLibraryId,
          },
        },
        include: { book: true },
      });
      if (byOpenLibId) {
        this.logger.log(
          `✅ Found book by Open Library ID: ${byOpenLibId.bookId}`,
        );
        return byOpenLibId.book;
      }
    }

    if (goodreadsIdParam) {
      const byGoodreadsId = await this.prisma.bookAlias.findUnique({
        where: {
          type_value: {
            type: BookAliasType.GOODREADS_ID,
            value: goodreadsIdParam,
          },
        },
        include: { book: true },
      });
      if (byGoodreadsId) {
        this.logger.log(
          `✅ Found book by Goodreads ID: ${byGoodreadsId.bookId}`,
        );
        return byGoodreadsId.book;
      }
    }

    return null;
  }

  /**
   * Create aliases for all external IDs to enable future lookups.
   */
  private async createAliases(
    bookId: string,
    merged: ExternalBookData,
    asin: string | undefined,
    goodreadsIdAlias?: string,
    aiReturnedAsin?: string,
  ): Promise<void> {
    const aliases: { bookId: string; type: BookAliasType; value: string }[] =
      [];

    if (merged.isbn13)
      aliases.push({ bookId, type: BookAliasType.ISBN_13, value: merged.isbn13 });
    if (merged.googleVolumeId)
      aliases.push({
        bookId,
        type: BookAliasType.GOOGLE_VOLUME_ID,
        value: merged.googleVolumeId,
      });
    if (merged.openLibraryId)
      aliases.push({
        bookId,
        type: BookAliasType.OPEN_LIBRARY_ID,
        value: merged.openLibraryId,
      });
    if (asin)
      aliases.push({ bookId, type: BookAliasType.ASIN, value: asin });
    if (aiReturnedAsin && aiReturnedAsin !== asin)
      aliases.push({ bookId, type: BookAliasType.ASIN, value: aiReturnedAsin });

    const grId = merged.goodreadsId ?? goodreadsIdAlias;
    if (grId)
      aliases.push({ bookId, type: BookAliasType.GOODREADS_ID, value: grId });

    if (aliases.length > 0) {
      await this.prisma.bookAlias.createMany({
        data: aliases,
        skipDuplicates: true,
      });
      this.logger.log(
        `🔹 Created ${aliases.length} aliases for book ${bookId}`,
      );
    }
  }

  /**
   * Update aliases if we found new external IDs for an existing book
   */
  private async updateAliasesIfNeeded(
    bookId: string,
    merged: ExternalBookData,
    goodreadsIdParam?: string,
  ): Promise<void> {
    const existingAliases = await this.prisma.bookAlias.findMany({
      where: { bookId },
    });
    const existingValues = new Set(
      existingAliases.map((a) => `${a.type}:${a.value}`),
    );
    const newAliases: { bookId: string; type: BookAliasType; value: string }[] =
      [];

    if (
      merged.isbn13 &&
      !existingValues.has(`${BookAliasType.ISBN_13}:${merged.isbn13}`)
    )
      newAliases.push({ bookId, type: BookAliasType.ISBN_13, value: merged.isbn13 });

    if (
      merged.googleVolumeId &&
      !existingValues.has(
        `${BookAliasType.GOOGLE_VOLUME_ID}:${merged.googleVolumeId}`,
      )
    )
      newAliases.push({
        bookId,
        type: BookAliasType.GOOGLE_VOLUME_ID,
        value: merged.googleVolumeId,
      });

    if (
      merged.openLibraryId &&
      !existingValues.has(
        `${BookAliasType.OPEN_LIBRARY_ID}:${merged.openLibraryId}`,
      )
    )
      newAliases.push({
        bookId,
        type: BookAliasType.OPEN_LIBRARY_ID,
        value: merged.openLibraryId,
      });

    if (
      merged.asin &&
      !existingValues.has(`${BookAliasType.ASIN}:${merged.asin}`)
    )
      newAliases.push({ bookId, type: BookAliasType.ASIN, value: merged.asin });

    const grId = merged.goodreadsId ?? goodreadsIdParam;
    if (
      grId &&
      !existingValues.has(`${BookAliasType.GOODREADS_ID}:${grId}`)
    )
      newAliases.push({ bookId, type: BookAliasType.GOODREADS_ID, value: grId });

    if (newAliases.length > 0) {
      await this.prisma.bookAlias.createMany({
        data: newAliases,
        skipDuplicates: true,
      });
      this.logger.log(
        `🔹 Added ${newAliases.length} new aliases to existing book`,
      );
    }
  }

  /**
   * Build slip responses for multiple books (batched — avoids N+1 queries).
   * Use for library/list endpoints.
   */
  public async buildSlipsBatch(books: any[]): Promise<BookSlipResponse[]> {
    if (books.length === 0) return [];
    const bookIds = books.map((b) => b.id);

    const [aliasesRows, ratingGroups] = await Promise.all([
      this.prisma.bookAlias.findMany({ where: { bookId: { in: bookIds } } }),
      this.prisma.rating.groupBy({
        by: ['bookId'],
        where: { bookId: { in: bookIds } },
        _avg: { value: true },
        _count: true,
      }),
    ]);

    const aliasesByBookId = new Map<string, typeof aliasesRows>();
    for (const row of aliasesRows) {
      const list = aliasesByBookId.get(row.bookId) ?? [];
      list.push(row);
      aliasesByBookId.set(row.bookId, list);
    }
    const ratingsByBookId = new Map(
      ratingGroups.map((r) => [
        r.bookId,
        { _avg: { value: r._avg.value }, _count: r._count },
      ]),
    );

    return books.map((book) => {
      const aliases = aliasesByBookId.get(book.id) ?? [];
      let finalAsin: string | undefined;
      let finalIsbn13: string | undefined;
      let finalGoodreadsId: string | undefined;
      for (const alias of aliases) {
        if (alias.type === BookAliasType.ASIN) finalAsin = alias.value;
        if (alias.type === BookAliasType.ISBN_13) finalIsbn13 = alias.value;
        if (alias.type === BookAliasType.GOODREADS_ID)
          finalGoodreadsId = alias.value;
      }
      const platformRatings = ratingsByBookId.get(book.id) ?? {
        _avg: { value: null as number | null },
        _count: 0,
      };
      return this.buildSlipResponse(
        book,
        false,
        finalAsin,
        finalIsbn13,
        finalGoodreadsId,
        platformRatings,
      );
    });
  }

  /**
   * Build a single slip. For multiple books use buildSlipsBatch to avoid N+1 queries.
   */
  public async buildSlip(
    book: any,
    created: boolean,
    asin?: string,
    isbn13?: string,
  ): Promise<BookSlipResponse> {
    let finalAsin = asin;
    let finalIsbn13 = isbn13;
    let finalGoodreadsId: string | undefined;

    const aliases = await this.prisma.bookAlias.findMany({
      where: { bookId: book.id },
    });
    for (const alias of aliases) {
      if (alias.type === BookAliasType.ASIN && !finalAsin)
        finalAsin = alias.value;
      if (alias.type === BookAliasType.ISBN_13 && !finalIsbn13)
        finalIsbn13 = alias.value;
      if (alias.type === BookAliasType.GOODREADS_ID)
        finalGoodreadsId = alias.value;
    }

    const platformRatings = await this.prisma.rating.aggregate({
      where: { bookId: book.id },
      _avg: { value: true },
      _count: true,
    });

    return this.buildSlipResponse(
      book,
      created,
      finalAsin,
      finalIsbn13,
      finalGoodreadsId,
      platformRatings,
    );
  }

  /**
   * Synchronous slip response builder (used by buildSlip and buildSlipsBatch).
   */
  private buildSlipResponse(
    book: any,
    created: boolean,
    finalAsin: string | undefined,
    finalIsbn13: string | undefined,
    finalGoodreadsId: string | undefined,
    platformRatings: { _avg: { value: number | null }; _count: number },
  ): BookSlipResponse {
    const links = generateLinks(
      book.title,
      book.primaryAuthor || 'Unknown Author',
      finalAsin,
      finalIsbn13,
      book.amazonUrl,
      book.bookshopUrl,
      finalGoodreadsId,
    );
    const combinedRatings = calculateCombinedRating(
      book.externalAvgRating,
      book.externalRatingCount,
      platformRatings._avg.value,
      platformRatings._count,
    );
    const ratingsInfo = {
      ...combinedRatings,
      count: (book.externalRatingCount || 0) + platformRatings._count,
    };

    // Series display logic
    const isStandaloneBook =
      book.seriesTotal === 1 &&
      (book.seriesIndex == null || book.seriesIndex === 1) &&
      !book.isMultiArc;

    let series: any;
    if (isStandaloneBook) {
      series = {
        name: 'Standalone',
        index: null,
        total: null,
        status: book.seriesStatus ?? SeriesStatus.COMPLETE,
      };
    } else if (book.seriesName) {
      series = {
        name: 'Series',
        index: book.seriesIndex ?? null,
        total: book.seriesTotal ?? null,
        status: book.seriesStatus,
      };
    } else {
      series = {
        name: 'Standalone',
        index: null,
        total: null,
        status: SeriesStatus.COMPLETE,
      };
    }

    // FIX #4 / #5: Arc display uses arcNumber for label ("Arc 1") and arcPosition for count ("1/2")
    let arc: any;
    if (book.isMultiArc && (book.arcName || book.arcNumber)) {
      arc = {
        name: book.arcNumber ? `Arc ${book.arcNumber}` : 'Arc',
        arcNumber: book.arcNumber ?? null,       // which arc in the series
        index: book.arcPosition ?? null,          // position within this arc
        total: book.arcTotal ?? null,
        status: book.arcStatus as SeriesStatus,
      };
    }

    // FIX #2: Read persisted confidence levels from DB instead of hardcoding HIGH
    const confidence = {
      spiceRating: (book.confidenceSpiceRating as string) || 'HIGH',
      ageLevel: 'HIGH',
      tropes: 'HIGH',
      creatures: 'HIGH',
      subgenres: 'HIGH',
      series: 'HIGH',
      overall: (book.confidenceOverall as string) || 'HIGH',
    };

    return {
      bookId: book.id,
      title: book.title,
      author: book.primaryAuthor,
      description: book.shortDescription ?? undefined,

      releaseYear: book.firstPublishedYear ?? undefined,

      ageLevel: formatAgeLevel(book.ageLevel),
      spiceCategory: book.spiceCategory ?? undefined,
      spiceRating: book.spiceRating ?? 0,
      spiceIncreasesInSeries: book.spiceIncreasesInSeries ?? false,

      tropes: (book.tropes ?? []).map(toTitleCase),
      creatures: (book.creatures ?? []).map(toTitleCase),
      subgenres: (book.subgenres ?? []).map(toTitleCase),

      series,
      isMultiArc: !!book.isMultiArc,
      arc,

      ratings: ratingsInfo,
      links,
      created,
      confidence,
    };
  }

  private async refreshIncompleteSeriesIfNeeded(book: any): Promise<any> {
    if (
      book.seriesStatus !== SeriesStatus.INCOMPLETE &&
      book.arcStatus !== SeriesStatus.INCOMPLETE
    ) {
      return book;
    }

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const isOutdated =
      Date.now() - new Date(book.updatedAt).getTime() > THIRTY_DAYS_MS;

    if (!isOutdated) return book;

    this.logger.log(
      `🔹 Book ${book.id} is INCOMPLETE and >30 days old. Doing lightweight series refresh.`,
    );

    const aliases = await this.prisma.bookAlias.findMany({
      where: { bookId: book.id },
    });
    const googleId = aliases.find(
      (a) => a.type === BookAliasType.GOOGLE_VOLUME_ID,
    )?.value;
    const openLibId = aliases.find(
      (a) => a.type === BookAliasType.OPEN_LIBRARY_ID,
    )?.value;

    let googleData: ExternalBookData | undefined;
    let openLibraryData: ExternalBookData | undefined;

    if (googleId) {
      googleData =
        (await this.googleBooks
          .fetchByVolumeId(googleId)
          .catch(() => undefined)) ?? undefined;
    } else {
      googleData =
        (await this.googleBooks
          .search(`${book.title} ${book.primaryAuthor}`)
          .catch(() => undefined)) ?? undefined;
    }

    if (openLibId) {
      openLibraryData =
        (await this.openLibrary.fetchById(openLibId).catch(() => undefined)) ??
        undefined;
    } else {
      openLibraryData =
        (await this.openLibrary
          .search(`${book.title} ${book.primaryAuthor}`)
          .catch(() => undefined)) ?? undefined;
    }

    const merged = mergeExternalData(googleData, openLibraryData, undefined);
    const updates: any = {};

    if (book.seriesStatus === SeriesStatus.INCOMPLETE) {
      if (merged.seriesStatus === 'COMPLETE')
        updates.seriesStatus = SeriesStatus.COMPLETE;
      if (merged.seriesTotal && merged.seriesTotal > (book.seriesTotal || 0))
        updates.seriesTotal = merged.seriesTotal;
    }

    if (Object.keys(updates).length > 0) {
      this.logger.log(
        `🔹 Updating book ${book.id} series info: ${JSON.stringify(updates)}`,
      );
      return this.prisma.book.update({ where: { id: book.id }, data: updates });
    }

    return this.prisma.book.update({
      where: { id: book.id },
      data: { updatedAt: new Date() },
    });
  }
}