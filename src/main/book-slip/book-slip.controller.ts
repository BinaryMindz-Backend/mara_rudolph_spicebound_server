import { Body, Controller, Post } from '@nestjs/common';
import { BookSlipService } from './book-slip.service.js';
import { DiscoverBookDto } from './dto/discover-book.dto.js';
import { BookSlipResponse } from './dto/book-slip.response.js';


@Controller('book-slip')
export class BookSlipController {
  constructor(private readonly bookSlipService: BookSlipService) {}

  @Post('discover')
  async discoverBook(
    @Body() dto: DiscoverBookDto,
  ): Promise<BookSlipResponse> {
    return this.bookSlipService.discoverBook(dto.input);
  }
}
