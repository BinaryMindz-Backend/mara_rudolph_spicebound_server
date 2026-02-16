import {
  Body,
  Controller,
  Post,
  HttpCode,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse, ApiBody } from '@nestjs/swagger';
import { BookSlipService } from './book-slip.service.js';
import { BookMetadataEnrichmentService } from './ai/book-metadata-enrichment.service.js';
import { DiscoverBookDto } from './dto/discover-book.dto.js';
import { EnrichedBookSlipResponse } from './dto/enriched-book-slip.response.js';

@ApiTags('Book Slip')
@Controller('book-slip')
export class BookSlipController {
  constructor(
    private readonly bookSlipService: BookSlipService,
    private readonly metadataEnrichmentService: BookMetadataEnrichmentService,
  ) {}

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
    data: EnrichedBookSlipResponse;
    meta: Record<string, any>;
  }> {
    // Step 1: Discover book using the input
    const discoveredBook = await this.bookSlipService.discoverBook(dto.input);

    // Step 2: Extract metadata for enrichment
    const enrichmentData = {
      title: discoveredBook.title,
      author: discoveredBook.author,
      publishedYear: discoveredBook.releaseYear,
      description: discoveredBook.description || '',
      categories: [],
      pageCount: 0,
      seriesInfo: discoveredBook.series
        ? `Book ${discoveredBook.series.index} of ${discoveredBook.series.name}`
        : undefined,
    };

    // Step 3: Enrich with AI metadata
    const enrichedMetadata =
      await this.metadataEnrichmentService.enrichBookMetadata(enrichmentData);

    // Step 4: Merge discovered book info with enriched metadata
    // Prefer AI-provided series info, but fall back to discovered DB series when AI omitted it
    const finalSeries =
      enrichedMetadata.series ??
      (discoveredBook.series
        ? {
            name: discoveredBook.series.name ?? null,
            position: discoveredBook.series.index ?? undefined,
            totalBooks:
              typeof discoveredBook.series.total === 'number'
                ? discoveredBook.series.total
                : null,
            status: discoveredBook.series.status,
          }
        : null);

    const enrichedResponse: EnrichedBookSlipResponse = {
      bookId: discoveredBook.bookId,
      title: discoveredBook.title,
      author: discoveredBook.author,
      description: discoveredBook.description || '',
      releaseYear: discoveredBook.releaseYear || 0,
      ageLevel: enrichedMetadata.ageLevel,
      spiceRating: enrichedMetadata.spiceRating,
      tropes: enrichedMetadata.tropes,
      creatures: enrichedMetadata.creatures,
      subgenres: enrichedMetadata.subgenres,
      series: finalSeries as any,
      links: discoveredBook.links || {},
      created: discoveredBook.created || false,
      confidence: enrichedMetadata.confidence,
    };

    return {
      success: true,
      statusCode: 201,
      message: 'Resource created successfully',
      data: enrichedResponse,
      meta: {},
    };
  }
}
