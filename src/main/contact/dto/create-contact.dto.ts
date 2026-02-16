import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateContactDto {
  @ApiProperty({
    description: 'The name of the person contacting',
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @ApiProperty({
    description: 'The email address of the person contacting',
    example: 'john@example.com',
  })
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @ApiProperty({
    description: 'The message content',
    example: 'Hello, I would like to know more about your services.',
    minLength: 10,
  })
  @IsString()
  @MinLength(10, { message: 'Message must be at least 10 characters' })
  message: string;
}
