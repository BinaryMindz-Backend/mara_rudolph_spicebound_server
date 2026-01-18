import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

import { GoogleBooksProvider } from './providers/google-books.provider.js';
import { OpenLibraryProvider } from './providers/open-library.provider.js';

import { BookSlipResponse } from './dto/book-slip.response.js';
import { detectInputType } from './utils/input-detector.js';
import { extractAsin } from './utils/url-normalizer.js';
import { mergeExternalData } from './utils/merge-book-data.js';

import {
  ExternalBookData,
  InputType,
} from './types/book-source.types.js';

/**
 * Very small helper – keep local for now
 * (later can move to shared utils)
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleBooks: GoogleBooksProvider,
    private readonly openLibrary: OpenLibraryProvider,
  ) { }

  async discoverBook(input: string): Promise<BookSlipResponse> {
    const inputType = detectInputType(input);

    let googleData: ExternalBookData | undefined;
    let openLibraryData: ExternalBookData | undefined;
    let asin: string | undefined;

    /**
     * 1️⃣ Extract ASIN if Amazon URL
     */
    if (inputType === InputType.AMAZON_URL) {
      asin = extractAsin(input) ?? undefined;
    }

    /**
     * 2️⃣ Fetch external metadata
     */
    if (inputType === InputType.GOOGLE_BOOKS_URL) {
      googleData =
        (await this.googleBooks.fetchByVolumeId(input)) ?? undefined;
    } else if (inputType === InputType.OPEN_LIBRARY_URL) {
      openLibraryData =
        (await this.openLibrary.fetchById(input)) ?? undefined;
    } else {
      googleData =
        (await this.googleBooks.search(input)) ?? undefined;

      openLibraryData =
        (await this.openLibrary.search(input)) ?? undefined;
    }

    /**
     * 3️⃣ Merge external sources
     */
    const merged = mergeExternalData(googleData, openLibraryData);

    if (!merged.title || !merged.author) {
      throw new Error('Unable to resolve book identity');
    }

    const normalizedTitle = normalizeText(merged.title);
    const normalizedAuthor = normalizeText(merged.author);

    /**
     * 4️⃣ Try reuse existing canonical book
     * (Correct approach for your schema)
     */
    const existingBook = await this.prisma.book.findFirst({
      where: {
        normalizedTitle,
        normalizedAuthor,
      },
    });

    if (existingBook) {
      return this.buildSlip(existingBook, false);
    }

    /**
     * 5️⃣ TODO: AI enrichment step
     * (ageLevel, spiceRating, tropes, etc.)
     */

    /**
     * 6️⃣ Create canonical Book
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
      },
    });


    /**
     * 7️⃣ Alias creation (safe + optional)
     * This matches your schema design philosophy
     */
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
    }

    return this.buildSlip(book, true);
  }

  /**
   * Response mapper
   * (ONLY expose fields that exist in schema)
   */
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
