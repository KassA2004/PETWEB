-- Focus sessions, and how the creature feels about you.
--
--   FocusSession  new table. One stretch of time committed to one goal:
--                 startedAt + durationMinutes IS the timer (12-focus-endpoints
--                 .md sec 5), and status records what became of it. goalId is
--                 nullable with ON DELETE SET NULL for the same reason
--                 Memory.goalId is: an afternoon somebody spent survives the
--                 task it was spent on.
--
--   User          gains affection (0..1), affectionAt and lastFollowThroughAt.
--                 On the user, not on the pet: Pet rows are saved presets a
--                 user may have none of and may delete, and a relationship
--                 must not reset because somebody re-saved their creature with
--                 different ears (11-schema-additions.md sec 6).
--
-- All three User columns are additive and defaulted, so existing rows take
-- affection 0.5 -- "neutral", which is where a relationship that has not
-- happened yet honestly sits. lastFollowThroughAt stays NULL, and the decay
-- rule reads NULL as "nothing to decay from" rather than as "never turned up".
--
-- No partial unique index enforcing one active session per user, deliberately.
-- Postgres would express it in a line, and Prisma cannot declare it, so the
-- next `migrate dev` would generate a migration dropping it again. The rule is
-- counted inside the transaction that inserts instead, exactly like the
-- six-goal cap (goals/goal-limit.ts).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "affection" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
ADD COLUMN     "affectionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastFollowThroughAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FocusSession" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "goalId" UUID,
    "durationMinutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "FocusSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FocusSession_ownerId_status_idx" ON "FocusSession"("ownerId", "status");

-- CreateIndex
CREATE INDEX "FocusSession_ownerId_startedAt_idx" ON "FocusSession"("ownerId", "startedAt");

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
