/*
  Warnings:

  - You are about to drop the column `asin` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `author` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `googleVolumeId` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `isbn13` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `openLibraryId` on the `Book` table. All the data in the column will be lost.
  - Added the required column `normalizedAuthor` to the `Book` table without a default value. This is not possible if the table is not empty.
  - Added the required column `normalizedTitle` to the `Book` table without a default value. This is not possible if the table is not empty.
  - Added the required column `primaryAuthor` to the `Book` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Book` table without a default value. This is not possible if the table is not empty.
  - Made the column `ageLevel` on table `Book` required. This step will fail if there are existing NULL values in that column.
  - Made the column `seriesStatus` on table `Book` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `plan` on the `Subscription` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Book" DROP COLUMN "asin",
DROP COLUMN "author",
DROP COLUMN "description",
DROP COLUMN "googleVolumeId",
DROP COLUMN "isbn13",
DROP COLUMN "openLibraryId",
ADD COLUMN     "amazonAffiliateUrl" TEXT,
ADD COLUMN     "bookshopAffiliateUrl" TEXT,
ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "externalRatingSource" TEXT,
ADD COLUMN     "isStandalone" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "normalizedAuthor" TEXT NOT NULL,
ADD COLUMN     "normalizedTitle" TEXT NOT NULL,
ADD COLUMN     "primaryAuthor" TEXT NOT NULL,
ADD COLUMN     "shortDescription" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "ageLevel" SET NOT NULL,
ALTER COLUMN "ageLevel" SET DEFAULT 'UNKNOWN',
ALTER COLUMN "seriesStatus" SET NOT NULL,
ALTER COLUMN "seriesStatus" SET DEFAULT 'UNKNOWN',
ALTER COLUMN "amazonUrl" DROP NOT NULL,
ALTER COLUMN "bookshopUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "plan",
ADD COLUMN     "plan" "SubscriptionPlan" NOT NULL;

-- CreateTable
CREATE TABLE "BookAlias" (
    "id" TEXT NOT NULL,
    "type" "BookAliasType" NOT NULL,
    "value" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookAlias_value_idx" ON "BookAlias"("value");

-- CreateIndex
CREATE UNIQUE INDEX "BookAlias_type_value_key" ON "BookAlias"("type", "value");

-- CreateIndex
CREATE INDEX "Book_normalizedTitle_normalizedAuthor_idx" ON "Book"("normalizedTitle", "normalizedAuthor");

-- AddForeignKey
ALTER TABLE "BookAlias" ADD CONSTRAINT "BookAlias_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
