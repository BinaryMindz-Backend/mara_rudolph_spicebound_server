import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class AddBookToLibraryDto {
  @ApiProperty({ example: 'book-id-123' })
  @IsString()
  bookId: string;

  @ApiProperty({
    description: 'Reading status',
    example: 'TBR',
    enum: ['TBR', 'READING', 'READ', 'DNF'],
  })
  @IsOptional()
  @IsString()
  status?: string;
}
