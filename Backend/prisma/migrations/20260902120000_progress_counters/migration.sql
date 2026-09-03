-- The rewarding system's three counters.
--
-- What a user has actually done, kept on the row rather than aggregated on
-- demand. They gate the locked half of the object catalog and they are shown
-- to visitors on somebody's stats tab, so they are read far more often than
-- they are written -- which is the whole argument for storing them.
--
--   focusMinutes    minutes served, summed over completed sessions
--   goalsCompleted  goals finished, less any that were reopened
--   memoriesShared  memories public RIGHT NOW
--
-- BACKFILLED, not merely defaulted. Every one of the three is derivable from
-- rows that already exist, and shipping them at zero would tell somebody with
-- forty hours of focus behind them that they had done nothing -- which is the
-- one way a progress system can lose a user on the day it launches. The three
-- UPDATEs below are exactly the aggregates the counters replace, run once.
--
-- Note what `memoriesShared` is backfilled from: `visibility = 'public'`, the
-- column the social migration defaulted every pre-existing row to 'private'.
-- So a user who has never opened the sharing control starts at zero, which is
-- correct -- they have not shared anything.

ALTER TABLE "User"
  ADD COLUMN "focusMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "goalsCompleted" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "memoriesShared" INTEGER NOT NULL DEFAULT 0;

UPDATE "User" AS u
SET "focusMinutes" = COALESCE(served.total, 0)
FROM (
  SELECT "ownerId", SUM("durationMinutes")::int AS total
  FROM "FocusSession"
  WHERE "status" = 'completed'
  GROUP BY "ownerId"
) AS served
WHERE u."id" = served."ownerId";

UPDATE "User" AS u
SET "goalsCompleted" = COALESCE(done.total, 0)
FROM (
  SELECT "ownerId", COUNT(*)::int AS total
  FROM "Goal"
  WHERE "status" = 'completed'
  GROUP BY "ownerId"
) AS done
WHERE u."id" = done."ownerId";

UPDATE "User" AS u
SET "memoriesShared" = COALESCE(shared.total, 0)
FROM (
  SELECT "ownerId", COUNT(*)::int AS total
  FROM "Memory"
  WHERE "visibility" = 'public'
  GROUP BY "ownerId"
) AS shared
WHERE u."id" = shared."ownerId";
