-- Remove unused columns from Book table
ALTER TABLE "Book" DROP COLUMN IF EXISTS "coverImageUrl";
ALTER TABLE "Book" DROP COLUMN IF EXISTS "isStandalone";
ALTER TABLE "Book" DROP COLUMN IF EXISTS "externalRatingSource";
ALTER TABLE "Book" DROP COLUMN IF EXISTS "spiceboundAvgRating";
ALTER TABLE "Book" DROP COLUMN IF EXISTS "spiceboundRatingCount";
ALTER TABLE "Book" DROP COLUMN IF EXISTS "amazonAffiliateUrl";
ALTER TABLE "Book" DROP COLUMN IF EXISTS "bookshopAffiliateUrl";
