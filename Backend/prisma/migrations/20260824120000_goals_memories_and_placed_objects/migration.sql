-- Goals, memories, and the objects the user has put in their room.
--
-- Three tables that existed as placeholders become tables the product writes to.
--
--   Goal               gains title/status/completedAt/createdAt/updatedAt. The
--                      original model had `description` only, which a list you
--                      can complete cannot be built from
--                      (07-goal-endpoints.md sec 1).
--   Memory             gains a nullable, UNIQUE goalId, and lets petId and
--                      imageUrl be null. The unique constraint is the duplicate
--                      -memory defence: a retried completion cannot make a
--                      second one.
--   EnvironmentObject  swaps x/y/rotation/scale for the grid cell the user
--                      actually chose (col/row) plus the type and the object's
--                      own definition, and gains a client-supplied `key` so a
--                      save can find the row a dragged object belongs to.
--
-- The NOT NULL columns added without defaults (Goal.title, EnvironmentObject
-- .key/type/col/row) and the four dropped columns are safe here and only here:
-- all three tables held zero rows when this was written, because no endpoint
-- had ever been able to write to them. Verified before generating, not assumed.
-- A later change to any of these must backfill instead.

-- DropForeignKey
ALTER TABLE "EnvironmentObject" DROP CONSTRAINT "EnvironmentObject_environmentId_fkey";

-- DropForeignKey
ALTER TABLE "EnvironmentObject" DROP CONSTRAINT "EnvironmentObject_objectId_fkey";

-- DropForeignKey
ALTER TABLE "Goal" DROP CONSTRAINT "Goal_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Memory" DROP CONSTRAINT "Memory_ownerId_fkey";

-- DropIndex
DROP INDEX "Goal_ownerId_idx";

-- DropIndex
DROP INDEX "Memory_ownerId_idx";

-- AlterTable
ALTER TABLE "EnvironmentObject" DROP COLUMN "rotation",
DROP COLUMN "scale",
DROP COLUMN "x",
DROP COLUMN "y",
ADD COLUMN     "col" INTEGER NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "definitionData" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "key" TEXT NOT NULL,
ADD COLUMN     "row" INTEGER NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "objectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'open',
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "description" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Memory" ADD COLUMN     "goalId" UUID,
ALTER COLUMN "petId" DROP NOT NULL,
ALTER COLUMN "description" SET DEFAULT '',
ALTER COLUMN "imageUrl" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EnvironmentObject_environmentId_key_key" ON "EnvironmentObject"("environmentId", "key");

-- CreateIndex
CREATE INDEX "Goal_ownerId_status_idx" ON "Goal"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Memory_goalId_key" ON "Memory"("goalId");

-- CreateIndex
CREATE INDEX "Memory_ownerId_createdAt_idx" ON "Memory"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "EnvironmentObject" ADD CONSTRAINT "EnvironmentObject_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentObject" ADD CONSTRAINT "EnvironmentObject_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "ObjectDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

