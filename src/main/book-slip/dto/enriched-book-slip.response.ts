import { ApiProperty } from '@nestjs/swagger';

export class SeriesInfo {
  @ApiProperty({ example: 'The Empyrean' })
  name: string | null;

  @ApiProperty({ example: 1 })
  position: number;

  @ApiProperty({ example: 5 })
  totalBooks: number | null;

  @ApiProperty({
    example: 'INCOMPLETE',
    enum: ['COMPLETE', 'INCOMPLETE', 'UNKNOWN', 'ONGOING'],
  })
  status: string;
}

export class ConfidenceLevel {
  @ApiProperty({ example: 'HIGH', enum: ['HIGH', 'MEDIUM', 'LOW'] })
  spiceRating: string;

  @ApiProperty({
    example: 'HIGH',
    enum: ['HIGH', 'MEDIUM', 'LOW'],
    required: false,
  })
  ageLevel?: string;

  @ApiProperty({
    example: 'HIGH',
    enum: ['HIGH', 'MEDIUM', 'LOW'],
    required: false,
  })
  tropes?: string;

  @ApiProperty({
    example: 'HIGH',
    enum: ['HIGH', 'MEDIUM', 'LOW'],
    required: false,
  })
  creatures?: string;

  @ApiProperty({
    example: 'HIGH',
    enum: ['HIGH', 'MEDIUM', 'LOW'],
    required: false,
  })
  subgenres?: string;

  @ApiProperty({
    example: 'LOW',
    enum: ['HIGH', 'MEDIUM', 'LOW'],
    required: false,
  })
  series?: string;

  @ApiProperty({
    example: 'HIGH',
    enum: ['HIGH', 'MEDIUM', 'LOW'],
    required: false,
  })
  overall?: string;
}

export class EnrichedBookSlipResponse {
  @ApiProperty({
    description: 'Unique book identifier',
    example: '39b9033d-d9a3-45a2-8609-fbdde09d2087',
  })
  bookId: string;

  @ApiProperty({
    description: 'Book title',
    example: 'The Shadow Between Thoughts',
  })
  title: string;

  @ApiProperty({
    description: 'Book author',
    example: 'Jay W Farley',
  })
  author: string;

  @ApiProperty({
    description: 'Book description/synopsis',
    example:
      'On the run from his treacherous family and a dying planet, battlemage vampire Stephen Halder...',
  })
  description: string;

  @ApiProperty({
    description: 'Publication year',
    example: 2025,
  })
  releaseYear: number;

  @ApiProperty({
    description: 'Age level classification (CHILDRENS, YA, NA, ADULT, EROTICA)',
    enum: ['CHILDRENS', 'YA', 'NA', 'ADULT', 'EROTICA'],
    example: 'ADULT',
  })
  ageLevel: string;

  @ApiProperty({
    description: 'Spice rating (0-6 scale)',
    example: 4,
    minimum: 0,
    maximum: 6,
  })
  spiceRating: number;

  @ApiProperty({
    description: 'Story tropes',
    example: ['Enemies to Lovers', 'Forced Proximity', 'Touch Her and Die'],
    type: [String],
  })
  tropes: string[];

  @ApiProperty({
    description: 'Fantasy creatures present in the story',
    example: ['Dragons', 'Vampires'],
    type: [String],
  })
  creatures: string[];

  @ApiProperty({
    description: 'Book subgenres',
    example: ['Romantasy', 'Military Fantasy'],
    type: [String],
  })
  subgenres: string[];

  @ApiProperty({
    description: 'Series information',
    type: SeriesInfo,
  })
  series: SeriesInfo;

  @ApiProperty({
    description: 'External links (Amazon, Goodreads, etc)',
    example: {
      amazon: 'https://amazon.com/...',
      bookshop: 'https://bookshop.org/...',
    },
  })
  links: Record<string, string>;

  @ApiProperty({
    description: 'Whether this is a newly created book record',
    example: false,
  })
  created: boolean;

  @ApiProperty({
    description: 'Confidence levels for metadata extraction',
    type: ConfidenceLevel,
  })
  confidence: ConfidenceLevel;
}
