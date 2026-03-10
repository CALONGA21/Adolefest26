-- CreateEnum
CREATE TYPE "public"."PackageType" AS ENUM ('ingresso', 'camiseta', 'combo');

-- AlterTable
ALTER TABLE "public"."orders"
ADD COLUMN "package_type" "public"."PackageType" NOT NULL DEFAULT 'ingresso';
