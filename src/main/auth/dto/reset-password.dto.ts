import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'token123abc...' })
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'newPassword456' })
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}
