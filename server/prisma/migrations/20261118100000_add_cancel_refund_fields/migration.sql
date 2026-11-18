-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "cancelled_at" TIMESTAMPTZ,
ADD COLUMN     "refund_amount" INTEGER NOT NULL DEFAULT 0;
