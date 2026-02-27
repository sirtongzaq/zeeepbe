-- AlterTable
ALTER TABLE "ChatRoom" ADD COLUMN     "lastMessageAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ChatRoom_lastMessageAt_idx" ON "ChatRoom"("lastMessageAt");
