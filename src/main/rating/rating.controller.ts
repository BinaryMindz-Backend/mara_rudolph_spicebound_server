import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RatingService } from './rating.service.js';
import { CreateRatingDto } from './dto/create-rating.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/user.decorators.js';

@Controller('ratings')
@UseGuards(JwtAuthGuard)
export class RatingController {
  constructor(private readonly ratingService: RatingService) {}

  @Post(':bookId')
  async rateBook(
    @CurrentUser() userId: string,
    @Param('bookId') bookId: string,
    @Body() dto: CreateRatingDto,
  ) {
    return this.ratingService.rateBook(userId, bookId, dto);
  }

  @Get(':bookId')
  async getBookRatings(@Param('bookId') bookId: string) {
    return this.ratingService.getBookRatings(bookId);
  }

  @Get('user/:bookId')
  async getUserRating(
    @CurrentUser() userId: string,
    @Param('bookId') bookId: string,
  ) {
    return this.ratingService.getUserRating(userId, bookId);
  }

  @Delete(':bookId')
  async removeRating(
    @CurrentUser() userId: string,
    @Param('bookId') bookId: string,
  ) {
    return this.ratingService.removeRating(userId, bookId);
  }
}
