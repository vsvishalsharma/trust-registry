/*
  Warnings:

  - You are about to drop the column `organizationId` on the `Schema` table. All the data in the column will be lost.
  - You are about to drop the `Organization` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RegistryRelationship` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('ISSUER', 'VERIFIER', 'OTHER_TYPE');

-- CreateEnum
CREATE TYPE "AuthorizationStatus" AS ENUM ('NOT_FOUND', 'CURRENT', 'EXPIRED', 'TERMINATED', 'REVOKED');

-- DropForeignKey
ALTER TABLE "Organization" DROP CONSTRAINT "Organization_assuranceLevelId_fkey";

-- DropForeignKey
ALTER TABLE "Organization" DROP CONSTRAINT "Organization_governanceAuthorityId_fkey";

-- DropForeignKey
ALTER TABLE "Organization" DROP CONSTRAINT "Organization_namespaceId_fkey";

-- DropForeignKey
ALTER TABLE "RegistryRelationship" DROP CONSTRAINT "RegistryRelationship_registryId_fkey";

-- DropForeignKey
ALTER TABLE "RegistryRelationship" DROP CONSTRAINT "RegistryRelationship_relatedRegistryId_fkey";

-- DropForeignKey
ALTER TABLE "Schema" DROP CONSTRAINT "Schema_organizationId_fkey";

-- AlterTable
ALTER TABLE "GovernanceAuthority" ADD COLUMN     "relatedAuthorities" TEXT[],
ADD COLUMN     "serviceEndpoint" TEXT,
ADD COLUMN     "type" TEXT;

-- AlterTable
ALTER TABLE "Schema" DROP COLUMN "organizationId",
ADD COLUMN     "entityId" TEXT;

-- DropTable
DROP TABLE "Organization";

-- DropTable
DROP TABLE "RegistryRelationship";

-- DropEnum
DROP TYPE "OrganizationType";

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "did" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "governanceAuthorityId" TEXT NOT NULL,
    "namespaceId" TEXT NOT NULL,
    "assuranceLevelId" TEXT NOT NULL,
    "onboardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attributes" JSONB,
    "authorization" "AuthorizationStatus" NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Entity_did_key" ON "Entity"("did");

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_governanceAuthorityId_fkey" FOREIGN KEY ("governanceAuthorityId") REFERENCES "GovernanceAuthority"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_namespaceId_fkey" FOREIGN KEY ("namespaceId") REFERENCES "Namespace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_assuranceLevelId_fkey" FOREIGN KEY ("assuranceLevelId") REFERENCES "AssuranceLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schema" ADD CONSTRAINT "Schema_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
