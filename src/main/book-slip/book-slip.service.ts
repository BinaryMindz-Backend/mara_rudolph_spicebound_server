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
 * Format age level for display (Title Case, spell out NA)
 */
function formatAgeLevel(level?: string): string | undefined {
  if (!level) return undefined;

  const ageMap: Record<string, string> = {
    CHILDREN: "Children's",
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
          // /gp/product/
          searchQuery = decodeURIComponent(
            pathParts[gpIndex - 2].replace(/-/g, ' '),
          );
        } else if (!asin) {
          searchQuery = urlObj.searchParams.get('k') || input;
        } else {
          // ASIN but no slug (e.g. amazon.com/dp/B00UZH95RA): use ASIN as search query so APIs can match
          searchQuery = asin;
          this.logger.log(`🔹 Using ASIN as search query: ${searchQuery}`);
        }
      } catch (e) {
        // Fallback: if we have ASIN, use it so we don't search with raw URL
        if (asin) searchQuery = asin;
      }
    } else if (inputType === InputType.GOODREADS_URL) {
      // For Goodreads, extract search query
      const match = input.match(
        /goodreads\.com\/book\/show\/\d+(?:[.-]([^?/#]+))?/,
      );
      if (match && match[1]) {
        searchQuery = decodeURIComponent(match[1].replace(/[-_]/g, ' '));
        this.logger.log(
          `🔹 Extracted search query from Goodreads: ${searchQuery}`,
        );
      goodreadsId = extractGoodreadsId(input) ?? undefined;
      this.logger.log(`🔹 Extracted Goodreads book ID: ${goodreadsId}`);
      const slugMatch = input.match(/goodreads\.com\/book\/show\/\d+(?:[.-]([^?/#]+))?/);
      if (slugMatch && slugMatch[1]) {
        searchQuery = decodeURIComponent(slugMatch[1].replace(/[-_]/g, ' '));
        this.logger.log(`🔹 Extracted search query from Goodreads URL slug: ${searchQuery}`);
      }
      // If no slug (e.g. /book/show/9144), searchQuery stays as full URL; we'll fetch by ID below
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
     * 2️⃣ Check DB for existing book using extracted IDs (before any API calls!)
     */
    let existingBook = await this.checkBookByExternalIds(asin, googleVolumeId, openLibraryId, isbn13, goodreadsId);

    // When we found by ASIN from an Amazon URL, the cached book might be wrong (search had returned a different book).
    // If the URL slug doesn't match the stored title, re-enrich with Amazon context to get the correct book.
    if (existingBook && inputType === InputType.AMAZON_URL && asin && searchQuery !== asin) {
      const slugNorm = normalizeText(searchQuery);
      const titleNorm = normalizeText(existingBook.title ?? '');
      const slugWords = slugNorm.split(/\s+/).filter(Boolean).slice(0, 4);
      const titleContainsSlug = slugWords.length > 0 && slugWords.every((w) => titleNorm.includes(w));
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
      const slip = await this.buildSlip(existingBook, false);
      return slip;
    }

    this.logger.log(
      `🔹 No book found by external IDs, proceeding with API calls`,
    );

    /**
     * 3️⃣ Fetch external metadata from APIs
     */
    // When user pasted Goodreads URL with no slug, fetch book by ID to get title/author for search
    if (goodreadsId && (inputType === InputType.GOODREADS_URL) && !existingBook) {
      const grBook = await this.goodreads.fetchByBookId(goodreadsId);
      if (grBook?.title || grBook?.author) {
        goodreadsData = {
          title: grBook.title,
          author: grBook.author,
          description: grBook.description,
          goodreadsId,
        };
        searchQuery = [grBook.title, grBook.author].filter(Boolean).join(' ');
        this.logger.log(`🔹 Using Goodreads-resolved search query: ${searchQuery}`);
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
      // Parallelize API calls for better performance (skip if searchQuery is still a URL)
      const isLikelyUrl = searchQuery.startsWith('http://') || searchQuery.startsWith('https://');
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
     * 4️⃣ Merge sources (Goodreads data from URL takes precedence for title/author)
     */
    const merged = mergeExternalData(googleData, openLibraryData, goodreadsData);
    this.logger.log('🔹 Merged data:', merged);

    if (!merged.title || !merged.author) {
      this.logger.error('❌ Missing title or author', merged);
      throw new Error('Unable to resolve book identity');
    }

    const normalizedTitle = normalizeText(merged.title);
    const normalizedAuthor = normalizeText(merged.author);

    /**
     * 4b️⃣ Supplement terrible API ratings with scraped Goodreads ratings if needed
     */
    if ((merged.externalRatingCount || 0) < 50) {
      this.logger.log(
        `🔹 External rating count is low (${merged.externalRatingCount}). Scraping Goodreads for realistic ratings...`,
      );
      const goodreadsRatings = await this.goodreads.getRatings(
        merged.title,
        merged.author,
      );
      if (
        goodreadsRatings &&
        goodreadsRatings.averageRating &&
        goodreadsRatings.ratingsCount
      ) {
        merged.externalAvgRating = goodreadsRatings.averageRating;
        merged.externalRatingCount = goodreadsRatings.ratingsCount;
        this.logger.log(
          `✅ Replaced external ratings with Goodreads: ${merged.externalAvgRating} (${merged.externalRatingCount})`,
        );
      }
    }

    /**
     * 5️⃣ Check existing book by normalized title + author (fallback check)
     */
    existingBook = await this.prisma.book.findFirst({
      where: { normalizedTitle, normalizedAuthor },
    });

    // If exact match fails, try fuzzy matching on title only
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
      this.logger.log(`✅ Found existing book by title/author: ${existingBook.id} (no AI call)`);
      // Update aliases if we discovered new IDs (e.g. from pasted Goodreads/Amazon URL)
      await this.updateAliasesIfNeeded(existingBook.id, merged, goodreadsId);
      const slip = await this.buildSlip(existingBook, false);
      return slip;
    }

    /**
     * 6️⃣ No existing record found - Do AI Enrichment for the first time
     */
    this.logger.log(
      `🔹 Book not in DB, performing AI enrichment (this will be cached)`,
    );

    let enriched: any;
    try {
      const enrichPayload: Record<string, unknown> = {
        title: merged.title,
        author: merged.author,
        description: merged.description,
      };
      // When user pasted an Amazon URL, pass ASIN + slug so AI returns the correct book (search may have returned a different one)
      if (inputType === InputType.AMAZON_URL && asin) {
        enrichPayload.amazonAsin = asin;
        enrichPayload.titleFromUrl = searchQuery;
      }
      enriched = await this.aiEnrichment.enrichBook(enrichPayload);
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
     * When we had an Amazon URL, prefer AI-returned title/author (they match the link; search may have been wrong)
     */
    const resolvedTitle = enriched.title ?? merged.title;
    const resolvedAuthor = enriched.author ?? merged.author;
    const resolvedNormalizedTitle = normalizeText(resolvedTitle);
    const resolvedNormalizedAuthor = normalizeText(resolvedAuthor);

    // If we had an Amazon URL and previously found a book by ASIN but rejected it (title mismatch),
    // that book still exists. Update it with corrected title/author instead of creating a duplicate.
    if (inputType === InputType.AMAZON_URL && asin) {
      const existingByAsin = await this.prisma.bookAlias.findUnique({
        where: {
          type_value: { type: BookAliasType.ASIN, value: asin },
        },
        include: { book: true },
      });
      if (existingByAsin) {
        this.logger.log(`🔹 Updating existing book ${existingByAsin.bookId} with corrected title/author from Amazon URL`);
        const amazonUrl = generateAmazonLink(
          resolvedTitle,
          resolvedAuthor || 'Unknown Author',
          asin,
          merged.isbn13,
        );
        const bookshopUrl = generateBookshopLink(resolvedTitle, resolvedAuthor || 'Unknown Author', merged.isbn13);
        await this.prisma.book.update({
          where: { id: existingByAsin.bookId },
          data: {
            title: resolvedTitle,
            normalizedTitle: resolvedNormalizedTitle,
            primaryAuthor: resolvedAuthor,
            normalizedAuthor: resolvedNormalizedAuthor,
            shortDescription: enriched.description || merged.description || undefined,
            ageLevel: (enriched.ageLevel as AgeLevel) || undefined,
            spiceRating: enriched.spiceRating ?? undefined,
            tropes: enriched.tropes ?? undefined,
            creatures: enriched.creatures ?? undefined,
            subgenres: enriched.subgenres ?? undefined,
            amazonUrl: amazonUrl ?? undefined,
            bookshopUrl: bookshopUrl ?? undefined,
            seriesName: enriched.series?.name ?? undefined,
            seriesIndex: enriched.series?.position ?? undefined,
            seriesTotal: enriched.series?.totalBooks ?? undefined,
            seriesStatus: (enriched.series?.status as SeriesStatus) ?? undefined,
            isMultiArc: enriched.series?.isMultiArc ?? undefined,
            arcName: enriched.series?.arc?.name ?? undefined,
            arcIndex: enriched.series?.arc?.arcNumber ?? undefined,
            arcTotal: enriched.series?.arc?.totalBooks ?? undefined,
            arcStatus: (enriched.series?.arc?.status as SeriesStatus) ?? undefined,
          },
        });
        const updatedBook = await this.prisma.book.findUniqueOrThrow({
          where: { id: existingByAsin.bookId },
        });
        const slip = await this.buildSlip(updatedBook, false, asin, merged.isbn13);
        return slip;
      }
    }

    const amazonUrl = generateAmazonLink(
      resolvedTitle,
      resolvedAuthor || 'Unknown Author',
      enriched.amazonAsin || asin || merged.asin,
      merged.isbn13,
    );
    const bookshopUrl = generateBookshopLink(
      resolvedTitle,
      resolvedAuthor || 'Unknown Author',
      merged.isbn13,
    );

    const book = await this.prisma.book.create({
      data: {
        // Basic info (use AI-corrected title/author when from Amazon URL)
        title: resolvedTitle,
        normalizedTitle: resolvedNormalizedTitle,
        primaryAuthor: resolvedAuthor,
        normalizedAuthor: resolvedNormalizedAuthor,
        shortDescription: enriched.description || merged.description || null,
        firstPublishedYear: merged.publishedYear ?? null,

        // External ratings
        externalAvgRating: merged.externalAvgRating ?? null,
        externalRatingCount: merged.externalRatingCount ?? null,

        // AI-enriched metadata
        ageLevel: (enriched.ageLevel as AgeLevel) || AgeLevel.UNKNOWN,
        spiceRating: enriched.spiceRating ?? null,
        tropes: enriched.tropes ?? [],
        creatures: enriched.creatures ?? [],
        subgenres: enriched.subgenres ?? [],

        // Purchase links
        amazonUrl: amazonUrl ?? null,
        bookshopUrl: bookshopUrl ?? null,

        // Series information - prefer AI enrichment, then external providers
        seriesName: enriched.series?.name ?? merged.seriesName ?? null,
        seriesIndex: enriched.series?.position ?? merged.seriesIndex ?? null,
        seriesTotal: enriched.series?.totalBooks ?? merged.seriesTotal ?? null,
        seriesStatus:
          (enriched.series?.status as SeriesStatus) ??
          (merged.seriesStatus as SeriesStatus) ??
          SeriesStatus.UNKNOWN,

        // Arc information
        isMultiArc: enriched.series?.isMultiArc ?? false,
        arcName: enriched.series?.arc?.name ?? null,
        arcIndex: enriched.series?.arc?.arcNumber ?? null,
        arcTotal: enriched.series?.arc?.totalBooks ?? null,
        arcStatus:
          (enriched.series?.arc?.status as SeriesStatus) ??
          SeriesStatus.UNKNOWN,
      },
    });

    this.logger.log(
      `✅ Book created and stored in DB: ${book.id} with all enriched data`,
    );

    /**
     * 8️⃣ Create aliases for external IDs (enable future lookups by any ID)
     */
    await this.createAliases(book.id, merged, asin, goodreadsId);

    const slip = await this.buildSlip(book, true, asin, merged.isbn13);
    return slip;
  }

  /**
   * Check if book exists by any external ID (ISBN, ASIN, Google Volume ID, Open Library ID, Goodreads ID)
   * This is the FIRST check - happens before API calls
   */
  private async checkBookByExternalIds(
    asin: string | undefined,
    googleVolumeId: string | undefined,
    openLibraryId: string | undefined,
    isbn13: string | undefined,
    goodreadsIdParam?: string,
  ): Promise<any | null> {
    // Priority 1: Check by ISBN-13 (most stable)
    if (isbn13) {
      const byIsbn = await this.prisma.bookAlias.findUnique({
        where: {
          type_value: {
            type: BookAliasType.ISBN_13,
            value: isbn13,
          },
        },
        include: { book: true },
      });

      if (byIsbn) {
        this.logger.log(`✅ Found book by ISBN-13: ${byIsbn.bookId}`);
        return byIsbn.book;
      }
    }

    // Priority 2: Check by ASIN
    if (asin) {
      const byAsin = await this.prisma.bookAlias.findUnique({
        where: {
          type_value: {
            type: BookAliasType.ASIN,
            value: asin,
          },
        },
        include: { book: true },
      });

      if (byAsin) {
        this.logger.log(`✅ Found book by ASIN: ${byAsin.bookId}`);
        return byAsin.book;
      }
    }

    // Priority 3: Check by Google Volume ID
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

    // Priority 4: Check by Open Library ID
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

    // Priority 5: Check by Goodreads book ID
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
        this.logger.log(`✅ Found book by Goodreads ID: ${byGoodreadsId.bookId}`);
        return byGoodreadsId.book;
      }
    }

    return null;
  }

  /**
   * Create aliases for all external IDs to enable future lookups
   */
  private async createAliases(
    bookId: string,
    merged: ExternalBookData,
    asin: string | undefined,
    goodreadsIdAlias?: string,
  ): Promise<void> {
    const aliases: {
      bookId: string;
      type: BookAliasType;
      value: string;
    }[] = [];

    if (merged.isbn13) {
      aliases.push({
        bookId,
        type: BookAliasType.ISBN_13,
        value: merged.isbn13,
      });
    }

    if (merged.googleVolumeId) {
      aliases.push({
        bookId,
        type: BookAliasType.GOOGLE_VOLUME_ID,
        value: merged.googleVolumeId,
      });
    }

    if (merged.openLibraryId) {
      aliases.push({
        bookId,
        type: BookAliasType.OPEN_LIBRARY_ID,
        value: merged.openLibraryId,
      });
    }

    if (asin) {
      aliases.push({
        bookId,
        type: BookAliasType.ASIN,
        value: asin,
      });
    }

    const grId = merged.goodreadsId ?? goodreadsIdAlias;
    if (grId) {
      aliases.push({
        bookId,
        type: BookAliasType.GOODREADS_ID,
        value: grId,
      });
    }

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

    const newAliases: {
      bookId: string;
      type: BookAliasType;
      value: string;
    }[] = [];

    if (
      merged.isbn13 &&
      !existingValues.has(`${BookAliasType.ISBN_13}:${merged.isbn13}`)
    ) {
      newAliases.push({
        bookId,
        type: BookAliasType.ISBN_13,
        value: merged.isbn13,
      });
    }

    if (
      merged.googleVolumeId &&
      !existingValues.has(
        `${BookAliasType.GOOGLE_VOLUME_ID}:${merged.googleVolumeId}`,
      )
    ) {
      newAliases.push({
        bookId,
        type: BookAliasType.GOOGLE_VOLUME_ID,
        value: merged.googleVolumeId,
      });
    }

    if (
      merged.openLibraryId &&
      !existingValues.has(
        `${BookAliasType.OPEN_LIBRARY_ID}:${merged.openLibraryId}`,
      )
    ) {
      newAliases.push({
        bookId,
        type: BookAliasType.OPEN_LIBRARY_ID,
        value: merged.openLibraryId,
      });
    }

    if (
      merged.asin &&
      !existingValues.has(`${BookAliasType.ASIN}:${merged.asin}`)
    ) {
      newAliases.push({
        bookId,
        type: BookAliasType.ASIN,
        value: merged.asin,
      });
    }

    const grId = merged.goodreadsId ?? goodreadsIdParam;
    if (
      grId &&
      !existingValues.has(`${BookAliasType.GOODREADS_ID}:${grId}`)
    ) {
      newAliases.push({
        bookId,
        type: BookAliasType.GOODREADS_ID,
        value: grId,
      });
    }

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

  public async buildSlip(
    book: any,
    created: boolean,
    asin?: string,
    isbn13?: string,
  ): Promise<BookSlipResponse> {
    // Fetch ISBN, ASIN, and Goodreads ID from aliases if not provided (for direct links)
    let finalAsin = asin;
    let finalIsbn13 = isbn13;
    let finalGoodreadsId: string | undefined;

    const aliases = await this.prisma.bookAlias.findMany({
      where: { bookId: book.id },
    });

    for (const alias of aliases) {
      if (alias.type === BookAliasType.ASIN && !finalAsin) {
        finalAsin = alias.value;
      }
      if (alias.type === BookAliasType.ISBN_13 && !finalIsbn13) {
        finalIsbn13 = alias.value;
      }
      if (alias.type === BookAliasType.GOODREADS_ID) {
        finalGoodreadsId = alias.value;
      }
    }

    // Generate links: direct to book when we have ASIN (Amazon), Goodreads ID or ISBN (Goodreads)
    const links = generateLinks(
      book.title,
      book.primaryAuthor || 'Unknown Author',
      finalAsin,
      finalIsbn13,
      book.amazonUrl,
      book.bookshopUrl,
      finalGoodreadsId,
    );

    // Calculate platform user ratings (Spicebound ratings)
    const platformRatings = await this.prisma.rating.aggregate({
      where: { bookId: book.id },
      _avg: { value: true },
      _count: true,
    });

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

    // Format series/standalone info for display using AI enrichment semantics:
    // 1. For a standard or multi-book series - "Series, Complete (1/11)"
    // 2. For a standalone (including connected-universe standalones) - "Standalone, Complete"
    // 3. For a multi-arc series - "Series, Incomplete (2/6)", "Arc 1, Complete (2/2)"
    let series: any;

    const isStandaloneBook =
      // Standalone per enrichment rules: totalBooks === 1 and position === 1 (or missing),
      // and not marked as multi-arc.
      book.seriesTotal === 1 &&
      (book.seriesIndex == null || book.seriesIndex === 1) &&
      !book.isMultiArc;

    if (isStandaloneBook) {
      // Treat as standalone even if seriesName is present (connected universe / standalone series)
      series = {
        name: 'Standalone',
        index: null,
        total: null,
        status: book.seriesStatus ?? SeriesStatus.COMPLETE,
      };
    } else if (book.seriesName) {
      // Any multi-book or ongoing series with a real series/universe name
      series = {
        name: 'Series',
        index: book.seriesIndex ?? null,
        total: book.seriesTotal ?? null,
        status: book.seriesStatus,
      };
    } else {
      // No series metadata at all – default to standalone
      series = {
        name: 'Standalone',
        index: null,
        total: null,
        status: SeriesStatus.COMPLETE,
      };
    }

    let arc: any;
    // Multi-arc display rule: "Arc 1, Complete (2/2)"
    if (book.isMultiArc && (book.arcName || book.arcIndex)) {
      arc = {
        name: book.arcIndex ? `Arc ${book.arcIndex}` : 'Arc',
        index: book.arcIndex ?? null,
        total: book.arcTotal ?? null,
        status: book.arcStatus as SeriesStatus,
      };
    }

    // Special verification for "The Serpent and the Wings of Night"
    // If it's a known multi-arc world like Crowns of Nyaxia but AI missed it,
    // we could add hardcoded logic, but for now we rely on the prompt which
    // explicitly mentions this book as an example.

    return {
      bookId: book.id,
      title: book.title,
      author: book.primaryAuthor,
      description: book.shortDescription ?? undefined,

      releaseYear: book.firstPublishedYear ?? undefined,

      // Format age level for display (Title Case)
      ageLevel: formatAgeLevel(book.ageLevel),
      spiceRating: book.spiceRating ?? 0,

      tropes: (book.tropes ?? []).map(toTitleCase),
      creatures: (book.creatures ?? []).map(toTitleCase),
      subgenres: (book.subgenres ?? []).map(toTitleCase),

      series,
      isMultiArc: !!book.isMultiArc,
      arc,

      ratings: ratingsInfo,

      links,

      created,

      // Default confidence levels for AI-enriched data
      // We assume HIGH confidence since this data came from our enrichment LLM
      confidence: {
        spiceRating: 'HIGH',
        ageLevel: 'HIGH',
        tropes: 'HIGH',
        creatures: 'HIGH',
        subgenres: 'HIGH',
        series: 'HIGH',
        overall: 'HIGH',
      },
    };
  }
}
