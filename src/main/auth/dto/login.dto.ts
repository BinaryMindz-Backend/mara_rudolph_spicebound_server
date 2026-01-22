import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class LoginDto {
    @ApiProperty({ example: 'rahmanaq777@gmail.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'rahman123' })  
    @IsNotEmpty()
    password: string;
}
