export const MANUAL_DELIVERY_CONFIRMED_NOTE = "人工确认成功签收";
export const AFTER_DELIVERY_REFUND_NOTE = "签收后退款";

export type ShipmentSyncTarget = {
  status: string;
  orderExceptionNote?: string | null;
};

export type ShipmentSyncBlock = {
  code: "SHIPMENT_CLOSED" | "SHIPMENT_SYNC_FINALIZED";
  reason: "CLOSED" | "MANUAL_DELIVERY_CONFIRMED" | "AFTER_DELIVERY_REFUND";
  message: string;
};

export function shipmentSyncBlock(target: ShipmentSyncTarget): ShipmentSyncBlock | null {
  if (target.status === "CLOSED") {
    return {
      code: "SHIPMENT_CLOSED",
      reason: "CLOSED",
      message: "订单已由售后结束，不再同步物流轨迹。",
    };
  }
  if (target.orderExceptionNote === MANUAL_DELIVERY_CONFIRMED_NOTE) {
    return {
      code: "SHIPMENT_SYNC_FINALIZED",
      reason: "MANUAL_DELIVERY_CONFIRMED",
      message: "订单已人工确认成功签收，不再同步物流轨迹。",
    };
  }
  if (target.orderExceptionNote === AFTER_DELIVERY_REFUND_NOTE) {
    return {
      code: "SHIPMENT_SYNC_FINALIZED",
      reason: "AFTER_DELIVERY_REFUND",
      message: "订单已登记签收后退款，不再同步物流轨迹。",
    };
  }
  return null;
}

export function isShipmentSyncAllowed(target: ShipmentSyncTarget) {
  return shipmentSyncBlock(target) === null;
}

export class ShipmentSyncBlockedError extends Error {
  readonly name = "ShipmentSyncBlockedError";

  constructor(readonly block: ShipmentSyncBlock) {
    super(block.message);
  }
}

export function assertShipmentSyncAllowed(target: ShipmentSyncTarget) {
  const block = shipmentSyncBlock(target);
  if (block) throw new ShipmentSyncBlockedError(block);
}
