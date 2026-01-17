import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './main/auth/auth.module.js';
import { PrismaModule } from './main/prisma/prisma.module.js';
import { BookSlipModule } from './main/book-slip/book-slip.module.js';





@Module({
  imports: [AuthModule, PrismaModule, BookSlipModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
