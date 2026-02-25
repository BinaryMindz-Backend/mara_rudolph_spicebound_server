import { Module } from '@nestjs/common';
import { UserLibraryService } from './user-library.service.js';
import { UserLibraryController } from './user-library.controller.js';
import { BookSlipModule } from '../book-slip/book-slip.module.js';

@Module({
  imports: [BookSlipModule],
  providers: [UserLibraryService],
  controllers: [UserLibraryController],
  exports: [UserLibraryService],
})
export class UserLibraryModule { }
