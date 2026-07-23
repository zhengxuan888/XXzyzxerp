import type { OrderStatus } from "@prisma/client";

export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["DRAFT", "WAITING_SHIPMENT", "CANCELLED"],
  WAITING_SHIPMENT: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "EXCEPTION"],
  DELIVERED: ["COMPLETED"],
  EXCEPTION: ["SHIPPED", "WAITING_SHIPMENT", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus) {
  return ORDER_TRANSITIONS[from].includes(to);
}
