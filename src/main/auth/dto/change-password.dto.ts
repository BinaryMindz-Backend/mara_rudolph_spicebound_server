import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'currentPassword123' })
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'newPassword456' })
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}
