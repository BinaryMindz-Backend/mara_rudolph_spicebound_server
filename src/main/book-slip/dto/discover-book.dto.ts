import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DiscoverBookDto {
  @ApiProperty({
    description:
      'The input to discover the book. Can be: Amazon book URL, book title, or book title + author',
    examples: {
      amazonUrl: 'https://www.amazon.com/Fourth-Wing-Rebecca-Yarros/dp/1635573815',
      title: 'Fourth Wing',
      titleAuthor: 'Fourth Wing by Rebecca Yarros',
    },
  })
  @IsString()
  @MinLength(3)
  input: string;
}
