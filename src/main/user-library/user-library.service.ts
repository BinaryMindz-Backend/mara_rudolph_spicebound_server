import {
  BadRequestException,
  ConflictException,
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
import { BookSlipService } from '../book-slip/book-slip.service.js';
import { BookSlipResponse } from '../book-slip/dto/book-slip.response.js';

export interface UserLibraryResponse extends BookSlipResponse {
  userLibrary: {
    status: ReadingStatus;
    orderIndex: number;
    createdAt: Date;
  };
}

@Injectable()
export class UserLibraryService {
  constructor(
    private prisma: PrismaService,
    private bookSlipService: BookSlipService,
  ) {}

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
      if (
        exists.status === ReadingStatus.READ ||
        exists.status === ReadingStatus.DNF
      ) {
        throw new ConflictException({
          message: `Book is already in your ${exists.status} archive`,
          code: 'BOOK_IN_ARCHIVE',
          currentStatus: exists.status,
        });
      }
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

      const titleAuthQuery = encodeURIComponent(
        `${userBook.book.title} ${userBook.book.primaryAuthor || ''}`.trim(),
      );

      const amazonUrl =
        userBook.book.amazonUrl ||
        (asin
          ? `https://amazon.com/dp/${asin}`
          : isbn13
            ? `https://www.amazon.com/s?k=${isbn13}`
            : `https://www.amazon.com/s?k=${titleAuthQuery}`);
      const bookshopUrl =
        userBook.book.bookshopUrl ||
        (isbn13
          ? `https://bookshop.org/a/0/${isbn13}`
          : `https://bookshop.org/search?q=${titleAuthQuery}`);

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

    const slip = await this.bookSlipService.buildSlip(userBook.book, false);
    return {
      ...slip,
      userLibrary: {
        status: userBook.status as ReadingStatus,
        orderIndex: userBook.orderIndex,
        createdAt: userBook.createdAt,
      },
    } as UserLibraryResponse;
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
    // If status is TBR, we want to fetch both TBR and READING books
    const statusFilter = status
      ? status === ReadingStatus.TBR
        ? { status: { in: [ReadingStatus.TBR, ReadingStatus.READING] } }
        : { status: status as ReadingStatus }
      : {};

    const books = await this.prisma.userBook.findMany({
      where: {
        userId,
        ...statusFilter,
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
        orderIndex: 'asc', // We will manually sort to ensure READING is at the top
      },
    });

    // Prioritize READING status for the TBR view
    if (status === ReadingStatus.TBR) {
      books.sort((a, b) => {
        if (
          a.status === ReadingStatus.READING &&
          b.status !== ReadingStatus.READING
        )
          return -1;
        if (
          a.status !== ReadingStatus.READING &&
          b.status === ReadingStatus.READING
        )
          return 1;
        return a.orderIndex - b.orderIndex;
      });
    }

    // Map all books into standard BookSlipResponse format (batched: 2 queries instead of 2 per book)
    const bookList = books.map((ub) => ub.book);
    const slips = await this.bookSlipService.buildSlipsBatch(bookList);
    return books.map((userBook, i) => ({
      ...slips[i],
      userLibrary: {
        status: userBook.status as ReadingStatus,
        orderIndex: userBook.orderIndex,
        createdAt: userBook.createdAt,
      },
    })) as UserLibraryResponse[];
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

    // If setting to reading, and it isn't already reading, bump it to the top
    // by pushing everything else down 1 slot
    if (
      dto.status === ReadingStatus.READING &&
      userBook.status !== ReadingStatus.READING
    ) {
      // Shift all books in TBR/READING down
      await this.prisma.userBook.updateMany({
        where: {
          userId,
          status: { in: [ReadingStatus.TBR, ReadingStatus.READING] },
          orderIndex: { lt: userBook.orderIndex },
        },
        data: {
          orderIndex: { increment: 1 },
        },
      });

      // Update to 0
      // Update to 0
      const updatedUserBook = await this.prisma.userBook.update({
        where: { userId_bookId: { userId, bookId } },
        data: { status: dto.status as ReadingStatus, orderIndex: 0 },
        include: { book: true },
      });

      const slip = await this.bookSlipService.buildSlip(
        updatedUserBook.book,
        false,
      );
      return {
        ...slip,
        userLibrary: {
          status: updatedUserBook.status as ReadingStatus,
          orderIndex: updatedUserBook.orderIndex,
          createdAt: updatedUserBook.createdAt,
        },
      } as UserLibraryResponse;
    }

    const updatedUserBook = await this.prisma.userBook.update({
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

    const slip = await this.bookSlipService.buildSlip(
      updatedUserBook.book,
      false,
    );
    return {
      ...slip,
      userLibrary: {
        status: updatedUserBook.status as ReadingStatus,
        orderIndex: updatedUserBook.orderIndex,
        createdAt: updatedUserBook.createdAt,
      },
    } as UserLibraryResponse;
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

  /** Priority order when trimming to free limit: 1.TBR, 2.Reading, 3.Read, 4.DNF */
  private static readonly TRIM_PRIORITY: Record<ReadingStatus, number> = {
    [ReadingStatus.TBR]: 1,
    [ReadingStatus.READING]: 2,
    [ReadingStatus.READ]: 3,
    [ReadingStatus.DNF]: 4,
  };

  /**
   * Trim user library to free-tier limit (3 books). Keeps the first 3 by
   * priority: 1. TBR, 2. Reading, 3. Read, 4. DNF (then orderIndex within same status).
   * Deletes all other books for this user. Call when user downgrades.
   */
  async trimTbrToFreeLimit(userId: string): Promise<{ removed: number }> {
    const allBooks = await this.prisma.userBook.findMany({
      where: { userId },
      orderBy: { orderIndex: 'asc' },
    });

    // Sort by priority (TBR → Reading → Read → DNF), then by orderIndex within same status
    const priority = UserLibraryService.TRIM_PRIORITY;
    allBooks.sort((a, b) => {
      const pa = priority[a.status];
      const pb = priority[b.status];
      if (pa !== pb) return pa - pb;
      return a.orderIndex - b.orderIndex;
    });

    if (allBooks.length <= 3) {
      return { removed: 0 };
    }

    const toKeep = allBooks.slice(0, 3);
    const idsToKeep = new Set(toKeep.map((ub) => ub.id));
    const toRemove = allBooks.filter((ub) => !idsToKeep.has(ub.id));
    const idsToRemove = toRemove.map((ub) => ub.id);

    await this.prisma.userBook.deleteMany({
      where: { id: { in: idsToRemove } },
    });

    // Reindex kept items to 0, 1, 2
    for (let i = 0; i < toKeep.length; i++) {
      await this.prisma.userBook.update({
        where: { id: toKeep[i].id },
        data: { orderIndex: i },
      });
    }

    return { removed: toRemove.length };
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
