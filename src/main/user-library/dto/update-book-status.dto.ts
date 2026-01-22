import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';

export class UpdateBookStatusDto {
  @ApiProperty({
    description: 'New reading status',
    enum: ['TBR', 'READING', 'READ', 'DNF'],
  })
  @IsString()
  @IsIn(['TBR', 'READING', 'READ', 'DNF'])
  status: string;
}
