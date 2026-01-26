import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserLibraryService } from './user-library.service.js';
import { AddBookToLibraryDto } from './dto/add-book-to-library.dto.js';
import { UpdateBookStatusDto } from './dto/update-book-status.dto.js';
import { ReorderBooksDto } from './dto/reorder-books.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/user.decorators.js';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('User Library')
@Controller('user-library')
@UseGuards(JwtAuthGuard)
export class UserLibraryController {
  constructor(private readonly userLibraryService: UserLibraryService) {}

  @ApiBearerAuth('access-token')
  @Post('add')
  @ApiOperation({ summary: 'Add a book to user library' })
  async addBook(
    @CurrentUser() userId: string,
    @Body() dto: AddBookToLibraryDto,
  ) {
    return this.userLibraryService.addBookToLibrary(userId, dto);
  }

  @ApiBearerAuth('access-token')
  @Get()
  @ApiOperation({ summary: 'Get user library with optional status filter' })
  async getLibrary(
    @CurrentUser() userId: string,
    @Query('status') status?: string,
  ) {
    return this.userLibraryService.getUserLibrary(userId, status);
  }

  @ApiBearerAuth('access-token')
  @Get('count')
  @ApiOperation({ summary: 'Get total count of books in user library' })
  async getCount(@CurrentUser() userId: string) {
    const count = await this.userLibraryService.getLibraryCount(userId);
    return { count };
  }

  @ApiBearerAuth('access-token')
  @Put(':bookId/status')
  @ApiOperation({ summary: 'Update book reading status' })
  async updateStatus(
    @CurrentUser() userId: string,
    @Param('bookId') bookId: string,
    @Body() dto: UpdateBookStatusDto,
  ) {
    return this.userLibraryService.updateBookStatus(userId, bookId, dto);
  }

  @ApiBearerAuth('access-token')
  @Put('reorder')
  @ApiOperation({ summary: 'Reorder books in library' })
  async reorderBooks(
    @CurrentUser() userId: string,
    @Body() dto: ReorderBooksDto,
  ) {
    return this.userLibraryService.reorderBooks(userId, dto);
  }

  @ApiBearerAuth('access-token')
  @Delete(':bookId')
  @ApiOperation({ summary: 'Remove book from library' })
  async removeBook(
    @CurrentUser() userId: string,
    @Param('bookId') bookId: string,
  ) {
    await this.userLibraryService.removeBookFromLibrary(userId, bookId);
    return { success: true };
  }
}
