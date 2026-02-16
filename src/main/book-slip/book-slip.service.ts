import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

import { GoogleBooksProvider } from './providers/google-books.provider.js';
import { OpenLibraryProvider } from './providers/open-library.provider.js';
import { AiEnrichmentService } from './ai/ai-enrichment.service.js';

import { BookSlipResponse } from './dto/book-slip.response.js';
import { detectInputType } from './utils/input-detector.js';
import { extractAsin } from './utils/url-normalizer.js';
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

    /**
     * 1️⃣ Extract ASIN if Amazon URL
     */
    if (inputType === InputType.AMAZON_URL) {
      asin = extractAsin(input) ?? undefined;
      this.logger.log(`🔹 Extracted ASIN: ${asin}`);
    }

    /**
     * 2️⃣ Fetch external metadata
     */
    if (inputType === InputType.GOOGLE_BOOKS_URL) {
      googleData = await this.googleBooks.fetchByVolumeId(input);
      this.logger.log('🔹 GoogleBooksProvider.fetchByVolumeId:', googleData);
    } else if (inputType === InputType.OPEN_LIBRARY_URL) {
      openLibraryData = (await this.openLibrary.fetchById(input)) ?? undefined;
      this.logger.log('🔹 OpenLibraryProvider.fetchById:', openLibraryData);
    } else {
      googleData = await this.googleBooks.search(input);
      this.logger.log('🔹 GoogleBooksProvider.search:', googleData);

      openLibraryData = (await this.openLibrary.search(input)) ?? undefined;
      this.logger.log('🔹 OpenLibraryProvider.search:', openLibraryData);
    }

    /**
     * 3️⃣ Merge sources
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
     * 4️⃣ Check existing book
     */
    const existingBook = await this.prisma.book.findFirst({
      where: { normalizedTitle, normalizedAuthor },
    });

    if (existingBook) {
      this.logger.log(`🔹 Found existing book: ${existingBook.id}`);
      const slip = await this.buildSlip(existingBook, false);
      return slip;
    }

    /**
     * 5️⃣ AI Enrichment
     */
    const enriched = await this.aiEnrichment.enrichBook({
      title: merged.title,
      author: merged.author,
      description: merged.description,
    });

    this.logger.log('🔹 AI Enrichment result:', enriched);

    /**
     * 6️⃣ Create Book
     */
    // Generate links first to save them to the book record
    const amazonUrl = asin
      ? `https://amazon.com/dp/${asin}`
      : merged.isbn13
        ? `https://amazon.com/s?k=${merged.isbn13}`
        : null;
    const bookshopUrl = merged.isbn13
      ? `https://bookshop.org/search?q=${merged.isbn13}`
      : null;

    const book = await this.prisma.book.create({
      data: {
        title: merged.title,
        normalizedTitle,
        primaryAuthor: merged.author,
        normalizedAuthor,
        shortDescription: merged.description ?? null,
        firstPublishedYear: merged.publishedYear ?? null,
        externalAvgRating: merged.externalAvgRating ?? null,
        externalRatingCount: merged.externalRatingCount ?? null,
        ageLevel: (enriched.ageLevel as AgeLevel) || AgeLevel.UNKNOWN,
        spiceRating: enriched.spiceRating ?? null,
        tropes: enriched.tropes ?? [],
        creatures: enriched.creatures ?? [],
        subgenres: enriched.subgenres ?? [],
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

    this.logger.log(`✅ Book created: ${book.id}`);

    /**
     * 7️⃣ Create aliases (TYPE SAFE)
     */
    const aliases: {
      bookId: string;
      type: BookAliasType;
      value: string;
    }[] = [];

    if (merged.isbn13) {
      aliases.push({
        bookId: book.id,
        type: BookAliasType.ISBN_13,
        value: merged.isbn13,
      });
    }

    if (merged.googleVolumeId) {
      aliases.push({
        bookId: book.id,
        type: BookAliasType.GOOGLE_VOLUME_ID,
        value: merged.googleVolumeId,
      });
    }

    if (merged.openLibraryId) {
      aliases.push({
        bookId: book.id,
        type: BookAliasType.OPEN_LIBRARY_ID,
        value: merged.openLibraryId,
      });
    }

    if (asin) {
      aliases.push({
        bookId: book.id,
        type: BookAliasType.ASIN,
        value: asin,
      });
    }

    if (aliases.length > 0) {
      await this.prisma.bookAlias.createMany({
        data: aliases,
        skipDuplicates: true,
      });

      this.logger.log('🔹 Aliases created:', aliases);
    }

    const slip = await this.buildSlip(book, true, asin, merged.isbn13);
    return slip;
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
    const platformRatings = await this.prisma.rating.aggregate({
      where: { bookId: book.id },
      _avg: { value: true },
      _count: true,
    });

    const ratings = {
      average: platformRatings._avg.value ?? undefined,
      count: platformRatings._count > 0 ? platformRatings._count : undefined,
    };

    return {
      bookId: book.id,
      title: book.title,
      author: book.primaryAuthor,
      description: book.shortDescription,

      releaseYear: book.firstPublishedYear ?? undefined,

      ageLevel: book.ageLevel,
      spiceRating: book.spiceRating ?? 0,

      tropes: book.tropes ?? [],
      creatures: book.creatures ?? [],
      subgenres: book.subgenres ?? [],

      series: book.seriesName
        ? {
            name: book.seriesName,
            index: book.seriesIndex,
            total: book.seriesTotal,
            status: book.seriesStatus,
          }
        : undefined,

      ratings: ratings.count || ratings.average ? ratings : undefined,

      links,

      created,
    };
  }
}
