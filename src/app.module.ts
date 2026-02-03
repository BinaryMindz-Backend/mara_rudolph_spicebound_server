import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './main/auth/auth.module.js';
import { PrismaModule } from './main/prisma/prisma.module.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
