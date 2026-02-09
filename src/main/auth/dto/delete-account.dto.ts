import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    example: 'currentPassword123',
    description: 'Current password to confirm account deletion',
  })
  @IsNotEmpty({ message: 'Password is required to delete account' })
  @IsString()
  password: string;
}
