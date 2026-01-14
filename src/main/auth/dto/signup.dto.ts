import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class SignupDto {
    @ApiProperty({ example: 'John Doe' })
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'strongPassword123' })
    @MinLength(8)
    password: string;
}
