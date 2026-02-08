import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  MinLength,
} from 'class-validator';

export class DiscoverBookDto {
  @ApiProperty({
    description: 'The title of the book',
    example: 'Fourth Wing',
  })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({
    description: 'The author of the book',
    example: 'Rebecca Yarros',
  })
  @IsString()
  @MinLength(1)
  author: string;

  @ApiProperty({
    description: 'Publication year',
    example: 2023,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  publishedYear?: number;

  @ApiProperty({
    description: 'Book description or synopsis',
    example:
      'Twenty-year-old Violet Sorrengail was supposed to enter the Scribe Quadrant...',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Book categories or subjects',
    example: ['Fantasy', 'Romance', 'Dragons'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiProperty({
    description: 'Total number of pages',
    example: 640,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  pageCount?: number;

  @ApiProperty({
    description: 'Series information',
    example: 'Book 1 of The Empyrean series',
    required: false,
  })
  @IsOptional()
  @IsString()
  seriesInfo?: string;
}
