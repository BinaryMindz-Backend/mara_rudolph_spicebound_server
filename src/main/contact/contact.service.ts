import { Injectable, Logger } from '@nestjs/common';
import { CreateContactDto } from './dto/create-contact.dto.js';
import { EmailService } from '../../common/services/email.service.js';

@Injectable()
export class ContactService {
    private readonly logger = new Logger(ContactService.name);

    constructor(private readonly emailService: EmailService) { }

    async create(createContactDto: CreateContactDto) {
        this.logger.log('New contact request received:', createContactDto);

        await this.emailService.sendContactFormEmail(createContactDto);

        return {
            message: 'Contact request received successfully',
            data: createContactDto,
        };
    }
}
