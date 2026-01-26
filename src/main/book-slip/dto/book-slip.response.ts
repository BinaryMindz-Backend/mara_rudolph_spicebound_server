import { AgeLevel, SeriesStatus } from "prisma/generated/prisma-client/enums.js";


export interface BookSlipResponse {
  bookId: string;
  title: string;
  author: string;
  description?: string;

  ageLevel?: AgeLevel;
  spiceRating?: number;

  tropes: string[];
  creatures: string[];
  subgenres: string[];

  series?: {
    name: string;
    index: number;
    total?: number;
    status: SeriesStatus;
  };

  externalRatings?: {
    average?: number;
    count?: number;
  };

  spiceboundRatings?: {
    average?: number;
    count?: number;
  };

  combinedRating?: {
    display: string;
    value: number | null;
    sources: string[];
  };

  links?: {
    amazon?: string;
    bookshop?: string;
  };

  created: boolean;
}
