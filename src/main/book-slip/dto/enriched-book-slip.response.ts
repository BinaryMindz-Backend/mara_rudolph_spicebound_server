import { ApiProperty } from '@nestjs/swagger';

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
    description:
      'Age level classification (CHILDRENS, YA, NA, ADULT, EROTICA)',
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
    description: 'External links (Amazon, Goodreads, etc)',
    example: {},
  })
  links: Record<string, string>;

  @ApiProperty({
    description: 'Whether this is a newly created book record',
    example: false,
  })
  created: boolean;
}
