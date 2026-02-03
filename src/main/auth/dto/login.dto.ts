import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class LoginDto {
<<<<<<< HEAD
    @ApiProperty({ example: 'rahmanaq777@gmail.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'rahman123' })  
    @IsNotEmpty()
    password: string;
=======
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'strongPassword123' })
  @IsNotEmpty()
  password: string;
>>>>>>> 891f4ee122a63280f71cb53dd1cdcf15936f426b
}
