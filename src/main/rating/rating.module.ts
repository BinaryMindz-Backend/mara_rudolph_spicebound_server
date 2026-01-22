import { Module } from '@nestjs/common';
import { RatingService } from './rating.service.js';
import { RatingController } from './rating.controller.js';

@Module({
  providers: [RatingService],
  controllers: [RatingController],
  exports: [RatingService],
})
export class RatingModule {}
