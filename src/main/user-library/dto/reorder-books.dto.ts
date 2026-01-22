import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class ReorderBooksDto {
  @ApiProperty({
    description: 'Ordered array of book IDs',
    example: ['book-1', 'book-2', 'book-3'],
  })
  @IsArray()
  @IsString({ each: true })
  bookIds: string[];
}
