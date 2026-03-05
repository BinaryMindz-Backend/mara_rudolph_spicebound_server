-- AlterTable
ALTER TABLE "Subscription" ALTER COLUMN "billingInterval" DROP NOT NULL,
ALTER COLUMN "billingInterval" DROP DEFAULT;
