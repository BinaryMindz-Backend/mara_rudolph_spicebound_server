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

@Controller('user-library')
@UseGuards(JwtAuthGuard)
export class UserLibraryController {
  constructor(private readonly userLibraryService: UserLibraryService) {}

  @Post('add')
  async addBook(
    @CurrentUser() userId: string,
    @Body() dto: AddBookToLibraryDto,
  ) {
    return this.userLibraryService.addBookToLibrary(userId, dto);
  }

  @Get()
  async getLibrary(
    @CurrentUser() userId: string,
    @Query('status') status?: string,
  ) {
    return this.userLibraryService.getUserLibrary(userId, status);
  }

  @Get('count')
  async getCount(@CurrentUser() userId: string) {
    const count = await this.userLibraryService.getLibraryCount(userId);
    return { count };
  }

  @Put(':bookId/status')
  async updateStatus(
    @CurrentUser() userId: string,
    @Param('bookId') bookId: string,
    @Body() dto: UpdateBookStatusDto,
  ) {
    return this.userLibraryService.updateBookStatus(userId, bookId, dto);
  }

  @Put('reorder')
  async reorderBooks(
    @CurrentUser() userId: string,
    @Body() dto: ReorderBooksDto,
  ) {
    return this.userLibraryService.reorderBooks(userId, dto);
  }

  @Delete(':bookId')
  async removeBook(
    @CurrentUser() userId: string,
    @Param('bookId') bookId: string,
  ) {
    await this.userLibraryService.removeBookFromLibrary(userId, bookId);
    return { success: true };
  }
}
