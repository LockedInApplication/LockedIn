CREATE TABLE "RoomTalkRemovedStarterShelf" (
    "relationshipId" TEXT NOT NULL,
    "starterShelf" "RoomTalkStarterShelf" NOT NULL,
    CONSTRAINT "RoomTalkRemovedStarterShelf_pkey" PRIMARY KEY ("relationshipId", "starterShelf")
);

ALTER TABLE "RoomTalkRemovedStarterShelf" ADD CONSTRAINT "RoomTalkRemovedStarterShelf_relationshipId_fkey"
    FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
