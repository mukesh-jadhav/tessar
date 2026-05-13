/*
  Warnings:

  - You are about to drop the column `userId` on the `runs` table. All the data in the column will be lost.
  - Added the required column `user_id` to the `runs` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "runs" DROP CONSTRAINT "runs_userId_fkey";

-- DropIndex
DROP INDEX "runs_userId_created_at_idx";

-- AlterTable
ALTER TABLE "runs" DROP COLUMN "userId",
ADD COLUMN     "user_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "runs_user_id_created_at_idx" ON "runs"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
