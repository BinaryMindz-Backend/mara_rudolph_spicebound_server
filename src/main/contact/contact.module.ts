import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContactService } from './contact.service.js';
import { ContactController } from './contact.controller.js';
import { EmailService } from '../../common/services/email.service.js';

@Module({
  imports: [ConfigModule],
  controllers: [ContactController],
  providers: [ContactService, EmailService],
})
export class ContactModule {}
