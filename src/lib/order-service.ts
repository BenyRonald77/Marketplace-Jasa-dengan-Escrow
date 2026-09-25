import { prisma } from "@/lib/prisma";
import { ActorRole, ALLOWED_TRANSITIONS, OrderStatus } from "@/lib/constants";

export class OrderError extends Error {}
export class InvalidTransitionError extends OrderError {}
export class InsufficientBalanceError extends OrderError {}

function getAutoReleaseDays(): number {
  return Number(process.env.AUTO_RELEASE_DAYS ?? 3);
}

export async function createService(params: {
  sellerId: string;
  title: string;
  description: string;
  price: number;
}) {
  if (params.price <= 0) throw new OrderError("Harga harus lebih dari 0");
  return prisma.service.create({ data: params });
}

export async function listActiveServices() {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    include: { seller: { select: { name: true } } },
  });
  return services.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    price: s.price,
    sellerName: s.seller.name,
    sellerId: s.sellerId,
  }));
}

/**
 * Pembeli memesan & membayar jasa. Saldo pembeli dikurangi lewat UPDATE
 * atomik bersyarat (mencegah saldo minus di bawah concurrency, pola sama
 * seperti proyek Dompet Digital). Dana TIDAK masuk ke saldo penjual di
 * sini — tertahan di escrow sampai order berstatus COMPLETED.
 */
export async function placeOrder(params: { buyerId: string; serviceId: string }) {
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.findUnique({ where: { id: params.serviceId } });
    if (!service || !service.isActive) throw new OrderError("Jasa tidak ditemukan/tidak aktif");
    if (service.sellerId === params.buyerId) {
      throw new OrderError("Tidak bisa memesan jasa Anda sendiri");
    }

    const debited = await tx.user.updateMany({
      where: { id: params.buyerId, balance: { gte: service.price } },
      data: { balance: { decrement: service.price } },
    });
    if (debited.count === 0) throw new InsufficientBalanceError("Saldo tidak cukup");

    const order = await tx.order.create({
      data: {
        serviceId: service.id,
        buyerId: params.buyerId,
        sellerId: service.sellerId,
        amount: service.price,
        status: OrderStatus.PAID,
      },
    });

    await tx.orderAuditLog.create({
      data: {
        orderId: order.id,
        fromStatus: "NONE",
        toStatus: OrderStatus.PAID,
        actorId: params.buyerId,
        actorRole: ActorRole.BUYER,
        note: "Order dibuat, dana ditahan di escrow",
      },
    });

    return order;
  });
}

function assertTransitionAllowed(from: OrderStatus, to: OrderStatus) {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new InvalidTransitionError(`Transisi ${from} → ${to} tidak diizinkan`);
  }
}

export async function markInProgress(orderId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderError("Order tidak ditemukan");
    if (order.sellerId !== actorId) throw new OrderError("Hanya penjual yang bisa memulai pengerjaan");
    assertTransitionAllowed(order.status as OrderStatus, OrderStatus.IN_PROGRESS);

    const updated = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.PAID },
      data: { status: OrderStatus.IN_PROGRESS },
    });
    if (updated.count === 0) throw new InvalidTransitionError("Status order sudah berubah, coba muat ulang");

    await tx.orderAuditLog.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: OrderStatus.IN_PROGRESS,
        actorId,
        actorRole: ActorRole.SELLER,
      },
    });

    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  });
}

export async function markDelivered(orderId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderError("Order tidak ditemukan");
    if (order.sellerId !== actorId) throw new OrderError("Hanya penjual yang bisa mengirim hasil kerja");
    assertTransitionAllowed(order.status as OrderStatus, OrderStatus.DELIVERED);

    const now = new Date();
    const autoReleaseAt = new Date(now.getTime() + getAutoReleaseDays() * 24 * 60 * 60 * 1000);

    const updated = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.IN_PROGRESS },
      data: { status: OrderStatus.DELIVERED, deliveredAt: now, autoReleaseAt },
    });
    if (updated.count === 0) throw new InvalidTransitionError("Status order sudah berubah, coba muat ulang");

    await tx.orderAuditLog.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: OrderStatus.DELIVERED,
        actorId,
        actorRole: ActorRole.SELLER,
        note: `Auto-release terjadwal ${autoReleaseAt.toISOString()}`,
      },
    });

    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  });
}

