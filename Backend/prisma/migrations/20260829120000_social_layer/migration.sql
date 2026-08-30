-- The social layer.
--
-- Six new tables and two altered ones. This is the schema expansion
-- 11-schema-additions.md sec 6 said had to be "proposed and approved
-- separately when social features are actually requested"; they were, and
-- 13-social-endpoints.md is the proposal.
--
--   User.usernameKey  username lowercased, UNIQUE. The constraint the whole
--                     discovery model rests on. A plain column rather than a
--                     unique index on lower(username) because Prisma cannot
--                     declare a functional index and the next `migrate dev`
--                     would drop it -- the same trap documented on
--                     FocusSession (11-schema-additions.md sec 6).
--
--                     BACKFILLED, not defaulted: the five existing rows get
--                     lower(username), and the ALTER that adds NOT NULL runs
--                     after the UPDATE. If two accounts already differed only
--                     in case this migration fails loudly, which is the right
--                     outcome -- it is a collision somebody has to resolve,
--                     not one to silently pick a winner for.
--
--   Memory.visibility 'private' | 'public', DEFAULT 'private'.
--
--                     Every existing row takes the default, and that is the
--                     load-bearing decision in this migration: a visibility
--                     system that ships by publishing what people wrote before
--                     it existed is a leak with a changelog entry. Nobody's
--                     memory becomes visible to anybody until its owner says
--                     so, one memory at a time.
--
--   Friendship        one row per relationship, not per direction. A request
--                     and a friendship are the same row at two points in its
--                     life, which is why there is no FriendRequest table.
--
--   Park              a temporary space that still needs a durable row, for
--                     three reasons: capacity is enforced by a row lock on it,
--                     a private park's scrypt hash must survive a restart, and
--                     discovery has to work between one client creating a park
--                     and another asking what is open.
--
--   ParkParticipant   membership, with a heartbeat. lastSeenAt is the whole
--                     disconnect story: a "leave" event is a courtesy, and a
--                     closed laptop sends nothing at all.
--
--   ParkMessage       what was said in a park. CASCADEs with it.
--   Conversation      the DM thread between two people, pair stored ordered
--                     so the unique constraint means "one thread per pair"
--                     rather than "one per pair per direction".
--   DirectMessage     kept, unlike a park's chatter.
--
-- Every foreign key to User is ON DELETE CASCADE, matching Goal and Memory:
-- deleting an account takes its side of every relationship with it.

-- AlterTable: User gains the key the social layer is looked up by.
ALTER TABLE "User" ADD COLUMN "usernameKey" TEXT;

UPDATE "User" SET "usernameKey" = lower("username") WHERE "usernameKey" IS NULL;

ALTER TABLE "User" ALTER COLUMN "usernameKey" SET NOT NULL;

CREATE UNIQUE INDEX "User_usernameKey_key" ON "User"("usernameKey");

-- AlterTable: memories become private by default, including every old one.
ALTER TABLE "Memory" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private';

CREATE INDEX "Memory_ownerId_visibility_createdAt_idx" ON "Memory"("ownerId", "visibility", "createdAt");

-- CreateTable
CREATE TABLE "Friendship" (
    "id" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "addresseeId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");
CREATE INDEX "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");
CREATE INDEX "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");

ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Park" (
    "id" UUID NOT NULL,
    "hostId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 6,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "passcodeHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Park_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Park_visibility_createdAt_idx" ON "Park"("visibility", "createdAt");
CREATE INDEX "Park_hostId_idx" ON "Park"("hostId");

ALTER TABLE "Park" ADD CONSTRAINT "Park_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ParkParticipant" (
    "id" UUID NOT NULL,
    "parkId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParkParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParkParticipant_parkId_userId_key" ON "ParkParticipant"("parkId", "userId");
CREATE INDEX "ParkParticipant_parkId_idx" ON "ParkParticipant"("parkId");
CREATE INDEX "ParkParticipant_userId_idx" ON "ParkParticipant"("userId");
CREATE INDEX "ParkParticipant_lastSeenAt_idx" ON "ParkParticipant"("lastSeenAt");

ALTER TABLE "ParkParticipant" ADD CONSTRAINT "ParkParticipant_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParkParticipant" ADD CONSTRAINT "ParkParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ParkMessage" (
    "id" UUID NOT NULL,
    "parkId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParkMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ParkMessage_parkId_createdAt_idx" ON "ParkMessage"("parkId", "createdAt");

ALTER TABLE "ParkMessage" ADD CONSTRAINT "ParkMessage_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParkMessage" ADD CONSTRAINT "ParkMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "userAId" UUID NOT NULL,
    "userBId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Conversation_userAId_userBId_key" ON "Conversation"("userAId", "userBId");
CREATE INDEX "Conversation_userAId_lastMessageAt_idx" ON "Conversation"("userAId", "lastMessageAt");
CREATE INDEX "Conversation_userBId_lastMessageAt_idx" ON "Conversation"("userBId", "lastMessageAt");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DirectMessage_conversationId_createdAt_idx" ON "DirectMessage"("conversationId", "createdAt");

ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
