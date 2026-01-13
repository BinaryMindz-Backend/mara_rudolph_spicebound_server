-- CreateEnum
CREATE TYPE "AgeLevel" AS ENUM ('CHILDREN', 'YA', 'NA', 'ADULT', 'EROTICA');

-- CreateEnum
CREATE TYPE "ReadingStatus" AS ENUM ('TBR', 'READING', 'READ', 'DNF');

-- CreateEnum
CREATE TYPE "SeriesStatus" AS ENUM ('COMPLETE', 'INCOMPLETE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PREMIUM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
