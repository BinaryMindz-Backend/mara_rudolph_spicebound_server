import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class SignupDto {
  @ApiProperty({ example: 'Rahman Abdul Quadir' })
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'rahmanaq777@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'rahman123' })
  @MinLength(8)
  password: string;
}
