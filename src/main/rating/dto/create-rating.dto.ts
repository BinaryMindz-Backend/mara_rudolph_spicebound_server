import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min, Max } from 'class-validator';

export class CreateRatingDto {
  @ApiProperty({
    description: 'Rating value from 0 to 5 (supports half-stars)',
    example: 4.5,
  })
  @IsNumber()
  @Min(0)
  @Max(5)
  value: number;
}
