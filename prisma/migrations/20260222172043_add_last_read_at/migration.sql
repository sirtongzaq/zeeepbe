-- DropIndex
DROP INDEX "Message_chatRoomId_idx";

-- AlterTable
ALTER TABLE "ChatParticipant" ADD COLUMN     "lastReadAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ChatParticipant_chatRoomId_idx" ON "ChatParticipant"("chatRoomId");

-- CreateIndex
CREATE INDEX "Message_chatRoomId_createdAt_idx" ON "Message"("chatRoomId", "createdAt");
