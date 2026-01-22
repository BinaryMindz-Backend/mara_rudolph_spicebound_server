import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

import { GoogleBooksProvider } from './providers/google-books.provider.js';
import { OpenLibraryProvider } from './providers/open-library.provider.js';
import { AiEnrichmentService } from './ai/ai-enrichment.service.js';

import { BookSlipResponse } from './dto/book-slip.response.js';
import { detectInputType } from './utils/input-detector.js';
import { extractAsin } from './utils/url-normalizer.js';
import { mergeExternalData } from './utils/merge-book-data.js';

import {
  ExternalBookData,
  InputType,
} from './types/book-source.types.js';
import { BookAliasType, AgeLevel } from '../../../prisma/generated/prisma-client/enums.js';

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
      return this.buildSlip(existingBook, false);
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

    return this.buildSlip(book, true);
  }


  private buildSlip(book: any, created: boolean): BookSlipResponse {
    return {
      bookId: book.id,
      title: book.title,
      author: book.primaryAuthor,
      description: book.shortDescription,

      ageLevel: book.ageLevel,
      spiceRating: book.spiceRating,

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

      externalRatings: {
        average: book.externalAvgRating,
        count: book.externalRatingCount,
      },

      links: {
        amazon: book.amazonUrl,
        bookshop: book.bookshopUrl,
      },

      created,
    };
  }
}
