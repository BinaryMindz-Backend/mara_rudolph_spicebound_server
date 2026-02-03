import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateRatingDto } from './dto/create-rating.dto.js';

@Injectable()
export class RatingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create or update user rating for a book
   */
  async rateBook(
    userId: string,
    bookId: string,
    dto: CreateRatingDto,
  ): Promise<any> {
    // Validate book exists
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    // Validate rating value
    if (dto.value < 0 || dto.value > 5) {
      throw new BadRequestException('Rating must be between 0 and 5');
    }

    // Support half-stars (0.5 increments)
    if (dto.value * 2 !== Math.floor(dto.value * 2)) {
      throw new BadRequestException('Rating must be in 0.5 increments');
    }

    // Upsert rating
    const rating = await this.prisma.rating.upsert({
      where: {
        userId_bookId: {
          userId,
          bookId,
        },
      },
      update: {
        value: dto.value,
      },
      create: {
        userId,
        bookId,
        value: dto.value,
      },
    });

    // Update book's aggregated Spicebound rating
    await this.recalculateBookRatings(bookId);

    return rating;
  }

  /**
   * Remove user rating
   */
  async removeRating(userId: string, bookId: string): Promise<void> {
    await this.prisma.rating.deleteMany({
      where: {
        userId,
        bookId,
      },
    });

    // Recalculate aggregates
    await this.recalculateBookRatings(bookId);
  }

  /**
   * Get user's rating for a book
   */
  async getUserRating(userId: string, bookId: string): Promise<any | null> {
    return this.prisma.rating.findUnique({
      where: {
        userId_bookId: {
          userId,
          bookId,
        },
      },
    });
  }

  /**
   * Get book's average rating
   */
  async getBookRatings(
    bookId: string,
  ): Promise<{ average: number | null; count: number }> {
    const ratings = await this.prisma.rating.findMany({
      where: { bookId },
    });

    const average =
      ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r.value, 0) / ratings.length
        : null;

    return {
      average,
      count: ratings.length,
    };
  }

  /**
   * Recalculate aggregated ratings for a book
   */
  private async recalculateBookRatings(bookId: string): Promise<void> {
    // Ratings are now calculated dynamically from the Rating table
    // No need to store aggregates in Book table
    return;
  }
}
