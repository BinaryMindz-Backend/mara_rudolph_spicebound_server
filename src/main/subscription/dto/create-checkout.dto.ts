import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum CheckoutPlan {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export class CreateCheckoutDto {
  @ApiProperty({
    description: 'Subscription plan type',
    enum: CheckoutPlan,
    example: 'monthly',
  })
  @IsNotEmpty({ message: 'Plan is required' })
  @IsEnum(CheckoutPlan, {
    message: 'Plan must be either "monthly" or "yearly"',
  })
  plan: 'monthly' | 'yearly';
}
