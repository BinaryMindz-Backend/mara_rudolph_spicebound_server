-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "arcIndex" INTEGER,
ADD COLUMN     "arcName" TEXT,
ADD COLUMN     "arcStatus" "SeriesStatus" DEFAULT 'UNKNOWN',
ADD COLUMN     "arcTotal" INTEGER;
