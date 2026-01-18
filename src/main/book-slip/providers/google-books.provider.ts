import { Injectable } from '@nestjs/common';
import { ExternalBookData } from '../types/book-source.types.js';


@Injectable()
export class GoogleBooksProvider {
  async search(query: string): Promise<ExternalBookData | undefined | null> {
    // TODO: Implement Google Books API call
    return null;
  }

  async fetchByVolumeId(volumeId: string): Promise<ExternalBookData | null> {
    return null;
  }
}
