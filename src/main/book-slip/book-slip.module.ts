import { Module } from '@nestjs/common';
import { BookSlipService } from './book-slip.service.js';
import { BookSlipController } from './book-slip.controller.js';


@Module({
  providers: [BookSlipService],
  controllers: [BookSlipController]
})
export class BookSlipModule {}
