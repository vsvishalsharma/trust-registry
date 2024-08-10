/*
  Warnings:

  - A unique constraint covering the columns `[serviceEndpoint]` on the table `GovernanceAuthority` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "GovernanceAuthority_serviceEndpoint_key" ON "GovernanceAuthority"("serviceEndpoint");
