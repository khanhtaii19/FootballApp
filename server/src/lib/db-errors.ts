import { Prisma } from "@prisma/client";

/**
 * Nhận diện lỗi vi phạm exclusion constraint `no_overlap` của Postgres
 * (SQLSTATE 23P01). Không coi P2002 (unique) là trùng lịch.
 */
export function isOverlapConstraintError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const pgCode = (error.meta as { code?: string } | undefined)?.code;
    if (pgCode === "23P01") return true;
  }
  if (error instanceof Error) {
    return (
      error.message.includes("no_overlap") ||
      error.message.includes("23P01") ||
      error.message.includes("exclusion constraint")
    );
  }
  return false;
}
