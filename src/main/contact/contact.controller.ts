import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ContactService } from './contact.service.js';
import { CreateContactDto } from './dto/create-contact.dto.js';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
    constructor(private readonly contactService: ContactService) { }

    @Post()
    @ApiOperation({ summary: 'Submit a contact form' })
    @ApiResponse({ status: 201, description: 'The contact form has been successfully submitted.' })
    @ApiResponse({ status: 400, description: 'Bad Request.' })
    create(@Body() createContactDto: CreateContactDto) {
        return this.contactService.create(createContactDto);
    }
}
