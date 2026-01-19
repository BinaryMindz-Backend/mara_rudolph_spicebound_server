import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

import { GoogleBooksProvider } from './providers/google-books.provider.js';
import { OpenLibraryProvider } from './providers/open-library.provider.js';

import { BookSlipResponse } from './dto/book-slip.response.js';
import { detectInputType } from './utils/input-detector.js';
import { extractAsin } from './utils/url-normalizer.js';
import { mergeExternalData } from './utils/merge-book-data.js';

import { ExternalBookData, InputType } from './types/book-source.types.js';

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
  ) {}

  async discoverBook(input: string): Promise<BookSlipResponse> {
    this.logger.log(`🔹 discoverBook called with input: ${input}`);
    const inputType = detectInputType(input);
    this.logger.log(`🔹 Detected input type: ${inputType}`);

    let googleData: ExternalBookData | undefined;
    let openLibraryData: ExternalBookData | null | undefined;
    let asin: string | undefined;

    // 1️⃣ Extract ASIN if Amazon URL
    if (inputType === InputType.AMAZON_URL) {
      asin = extractAsin(input) ?? undefined;
      this.logger.log(`🔹 Extracted ASIN: ${asin}`);
    }

    // 2️⃣ Fetch external metadata
    if (inputType === InputType.GOOGLE_BOOKS_URL) {
      googleData = await this.googleBooks.fetchByVolumeId(input);
      this.logger.log('🔹 GoogleBooksProvider.fetchByVolumeId output:', googleData);
    } else if (inputType === InputType.OPEN_LIBRARY_URL) {
      openLibraryData = await this.openLibrary.fetchById(input);
      this.logger.log('🔹 OpenLibraryProvider.fetchById output:', openLibraryData);
    } else {
      googleData = await this.googleBooks.search(input);
      this.logger.log('🔹 GoogleBooksProvider.search output:', googleData);

      openLibraryData = await this.openLibrary.search(input);
      this.logger.log('🔹 OpenLibraryProvider.search output:', openLibraryData);
    }

    // 3️⃣ Merge external sources
    const merged = mergeExternalData(googleData,);
    this.logger.log('🔹 Merged external book data:', merged);

    if (!merged.title || !merged.author) {
      this.logger.error('⚠️ Merged data missing title or author:', merged);
      throw new Error('Unable to resolve book identity');
    }

    const normalizedTitle = normalizeText(merged.title);
    const normalizedAuthor = normalizeText(merged.author);

    // 4️⃣ Check if canonical book already exists
    const existingBook = await this.prisma.book.findFirst({
      where: {
        normalizedTitle,
        normalizedAuthor,
      },
    });
    if (existingBook) {
      this.logger.log('🔹 Found existing book in DB:', existingBook.id);
      return this.buildSlip(existingBook, false);
    }

    // 5️⃣ TODO: AI enrichment (ageLevel, spiceRating, tropes, creatures, subgenres)

    // 6️⃣ Create canonical Book
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
      },
    });
    this.logger.log('🔹 Created new book with ID:', book.id);

    // 7️⃣ Create aliases if available
    const aliases = [
      merged.isbn13 && {
        bookId: book.id,
        type: 'ISBN_13',
        value: merged.isbn13,
      },
      merged.googleVolumeId && {
        bookId: book.id,
        type: 'GOOGLE_VOLUME',
        value: merged.googleVolumeId,
      },
      merged.openLibraryId && {
        bookId: book.id,
        type: 'OPEN_LIBRARY',
        value: merged.openLibraryId,
      },
      asin && {
        bookId: book.id,
        type: 'AMAZON_ASIN',
        value: asin,
      },
    ].filter(Boolean);

    if (aliases.length > 0) {
      await this.prisma.bookAlias.createMany({
        data: aliases as any,
        skipDuplicates: true,
      });
      this.logger.log('🔹 Created aliases:', aliases);
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
