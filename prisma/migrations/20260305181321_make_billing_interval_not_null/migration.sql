/*
  Warnings:

  - Made the column `billingInterval` on table `Subscription` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Subscription" ALTER COLUMN "billingInterval" SET NOT NULL,
ALTER COLUMN "billingInterval" SET DEFAULT 'month';
