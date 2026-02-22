import {
  Body,
  Controller,
  Post,
  HttpCode,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse, ApiBody } from '@nestjs/swagger';
import { BookSlipService } from './book-slip.service.js';
import { DiscoverBookDto } from './dto/discover-book.dto.js';
import { EnrichedBookSlipResponse } from './dto/enriched-book-slip.response.js';

@ApiTags('Book Slip')
@Controller('book-slip')
export class BookSlipController {
  constructor(private readonly bookSlipService: BookSlipService) {}

  @Post('discover')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Discover and enrich a book with AI analysis from Amazon URL, title, or title+author',
    description: `
    Accepts a single input (Amazon URL, book title, or title+author) to discover a book and enrich it with AI metadata including:
    - Age Level classification (CHILDRENS, YA, NA, ADULT, EROTICA)
    - Spice Rating (0-6 scale)
    - Tropes (story dynamics and themes)
    - Fantasy Creatures
    - Subgenres
    
    The response combines the discovered book information with AI-enriched metadata.
    `,
  })
  @ApiBody({
    type: DiscoverBookDto,
    description:
      'Single input for book discovery - can be Amazon URL, book title, or title+author',
    examples: {
      amazonUrl: {
        summary: 'Amazon Product URL',
        value: {
          input:
            'https://www.amazon.com/Fourth-Wing-Rebecca-Yarros/dp/1635573815',
        },
      },
      titleOnly: {
        summary: 'Book title only',
        value: {
          input: 'Fourth Wing',
        },
      },
      titleAndAuthor: {
        summary: 'Title and author',
        value: {
          input: 'Fourth Wing by Rebecca Yarros',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Book discovered and enriched successfully',
    type: EnrichedBookSlipResponse,
    example: {
      success: true,
      statusCode: 201,
      message: 'Resource created successfully',
      data: {
        bookId: '39b9033d-d9a3-45a2-8609-fbdde09d2087',
        title: 'Fourth Wing',
        author: 'Rebecca Yarros',
        description:
          'Twenty-year-old Violet Sorrengail was supposed to enter the Scribe Quadrant...',
        releaseYear: 2023,
        ageLevel: 'NA',
        spiceRating: 4,
        tropes: [
          'Enemies to Lovers',
          'Forced Proximity',
          'Touch Her and Die',
          'Morally Grey',
        ],
        creatures: ['Dragons'],
        subgenres: ['Romantasy', 'Military Fantasy'],
        links: {},
        created: false,
      },
      meta: {},
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid input format',
  })
  @ApiResponse({
    status: 404,
    description: 'Book not found with the provided input',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - book discovery or enrichment failed',
  })
  async discoverBook(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }))
    dto: DiscoverBookDto,
  ): Promise<{
    success: boolean;
    statusCode: number;
    message: string;
    data: any;
    meta: Record<string, any>;
  }> {
    // BookSlipService.discoverBook() returns fully enriched book data:
    // - If book exists in DB (by external ID or title): returns cached enriched data (NO AI call)
    // - If book is new: performs AI enrichment once, stores in DB, returns enriched data
    // We use the data directly without redundant re-enrichment
    const enrichedBook = await this.bookSlipService.discoverBook(dto.input);

    return {
      success: true,
      statusCode: 201,
      message: 'Resource created successfully',
      data: enrichedBook,
      meta: {},
    };
  }
}
