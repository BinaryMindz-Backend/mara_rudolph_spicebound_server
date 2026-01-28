import { AgeLevel, SeriesStatus } from "prisma/generated/prisma-client/enums.js";


export interface BookSlipResponse {
  bookId: string;
  title: string;
  author: string;
  description?: string;

  releaseYear?: number;

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

  ratings?: {
    average?: number;
    count?: number;
  };

  links?: {
    amazon?: string;
    bookshop?: string;
  };

  created: boolean;
}
