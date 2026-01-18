import { Injectable } from '@nestjs/common';
import { ExternalBookData } from '../types/book-source.types.js';


@Injectable()
export class OpenLibraryProvider {
  async search(query: string): Promise<ExternalBookData | null> {
    // TODO: Implement Open Library API call
    return null;
  }

  async fetchById(id: string): Promise<ExternalBookData | null> {
    return null;
  }
}
