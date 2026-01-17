import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { detectInputType } from './utils/input-detector';
import { extractAsin } from './utils/url-normalizer';
import { mergeExternalData } from './utils/merge-book-data';
import { GoogleBooksProvider } from './providers/google-books.provider';
import { OpenLibraryProvider } from './providers/open-library.provider';
import { InputType } from './types/book-source.types';
import { BookSlipResponse } from './dto/book-slip.response';

const prisma = new PrismaClient();

@Injectable()
export class BookSlipService {
  constructor(
    private readonly googleBooks: GoogleBooksProvider,
    private readonly openLibrary: OpenLibraryProvider,
  ) {}

  async discoverBook(input: string): Promise<BookSlipResponse> {
    const inputType = detectInputType(input);

    let googleData = null;
    let openLibraryData = null;
    let asin: string | null = null;

    if (inputType === InputType.AMAZON_URL) {
      asin = extractAsin(input);
    }

    if (inputType === InputType.GOOGLE_BOOKS_URL) {
      googleData = await this.googleBooks.fetchByVolumeId(input);
    } else if (inputType === InputType.OPEN_LIBRARY_URL) {
      openLibraryData = await this.openLibrary.fetchById(input);
    } else {
      googleData = await this.googleBooks.search(input);
      openLibraryData = await this.openLibrary.search(input);
    }

    const merged = mergeExternalData(googleData, openLibraryData);

    const existingBook = await prisma.book.findFirst({
      where: {
        OR: [
          { isbn13: merged.isbn13 },
          { googleVolumeId: merged.googleVolumeId },
          { openLibraryId: merged.openLibraryId },
          { asin },
        ],
      },
    });

    if (existingBook) {
      return this.buildSlip(existingBook, false);
    }

    // TODO: AI enrichment call here

    const book = await prisma.book.create({
      data: {
        title: merged.title!,
        author: merged.author!,
        description: merged.description,
        firstPublishedYear: merged.publishedYear,

        isbn13: merged.isbn13,
        googleVolumeId: merged.googleVolumeId,
        openLibraryId: merged.openLibraryId,
        asin,

        externalAvgRating: merged.externalAvgRating,
        externalRatingCount: merged.externalRatingCount,
      },
    });

    return this.buildSlip(book, true);
  }

  private buildSlip(book: any, created: boolean): BookSlipResponse {
    return {
      bookId: book.id,
      title: book.title,
      author: book.author,
      description: book.description,

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
