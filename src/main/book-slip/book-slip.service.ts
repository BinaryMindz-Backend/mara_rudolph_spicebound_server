import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

import { GoogleBooksProvider } from './providers/google-books.provider.js';
import { OpenLibraryProvider } from './providers/open-library.provider.js';
import { AiEnrichmentService } from './ai/ai-enrichment.service.js';

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
import { generateLinks } from './utils/link-generator.js';

import { ExternalBookData, InputType } from './types/book-source.types.js';
import {
  BookAliasType,
  AgeLevel,
  SeriesStatus,
} from '../../../prisma/generated/prisma-client/enums.js';

/**
 * Normalize strings for canonical matching
 */
function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Format age level for display (Title Case, spell out NA)
 */
function formatAgeLevel(level?: string): string | undefined {
  if (!level) return undefined;

  const ageMap: Record<string, string> = {
    CHILDREN: "Children's",
    YA: 'Young Adult',
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
    private readonly aiEnrichment: AiEnrichmentService,
  ) {}

  async discoverBook(input: string): Promise<BookSlipResponse> {
    this.logger.log(`🔹 discoverBook called with input: ${input}`);

    const inputType = detectInputType(input);
    this.logger.log(`🔹 Detected input type: ${inputType}`);

    let googleData: ExternalBookData | undefined;
    let openLibraryData: ExternalBookData | undefined;
    let asin: string | undefined;
    let isbn13: string | undefined;
    let googleVolumeId: string | undefined;
    let openLibraryId: string | undefined;
    let searchQuery = input;

    /**
     * 1️⃣ Extract all possible external IDs from input
     */
    if (inputType === InputType.AMAZON_URL) {
      asin = extractAsin(input) ?? undefined;
      this.logger.log(`🔹 Extracted ASIN from Amazon URL: ${asin}`);
      // If we have ASIN but no explicit search query, try to extract from URL
      if (!asin) {
        const url = new URL(input);
        searchQuery = url.searchParams.get('k') || input;
      }
    } else if (inputType === InputType.GOODREADS_URL) {
      // For Goodreads, extract search query
      const match = input.match(/goodreads\.com\/book\/show\/\d+(?:\.([^?]*?))?/);
      if (match && match[1]) {
        searchQuery = decodeURIComponent(match[1].replace(/-/g, ' '));
        this.logger.log(`🔹 Extracted search query from Goodreads: ${searchQuery}`);
      }
    } else if (inputType === InputType.GOOGLE_BOOKS_URL) {
      googleVolumeId = extractGoogleBooksVolumeId(input) ?? undefined;
      this.logger.log(`🔹 Extracted Google Volume ID from URL: ${googleVolumeId}`);
    } else if (inputType === InputType.OPEN_LIBRARY_URL) {
      openLibraryId = extractOpenLibraryId(input) ?? undefined;
      this.logger.log(`🔹 Extracted Open Library ID from URL: ${openLibraryId}`);
    }

    /**
     * 2️⃣ Check DB for existing book using extracted IDs (before any API calls!)
     */
    let existingBook = await this.checkBookByExternalIds(asin, googleVolumeId, openLibraryId, isbn13);
    
    if (existingBook) {
      this.logger.log(
        `✅ Found existing book by external ID: ${existingBook.id} (no API calls needed)`,
      );
      const slip = await this.buildSlip(existingBook, false);
      return slip;
    }

    this.logger.log(`🔹 No book found by external IDs, proceeding with API calls`);

    /**
     * 3️⃣ Fetch external metadata from APIs
     */
    if (googleVolumeId) {
      googleData = await this.googleBooks.fetchByVolumeId(googleVolumeId);
      this.logger.log('🔹 GoogleBooksProvider.fetchByVolumeId:', googleData);
    } else if (openLibraryId) {
      openLibraryData = (await this.openLibrary.fetchById(openLibraryId)) ?? undefined;
      this.logger.log('🔹 OpenLibraryProvider.fetchById:', openLibraryData);
    } else {
      // Parallelize API calls for better performance
      const [googleResult, openLibraryResult] = await Promise.all([
        this.googleBooks.search(searchQuery).catch(() => undefined),
        this.openLibrary.search(searchQuery).catch(() => undefined),
      ]);

      googleData = googleResult || undefined;
      openLibraryData = openLibraryResult || undefined;

      this.logger.log('🔹 GoogleBooksProvider.search:', googleData);
      this.logger.log('🔹 OpenLibraryProvider.search:', openLibraryData);
    }

    /**
     * 4️⃣ Merge sources
     */
    const merged = mergeExternalData(googleData, openLibraryData);
    this.logger.log('🔹 Merged data:', merged);

    if (!merged.title || !merged.author) {
      this.logger.error('❌ Missing title or author', merged);
      throw new Error('Unable to resolve book identity');
    }

    const normalizedTitle = normalizeText(merged.title);
    const normalizedAuthor = normalizeText(merged.author);

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
      // Update aliases if we discovered new IDs
      await this.updateAliasesIfNeeded(existingBook.id, merged);
      const slip = await this.buildSlip(existingBook, false);
      return slip;
    }

    /**
     * 6️⃣ No existing record found - Do AI Enrichment for the first time
     */
    this.logger.log(`🔹 Book not in DB, performing AI enrichment (this will be cached)`);
    
    const enriched = await this.aiEnrichment.enrichBook({
      title: merged.title,
      author: merged.author,
      description: merged.description,
    });

    this.logger.log('🔹 AI Enrichment result:', enriched);

    /**
     * 7️⃣ Create Book with ALL enriched data in single transaction
     */
    const amazonUrl = asin
      ? `https://www.amazon.com/dp/${asin}`
      : merged.isbn13
        ? `https://www.amazon.com/s?k=${merged.isbn13}`
        : null;
    const bookshopUrl = merged.isbn13
      ? `https://bookshop.org/search?q=${merged.isbn13}`
      : null;

    const book = await this.prisma.book.create({
      data: {
        // Basic info
        title: merged.title,
        normalizedTitle,
        primaryAuthor: merged.author,
        normalizedAuthor,
        shortDescription: merged.description ?? null,
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
        seriesIndex:
          (enriched.series && 'index' in enriched.series
            ? (enriched.series.index as number)
            : undefined) ??
          merged.seriesIndex ??
          null,
        seriesTotal:
          (enriched.series && 'total' in enriched.series
            ? (enriched.series.total as number)
            : undefined) ??
          merged.seriesTotal ??
          null,
        seriesStatus:
          (enriched.series?.status as SeriesStatus) ??
          (merged.seriesStatus as SeriesStatus) ??
          SeriesStatus.UNKNOWN,
      },
    });

    this.logger.log(
      `✅ Book created and stored in DB: ${book.id} with all enriched data`,
    );

    /**
     * 8️⃣ Create aliases for external IDs (enable future lookups by any ID)
     */
    await this.createAliases(book.id, merged, asin);

    const slip = await this.buildSlip(book, true, asin, merged.isbn13);
    return slip;
  }

  /**
   * Check if book exists by any external ID (ISBN, Google Volume ID, Open Library ID, ASIN)
   * This is the FIRST check - happens before API calls
   */
  private async checkBookByExternalIds(
    asin: string | undefined,
    googleVolumeId: string | undefined,
    openLibraryId: string | undefined,
    isbn13: string | undefined,
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
        this.logger.log(`✅ Found book by Google Volume ID: ${byGoogleId.bookId}`);
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
        this.logger.log(`✅ Found book by Open Library ID: ${byOpenLibId.bookId}`);
        return byOpenLibId.book;
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

    if (aliases.length > 0) {
      await this.prisma.bookAlias.createMany({
        data: aliases,
        skipDuplicates: true,
      });

      this.logger.log(`🔹 Created ${aliases.length} aliases for book ${bookId}`);
    }
  }

  /**
   * Update aliases if we found new external IDs for an existing book
   */
  private async updateAliasesIfNeeded(
    bookId: string,
    merged: ExternalBookData,
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
      !existingValues.has(`${BookAliasType.OPEN_LIBRARY_ID}:${merged.openLibraryId}`)
    ) {
      newAliases.push({
        bookId,
        type: BookAliasType.OPEN_LIBRARY_ID,
        value: merged.openLibraryId,
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

  private async buildSlip(
    book: any,
    created: boolean,
    asin?: string,
    isbn13?: string,
  ): Promise<BookSlipResponse> {
    // Fetch ISBN and ASIN from aliases if not provided
    let finalAsin = asin;
    let finalIsbn13 = isbn13;

    if (!finalAsin || !finalIsbn13) {
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
      }
    }

    // Generate links
    const links = generateLinks(
      finalAsin,
      finalIsbn13,
      book.amazonUrl,
      book.bookshopUrl,
    );

    // Calculate platform user ratings (Spicebound ratings)
    // Only display if we have at least 10 ratings to be statistically meaningful
    const platformRatings = await this.prisma.rating.aggregate({
      where: { bookId: book.id },
      _avg: { value: true },
      _count: true,
    });

    let ratings: { average?: number; count?: number } | undefined;
    if (platformRatings._count >= 10) {
      ratings = {
        average: platformRatings._avg.value ?? undefined,
        count: platformRatings._count,
      };
    }

    // Format series info with user-friendly display
    let series:
      | {
          name: string;
          index: number | null;
          total: number | null;
          status: any;
        }
      | undefined;

    if (book.seriesName) {
      series = {
        name: book.seriesName,
        index: book.seriesIndex ?? null,
        total: book.seriesTotal ?? null,
        status: book.seriesStatus,
      };
    }

    return {
      bookId: book.id,
      title: book.title,
      author: book.primaryAuthor,
      description: book.shortDescription ?? undefined,

      releaseYear: book.firstPublishedYear ?? undefined,

      // Format age level for display (Title Case)
      ageLevel: formatAgeLevel(book.ageLevel),
      spiceRating: book.spiceRating ?? 0,

      tropes: book.tropes ?? [],
      creatures: book.creatures ?? [],
      subgenres: book.subgenres ?? [],

      series,

      ratings,

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
