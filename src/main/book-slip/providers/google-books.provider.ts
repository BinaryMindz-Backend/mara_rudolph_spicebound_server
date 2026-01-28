import { Injectable, Logger } from '@nestjs/common';
import { ExternalBookData } from '../types/book-source.types.js';

@Injectable()
export class GoogleBooksProvider {
  private readonly logger = new Logger(GoogleBooksProvider.name);
  private readonly baseUrl = 'https://www.googleapis.com/books/v1/volumes';

  async search(query: string): Promise<ExternalBookData | undefined> {
    try {
      const url = `${this.baseUrl}?q=${encodeURIComponent(query)}&maxResults=1&key=${process.env.GOOGLE_BOOKS_KEY}`;
      console.log(url)

      const res = await fetch(url);
      if (!res.ok) return undefined;

      const data = await res.json();
      console.log(data)
      if (!data.items?.length) return undefined;

      return this.mapVolumeToExternalData(data.items[0]);
    } catch (error) {
      this.logger.error('Google Books search failed', error);
      return undefined;
    }
  }

  async fetchByVolumeId(volumeId: string): Promise<ExternalBookData | undefined> {
    try {
      const url = `${this.baseUrl}/${volumeId}?key=${process.env.GOOGLE_BOOKS_KEY}`;

      const res = await fetch(url);
      if (!res.ok) return undefined;

      const data = await res.json();
      return this.mapVolumeToExternalData(data);
    } catch (error) {
      this.logger.error('Google Books fetchByVolumeId failed', error);
      return undefined;
    }
  }

  private mapVolumeToExternalData(volume: any): ExternalBookData {
    const info = volume.volumeInfo ?? {};

    const isbn13 = info.industryIdentifiers?.find(
      (id: any) => id.type === 'ISBN_13',
    )?.identifier;

    return {
      title: info.title,
      author: info.authors?.[0],
      description: info.description,
      publishedYear: info.publishedDate
        ? Number(info.publishedDate.split('-')[0])
        : undefined,

      isbn13,
      googleVolumeId: volume.id,

      externalAvgRating: info.averageRating,
      externalRatingCount: info.ratingsCount,
    };
  }
}
