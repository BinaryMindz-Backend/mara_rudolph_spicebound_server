import {
  AgeLevel,
  SeriesStatus,
} from 'prisma/generated/prisma-client/enums.js';

export interface BookSlipResponse {
  bookId: string;
  title: string;
  author: string;
  description?: string;

  releaseYear?: number;

  // ageLevel is now displayed as formatted string (e.g., "New Adult" instead of "NA")
  ageLevel?: string;
  spiceRating?: number;

  tropes: string[];
  creatures: string[];
  subgenres: string[];

  series?: {
    name: string | null;
    index?: number | null;
    total?: number | null;
    status: SeriesStatus;
  };

  isMultiArc?: boolean;

  arc?: {
    name: string | null;
    index?: number | null;
    total?: number | null;
    status: SeriesStatus | null;
  };

  ratings?: {
    average?: number;
    count?: number;
  };

  links?: {
    amazon?: string;
    bookshop?: string;
    goodreads?: string;
  };

  created: boolean;

  // Confidence levels for metadata extraction (from AI enrichment)
  confidence?: {
    spiceRating: string;
    ageLevel?: string;
    tropes?: string;
    creatures?: string;
    subgenres?: string;
    series?: string;
    overall?: string;
  };
}
