import { IsString, MinLength } from 'class-validator';

export class DiscoverBookDto {
  @IsString()
  @MinLength(3)
  input: string;
}
