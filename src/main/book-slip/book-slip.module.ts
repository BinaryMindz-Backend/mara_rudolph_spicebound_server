import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BookSlipController } from './book-slip.controller.js';
import { BookSlipService } from './book-slip.service.js';
import { GoogleBooksProvider } from './providers/google-books.provider.js';
import { OpenLibraryProvider } from './providers/open-library.provider.js';
import { AiEnrichmentService } from './ai/ai-enrichment.service.js';


@Module({
  imports: [ConfigModule],
  controllers: [BookSlipController],
  providers: [
    BookSlipService,
    GoogleBooksProvider,
    OpenLibraryProvider,
    AiEnrichmentService,
  ],
  exports: [BookSlipService, AiEnrichmentService],
})
export class BookSlipModule {}
