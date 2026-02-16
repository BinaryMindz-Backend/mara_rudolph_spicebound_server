import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  getBookLimitForPlan,
  canAddBook,
} from '../../common/utils/subscription-utils.js';
import { AddBookToLibraryDto } from './dto/add-book-to-library.dto.js';
import { UpdateBookStatusDto } from './dto/update-book-status.dto.js';
import { ReorderBooksDto } from './dto/reorder-books.dto.js';
import { ReadingStatus } from '../../../prisma/generated/prisma-client/enums.js';
import { BookAliasType } from '../../../prisma/generated/prisma-client/enums.js';

@Injectable()
export class UserLibraryService {
  constructor(private prisma: PrismaService) {}

  /**
   * Add book to user's library
   * Respects free-tier limits
   */
  async addBookToLibrary(
    userId: string,
    dto: AddBookToLibraryDto,
  ): Promise<any> {
    // Get user with current book count
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        library: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check book exists
    const book = await this.prisma.book.findUnique({
      where: { id: dto.bookId },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    // Check if already in library
    const exists = await this.prisma.userBook.findUnique({
      where: {
        userId_bookId: {
          userId,
          bookId: dto.bookId,
        },
      },
    });

    if (exists) {
      throw new BadRequestException('Book already in library');
    }

    // Check limit
    if (!canAddBook(user.library.length, user.plan)) {
      const limit = getBookLimitForPlan(user.plan);
      throw new ForbiddenException(
        `Free tier limited to ${limit} books. Upgrade to add more.`,
      );
    }

    // Add to library
    const userBook = await this.prisma.userBook.create({
      data: {
        userId,
        bookId: dto.bookId,
        status: (dto.status as ReadingStatus) || ReadingStatus.TBR,
        orderIndex: user.library.length,
      },
      include: {
        book: true,
      },
    });

    // If book doesn't have purchase links, generate them from aliases
    if (!userBook.book.amazonUrl || !userBook.book.bookshopUrl) {
      const aliases = await this.prisma.bookAlias.findMany({
        where: { bookId: userBook.book.id },
      });

      let asin: string | undefined;
      let isbn13: string | undefined;

      for (const alias of aliases) {
        if (alias.type === BookAliasType.ASIN) asin = alias.value;
        if (alias.type === BookAliasType.ISBN_13) isbn13 = alias.value;
      }

      const amazonUrl =
        userBook.book.amazonUrl ||
        (asin
          ? `https://amazon.com/dp/${asin}`
          : isbn13
            ? `https://amazon.com/s?k=${isbn13}`
            : null);
      const bookshopUrl =
        userBook.book.bookshopUrl ||
        (isbn13 ? `https://bookshop.org/search?q=${isbn13}` : null);

      // Update book with generated links if they were null
      if (
        (!userBook.book.amazonUrl && amazonUrl) ||
        (!userBook.book.bookshopUrl && bookshopUrl)
      ) {
        await this.prisma.book.update({
          where: { id: userBook.book.id },
          data: {
            ...(amazonUrl && !userBook.book.amazonUrl && { amazonUrl }),
            ...(bookshopUrl && !userBook.book.bookshopUrl && { bookshopUrl }),
          },
        });

        // Refresh the book data
        userBook.book.amazonUrl = amazonUrl || userBook.book.amazonUrl;
        userBook.book.bookshopUrl = bookshopUrl || userBook.book.bookshopUrl;
      }
    }

    return userBook;
  }

  /**
   * Remove book from user's library
   */
  async removeBookFromLibrary(userId: string, bookId: string): Promise<void> {
    const userBook = await this.prisma.userBook.findUnique({
      where: {
        userId_bookId: {
          userId,
          bookId,
        },
      },
    });

    if (!userBook) {
      throw new NotFoundException('Book not in your library');
    }

    await this.prisma.userBook.delete({
      where: {
        userId_bookId: {
          userId,
          bookId,
        },
      },
    });

    // Reorder remaining books
    await this.reorderAfterRemoval(userId, userBook.orderIndex);
  }

  /**
   * Get user's library with optional filtering
   */
  async getUserLibrary(userId: string, status?: string): Promise<any[]> {
    const books = await this.prisma.userBook.findMany({
      where: {
        userId,
        ...(status && { status: status as ReadingStatus }),
      },
      include: {
        book: true,
        user: {
          select: {
            id: true,
            plan: true,
          },
        },
      },
      orderBy: {
        orderIndex: 'asc',
      },
    });

    // Prioritize READING status
    return books.sort((a, b) => {
      if (a.status === 'READING' && b.status !== 'READING') return -1;
      if (a.status !== 'READING' && b.status === 'READING') return 1;
      return a.orderIndex - b.orderIndex;
    });
  }

  /**
   * Update book reading status
   */
  async updateBookStatus(
    userId: string,
    bookId: string,
    dto: UpdateBookStatusDto,
  ): Promise<any> {
    const userBook = await this.prisma.userBook.findUnique({
      where: {
        userId_bookId: {
          userId,
          bookId,
        },
      },
    });

    if (!userBook) {
      throw new NotFoundException('Book not in your library');
    }

    const updated = await this.prisma.userBook.update({
      where: {
        userId_bookId: {
          userId,
          bookId,
        },
      },
      data: {
        status: dto.status as ReadingStatus,
      },
      include: {
        book: true,
      },
    });

    return updated;
  }

  /**
   * Reorder books (for drag & drop)
   */
  async reorderBooks(userId: string, dto: ReorderBooksDto): Promise<any[]> {
    // Validate all books belong to user
    const userBooks = await this.prisma.userBook.findMany({
      where: {
        userId,
        bookId: { in: dto.bookIds },
      },
    });

    if (userBooks.length !== dto.bookIds.length) {
      throw new BadRequestException('Some books do not belong to your library');
    }

    // Update order indices
    const updatePromises = dto.bookIds.map((bookId, index) =>
      this.prisma.userBook.update({
        where: {
          userId_bookId: {
            userId,
            bookId,
          },
        },
        data: {
          orderIndex: index,
        },
      }),
    );

    await Promise.all(updatePromises);

    // Return reordered books
    return this.getUserLibrary(userId);
  }

  /**
   * Get user's library count
   */
  async getLibraryCount(userId: string): Promise<number> {
    return this.prisma.userBook.count({
      where: { userId },
    });
  }

  /**
   * Internal: Reorder after book removal
   */
  private async reorderAfterRemoval(
    userId: string,
    removedIndex: number,
  ): Promise<void> {
    const booksAfter = await this.prisma.userBook.findMany({
      where: {
        userId,
        orderIndex: { gt: removedIndex },
      },
    });

    for (const book of booksAfter) {
      await this.prisma.userBook.update({
        where: { id: book.id },
        data: { orderIndex: book.orderIndex - 1 },
      });
    }
  }
}
