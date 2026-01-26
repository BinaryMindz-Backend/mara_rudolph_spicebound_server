import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RatingService } from './rating.service.js';
import { CreateRatingDto } from './dto/create-rating.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/user.decorators.js';

@ApiTags('Ratings')
@Controller('ratings')
@UseGuards(JwtAuthGuard)
export class RatingController {
  constructor(private readonly ratingService: RatingService) {}

  @ApiBearerAuth('access-token')
  @Post(':bookId')
  @ApiOperation({ summary: 'Rate a book' })
  async rateBook(
    @CurrentUser() userId: string,
    @Param('bookId') bookId: string,
    @Body() dto: CreateRatingDto,
  ) {
    return this.ratingService.rateBook(userId, bookId, dto);
  }

  @ApiBearerAuth('access-token')
  @Get(':bookId')
  @ApiOperation({ summary: 'Get ratings for a book' })
  async getBookRatings(@Param('bookId') bookId: string) {
    return this.ratingService.getBookRatings(bookId);
  }

  @ApiBearerAuth('access-token')
  @Get('user/:bookId')
  @ApiOperation({ summary: 'Get current user rating for a book' })
  async getUserRating(
    @CurrentUser() userId: string,
    @Param('bookId') bookId: string,
  ) {
    return this.ratingService.getUserRating(userId, bookId);
  }

  @ApiBearerAuth('access-token')
  @Delete(':bookId')
  @ApiOperation({ summary: 'Delete user rating for a book' })
  async removeRating(
    @CurrentUser() userId: string,
    @Param('bookId') bookId: string,
  ) {
    return this.ratingService.removeRating(userId, bookId);
  }
}
