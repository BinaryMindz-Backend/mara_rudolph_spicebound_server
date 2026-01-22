import { Module } from '@nestjs/common';
import { UserLibraryService } from './user-library.service.js';
import { UserLibraryController } from './user-library.controller.js';

@Module({
  providers: [UserLibraryService],
  controllers: [UserLibraryController],
  exports: [UserLibraryService],
})
export class UserLibraryModule {}
