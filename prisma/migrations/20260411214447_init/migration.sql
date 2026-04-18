/*
  Warnings:

  - The values [CHILDREN] on the enum `AgeLevel` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `arcIndex` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `User` table. All the data in the column will be lost.
  - Made the column `arcStatus` on table `Book` required. This step will fail if there are existing NULL values in that column.
  - Made the column `isMultiArc` on table `Book` required. This step will fail if there are existing NULL values in that column.
  - Made the column `spiceIncreasesInSeries` on table `Book` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `firstName` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AgeLevel_new" AS ENUM ('CHILDRENS', 'YA', 'NA', 'ADULT', 'EROTICA', 'UNKNOWN');
ALTER TABLE "public"."Book" ALTER COLUMN "ageLevel" DROP DEFAULT;
ALTER TABLE "Book" ALTER COLUMN "ageLevel" TYPE "AgeLevel_new" USING ("ageLevel"::text::"AgeLevel_new");
ALTER TYPE "AgeLevel" RENAME TO "AgeLevel_old";
ALTER TYPE "AgeLevel_new" RENAME TO "AgeLevel";
DROP TYPE "public"."AgeLevel_old";
ALTER TABLE "Book" ALTER COLUMN "ageLevel" SET DEFAULT 'UNKNOWN';
COMMIT;

-- AlterTable
ALTER TABLE "Book" DROP COLUMN "arcIndex",
ADD COLUMN     "arcNumber" INTEGER,
ADD COLUMN     "arcPosition" INTEGER,
ADD COLUMN     "confidenceOverall" TEXT,
ADD COLUMN     "confidenceSpiceRating" TEXT,
ADD COLUMN     "coverUrl" TEXT,
ALTER COLUMN "arcStatus" SET NOT NULL,
ALTER COLUMN "isMultiArc" SET NOT NULL,
ALTER COLUMN "spiceIncreasesInSeries" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "name",
ADD COLUMN     "firstName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "UserBook" ALTER COLUMN "orderIndex" SET DEFAULT 0;
