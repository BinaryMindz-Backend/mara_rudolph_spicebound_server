import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DiscoverBookDto {
    @ApiProperty({
        description: 'The input to discover the book. Can be an ISBN, URL, or free text.',
        example: '978-3-16-148410-0',
    })
    @IsString()
    @MinLength(3)
    input: string;
}
