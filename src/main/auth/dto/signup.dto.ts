import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class SignupDto {
  @IsNotEmpty()
  firstName: string;

  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;
}
