import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class SeriesInfo {
  name: string | null;
  position: number;
  totalBooks: number | null;
  status: 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN';
}

export class ArcInfo {
  name: string | null;
  position: number | null;
  totalBooks: number | null;
  status: 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN';
}

export class ConfidenceLevel {
  spiceRating: 'HIGH' | 'MEDIUM' | 'LOW';
  ageLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
  tropes?: 'HIGH' | 'MEDIUM' | 'LOW';
  creatures?: 'HIGH' | 'MEDIUM' | 'LOW';
  subgenres?: 'HIGH' | 'MEDIUM' | 'LOW';
  series?: 'HIGH' | 'MEDIUM' | 'LOW';
  overall?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export class BookMetadataEnrichmentResponse {
  ageLevel: 'CHILDRENS' | 'YA' | 'NA' | 'ADULT' | 'EROTICA';
  spiceRating: number; // 0-6
  tropes: string[];
  creatures: string[];
  subgenres: string[];
  series: SeriesInfo;
  arc?: ArcInfo | null;
  description: string;
  confidence: ConfidenceLevel;
  amazonAsin?: string;
}

export class EnrichBookRequest {
  @IsString({ message: 'Title must be a string' })
  title: string;

  @IsString({ message: 'Author must be a string' })
  author: string;

  @IsOptional()
  @IsNumber({}, { message: 'Published year must be a number' })
  publishedYear?: number;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @IsOptional()
  @IsArray({ message: 'Categories must be an array' })
  categories?: string[];

  @IsOptional()
  @IsNumber({}, { message: 'Page count must be a number' })
  pageCount?: number;

  @IsOptional()
  @IsString({ message: 'Series info must be a string' })
  seriesInfo?: string;
}
