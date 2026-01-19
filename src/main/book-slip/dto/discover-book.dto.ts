import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DiscoverBookDto {
    @ApiProperty({
        description: 'The input to discover the book. Can be an ISBN, URL, or free text.',
        example: 'Fourth Wing by Rebecca Yarros',
    })
    @IsString()
    @MinLength(3)
    input: string;
}
