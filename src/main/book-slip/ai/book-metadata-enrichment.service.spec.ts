import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { BookMetadataEnrichmentService } from './book-metadata-enrichment.service.js';

describe('BookMetadataEnrichmentService', () => {
  let service: BookMetadataEnrichmentService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookMetadataEnrichmentService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'OPENAI_KEY') {
                return process.env.OPENAI_KEY || 'sk-test-key';
              }
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<BookMetadataEnrichmentService>(
      BookMetadataEnrichmentService,
    );
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw error when title is missing', async () => {
    await expect(
      service.enrichBookMetadata({
        title: '',
        author: 'Test Author',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw error when author is missing', async () => {
    await expect(
      service.enrichBookMetadata({
        title: 'Test Book',
        author: '',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // Note: Real API calls would require actual OpenAI key and are typically mocked in tests
  // This is a basic structure—expand with mocked responses as needed
});
