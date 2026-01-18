import { Module } from '@nestjs/common';
import { BookSlipController } from './book-slip.controller.js';
import { BookSlipService } from './book-slip.service.js';
import { GoogleBooksProvider } from './providers/google-books.provider.js';
import { OpenLibraryProvider } from './providers/open-library.provider.js';


@Module({
  controllers: [BookSlipController],
  providers: [
    BookSlipService,
    GoogleBooksProvider,
    OpenLibraryProvider,
  ],
  exports: [BookSlipService],
})
export class BookSlipModule {}
