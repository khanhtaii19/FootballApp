import prisma from "../lib/prisma.js";
import { findActiveZoneOverlap } from "../lib/zone-overlap.js";
import type { CreateBlockInput } from "../validators/blocks.validator.js";

export class BlockError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "BlockError";
  }
}

async function resolveZone(input: CreateBlockInput) {
  if (input.zoneId) {
    const zone = await prisma.zone.findUnique({ where: { id: input.zoneId } });
    if (!zone) {
      throw new BlockError("Không tìm thấy vùng sân", 404);
    }
    return zone;
  }

  const zone = await prisma.zone.findUnique({
    where: { name: input.zoneName! },
  });
  if (!zone) {
    throw new BlockError("Không tìm thấy vùng sân", 404);
  }
  return zone;
}

export async function createBlock(ownerId: string, input: CreateBlockInput) {
  const zone = await resolveZone(input);
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);

  const overlap = await findActiveZoneOverlap([zone.id], startsAt, endsAt);
  if (overlap) {
    throw new BlockError(
      `Vùng ${overlap.zone.name} đã bận trong khoảng thời gian này`,
      409
    );
  }

  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        userId: ownerId,
        fieldType: "block",
        startsAt,
        endsAt,
        status: "confirmed",
        totalAmount: 0,
        deposit: 0,
        note: input.note,
      },
    });

    await tx.bookingZone.create({
      data: {
        bookingId: booking.id,
        zoneId: zone.id,
        startsAt,
        endsAt,
        isActive: true,
      },
    });

    return tx.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: {
        bookingZones: {
          include: { zone: { select: { id: true, name: true, surface: true } } },
        },
      },
    });
  });
}

export async function listBlocks(from?: Date, to?: Date) {
  return prisma.booking.findMany({
    where: {
      fieldType: "block",
      status: { in: ["confirmed", "pending"] },
      ...(from || to
        ? {
            AND: [
              from ? { endsAt: { gt: from } } : {},
              to ? { startsAt: { lt: to } } : {},
            ],
          }
        : {}),
    },
    orderBy: { startsAt: "asc" },
    include: {
      bookingZones: {
        include: { zone: { select: { id: true, name: true, surface: true } } },
      },
    },
  });
}

export async function cancelBlock(blockId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: blockId },
    include: { bookingZones: true },
  });

  if (!booking || booking.fieldType !== "block") {
    throw new BlockError("Không tìm thấy lịch khóa", 404);
  }

  if (booking.status === "cancelled") {
    throw new BlockError("Lịch khóa đã được hủy trước đó", 400);
  }

  return prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: blockId },
      data: { status: "cancelled" },
    });

    await tx.bookingZone.updateMany({
      where: { bookingId: blockId },
      data: { isActive: false },
    });

    return tx.booking.findUniqueOrThrow({
      where: { id: blockId },
      include: {
        bookingZones: {
          include: { zone: { select: { id: true, name: true, surface: true } } },
        },
      },
    });
  });
}
