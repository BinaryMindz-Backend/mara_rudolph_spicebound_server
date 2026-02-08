import { Body, Controller, Post, HttpCode, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse, ApiBody } from '@nestjs/swagger';
import { BookMetadataEnrichmentService } from './ai/book-metadata-enrichment.service.js';
import { BookMetadataEnrichmentResponse } from './ai/dto/book-metadata-enrichment.dto.js';
import { DiscoverBookDto } from './dto/discover-book.dto.js';

@ApiTags('Book Slip')
@Controller('book-slip')
export class BookSlipController {
  constructor(
    private readonly metadataEnrichmentService: BookMetadataEnrichmentService,
  ) {}

  @Post('discover')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Discover and enrich book metadata with AI analysis (age level, spice rating, tropes, creatures, subgenres, etc)',
    description: `
    Analyzes a book using OpenAI GPT-4 and returns comprehensive metadata including:
    - Age Level classification (CHILDRENS, YA, NA, ADULT, EROTICA)
    - Spice Rating (0-6 scale)
    - Tropes (Enemies to Lovers, Fated Mates, etc.)
    - Fantasy Creatures
    - Subgenres
    - Series Information
    - AI-generated reader-friendly description
    - Confidence levels for review flagging
    `,
  })
  @ApiBody({
    type: DiscoverBookDto,
    description: 'Book information for metadata enrichment',
    examples: {
      fourthWing: {
        summary: 'Fourth Wing - Romantasy',
        value: {
          title: 'Fourth Wing',
          author: 'Rebecca Yarros',
          publishedYear: 2023,
          description:
            'Twenty-year-old Violet Sorrengail was supposed to enter the Scribe Quadrant, where she could live a quiet life among books and history. But her mother, the commanding general, orders her into the brutal Riders Quadrant instead, where dragon riders are made.',
          categories: ['Fantasy', 'Romance', 'Dragons'],
          pageCount: 640,
          seriesInfo: 'Book 1 of The Empyrean series',
        },
      },
      hungerGames: {
        summary: 'The Hunger Games - YA Dystopian',
        value: {
          title: 'The Hunger Games',
          author: 'Suzanne Collins',
          publishedYear: 2008,
          description:
            'In the dystopian nation of Panem, sixteen-year-old Katniss Everdeen volunteers to participate in the annual Hunger Games, a televised fight to the death.',
          categories: ['Dystopian', 'YA', 'Action'],
          pageCount: 374,
          seriesInfo: 'Book 1 of The Hunger Games trilogy',
        },
      },
      acotar: {
        summary: 'A Court of Thorns and Roses - Fae Romance',
        value: {
          title: 'A Court of Thorns and Roses',
          author: 'Sarah J. Maas',
          publishedYear: 2015,
          description:
            'When nineteen-year-old huntress Feyre kills a wolf in the woods, a beast-like creature arrives to demand retribution. Dragged to the magical land of Prythian, she finds herself in the estate of Tamlin, a masked High Fae lord.',
          categories: ['Fantasy', 'Romance', 'Fae'],
          pageCount: 416,
          seriesInfo: 'Book 1 of A Court of Thorns and Roses series',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Book metadata successfully enriched',
    type: BookMetadataEnrichmentResponse,
    example: {
      success: true,
      statusCode: 200,
      message: 'Request successful',
      data: {
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
        series: {
          name: 'The Empyrean',
          position: 1,
          totalBooks: 5,
          status: 'INCOMPLETE',
        },
        description:
          'Twenty-year-old Violet Sorrengail, fragile-boned and better suited for the scholarly Scribe Quadrant, is forced by her commanding general mother into the brutal Riders Quadrant...',
        confidence: {
          spiceRating: 'HIGH',
          overall: 'HIGH',
        },
      },
      meta: {},
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad request - missing required fields (title, author) or invalid data format',
  })
  @ApiResponse({
    status: 500,
    description:
      'Internal server error - OpenAI API error or response parsing failure',
  })
  async discoverBook(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
      }),
    )
    dto: DiscoverBookDto,
  ): Promise<BookMetadataEnrichmentResponse> {
    return this.metadataEnrichmentService.enrichBookMetadata(dto);
  }
}