/** Melepas dana escrow ke penjual. Dipakai buyer (manual) & job auto-release (sistem). */
async function releaseEscrow(
  orderId: string,
  actor: { id: string | null; role: (typeof ActorRole)[keyof typeof ActorRole] },
  note?: string,
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderError("Order tidak ditemukan");
    assertTransitionAllowed(order.status as OrderStatus, OrderStatus.COMPLETED);

    const updated = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.DELIVERED },
      data: { status: OrderStatus.COMPLETED, completedAt: new Date() },
    });
    if (updated.count === 0) throw new InvalidTransitionError("Status order sudah berubah, coba muat ulang");

    await tx.user.update({
      where: { id: order.sellerId },
      data: { balance: { increment: order.amount } },
    });

    await tx.orderAuditLog.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: OrderStatus.COMPLETED,
        actorId: actor.id,
        actorRole: actor.role,
        note: note ?? "Dana escrow dicairkan ke penjual",
      },
    });

    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  });
}

export async function completeOrder(orderId: string, actorId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new OrderError("Order tidak ditemukan");
  if (order.buyerId !== actorId) throw new OrderError("Hanya pembeli yang bisa menyelesaikan order");
  return releaseEscrow(orderId, { id: actorId, role: ActorRole.BUYER });
}

export async function disputeOrder(orderId: string, actorId: string, note?: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderError("Order tidak ditemukan");
    if (order.buyerId !== actorId) throw new OrderError("Hanya pembeli yang bisa mengajukan sengketa");
    assertTransitionAllowed(order.status as OrderStatus, OrderStatus.DISPUTED);

    const updated = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.DELIVERED },
      data: { status: OrderStatus.DISPUTED },
    });
    if (updated.count === 0) throw new InvalidTransitionError("Status order sudah berubah, coba muat ulang");

    await tx.orderAuditLog.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: OrderStatus.DISPUTED,
        actorId,
        actorRole: ActorRole.BUYER,
        note: note ?? "Pembeli mengajukan sengketa",
      },
    });

    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  });
}

/**
 * Job auto-release: order DELIVERED yang sudah lewat autoReleaseAt dan
 * belum di-dispute otomatis diselesaikan atas nama sistem. Idempotent by
 * construction — begitu sebuah order jadi COMPLETED, query berikutnya
 * tidak akan menemukannya lagi.
 */
export async function autoReleaseDueOrders() {
  const due = await prisma.order.findMany({
    where: { status: OrderStatus.DELIVERED, autoReleaseAt: { lte: new Date() } },
    select: { id: true },
  });

  const results: { orderId: string; ok: boolean; error?: string }[] = [];
  for (const { id } of due) {
    try {
      await releaseEscrow(id, { id: null, role: ActorRole.SYSTEM }, "Auto-release: batas waktu tercapai");
      results.push({ orderId: id, ok: true });
    } catch (error) {
      results.push({ orderId: id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { processed: results.length, results };
}

export async function listOrdersForUser(userId: string) {
  const orders = await prisma.order.findMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    orderBy: { createdAt: "desc" },
    include: {
      service: { select: { title: true } },
      buyer: { select: { name: true } },
      seller: { select: { name: true } },
    },
  });

  return orders.map((o) => ({
    id: o.id,
    serviceTitle: o.service.title,
    amount: o.amount,
    status: o.status,
    buyerName: o.buyer.name,
    sellerName: o.seller.name,
    isBuyer: o.buyerId === userId,
    isSeller: o.sellerId === userId,
    autoReleaseAt: o.autoReleaseAt,
    createdAt: o.createdAt,
  }));
}

export async function getOrderDetail(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      service: { select: { title: true, description: true } },
      buyer: { select: { name: true } },
      seller: { select: { name: true } },
      auditLogs: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) return null;
  if (order.buyerId !== userId && order.sellerId !== userId) {
    throw new OrderError("Anda tidak berhak melihat order ini");
  }
  return order;
}
