import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './main/auth/auth.module.js';
import { PrismaModule } from './main/prisma/prisma.module.js';
import { BookSlipModule } from './main/book-slip/book-slip.module.js';
import { UserLibraryModule } from './main/user-library/user-library.module.js';
import { RatingModule } from './main/rating/rating.module.js';
import { SubscriptionModule } from './main/subscription/subscription.module.js';
import stripeConfig from './config/stripe.config.js';
import jwtConfig from './config/jwt.config.js';
import openaiConfig from './config/openai.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [stripeConfig, jwtConfig, openaiConfig],
    }),
    PrismaModule,
    AuthModule,
    BookSlipModule,
    UserLibraryModule,
    RatingModule,
    SubscriptionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
