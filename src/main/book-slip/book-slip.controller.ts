import { Body, Controller, Post, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BookSlipService } from './book-slip.service.js';
import { DiscoverBookDto } from './dto/discover-book.dto.js';
import { BookSlipResponse } from './dto/book-slip.response.js';


@ApiTags('Book Slip')
@Controller('book-slip')
export class BookSlipController {
  constructor(private readonly bookSlipService: BookSlipService) {}

  @Post('discover')
  @HttpCode(201)
  @ApiOperation({ summary: 'Discover a book by title, author, ISBN, or URL' })
  async discoverBook(
    @Body() dto: DiscoverBookDto,
  ): Promise<BookSlipResponse> {
    return this.bookSlipService.discoverBook(dto.input);
  }
}
