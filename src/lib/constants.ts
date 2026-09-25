export const OrderStatus = {
  PAID: "PAID",
  IN_PROGRESS: "IN_PROGRESS",
  DELIVERED: "DELIVERED",
  COMPLETED: "COMPLETED",
  DISPUTED: "DISPUTED",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ActorRole = {
  BUYER: "BUYER",
  SELLER: "SELLER",
  SYSTEM: "SYSTEM",
} as const;
export type ActorRole = (typeof ActorRole)[keyof typeof ActorRole];

/** State machine: status -> daftar status tujuan yang sah. */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PAID: [OrderStatus.IN_PROGRESS],
  IN_PROGRESS: [OrderStatus.DELIVERED],
  DELIVERED: [OrderStatus.COMPLETED, OrderStatus.DISPUTED],
  COMPLETED: [],
  DISPUTED: [],
};
