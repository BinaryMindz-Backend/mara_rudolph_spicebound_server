import {
  FREE_TIER_BOOK_LIMIT,
  PREMIUM_TIER_BOOK_LIMIT,
} from '../constants/index.js';
import { SubscriptionPlan } from '../../../prisma/generated/prisma-client/enums.js';

export function getBookLimitForPlan(plan: SubscriptionPlan): number {
  switch (plan) {
    case SubscriptionPlan.PREMIUM:
      return PREMIUM_TIER_BOOK_LIMIT;
    case SubscriptionPlan.FREE:
    default:
      return FREE_TIER_BOOK_LIMIT;
  }
}

export function canAddBook(
  currentBookCount: number,
  plan: SubscriptionPlan,
): boolean {
  const limit = getBookLimitForPlan(plan);
  return currentBookCount < limit;
}

export function isFreeUser(plan: SubscriptionPlan): boolean {
  return plan === SubscriptionPlan.FREE;
}

export function isPremiumUser(plan: SubscriptionPlan): boolean {
  return plan === SubscriptionPlan.PREMIUM;}