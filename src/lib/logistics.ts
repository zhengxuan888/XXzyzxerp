import type { LogisticsIssueSeverity, ShipmentStatus } from "@prisma/client";

const EVENT_STATUS = {
  SHIPMENT_CREATED: "PENDING",
  PICKED_UP: "IN_TRANSIT",
  IN_TRANSIT: "IN_TRANSIT",
  DELIVERED: "DELIVERED",
  EXCEPTION: "EXCEPTION",
  CANCELED: "CANCELLED",
} as const satisfies Record<string, ShipmentStatus>;

export type ShipmentEventInput = {
  eventType: keyof typeof EVENT_STATUS;
  status: ShipmentStatus;
  occurredAt: Date;
  memo: string | null;
  exceptionReason: string | null;
  exceptionSeverity: LogisticsIssueSeverity | null;
};

export function parseShipmentEventPayload(body: unknown): ShipmentEventInput {
  if (!body || typeof body !== "object") throw new Error("INVALID_SHIPMENT_EVENT");
  const value = body as Record<string, unknown>;
  const eventType = typeof value.eventType === "string" ? value.eventType.trim().toUpperCase() : "";
  if (!(eventType in EVENT_STATUS)) throw new Error("INVALID_SHIPMENT_EVENT_TYPE");
  const occurredAt = value.occurredAt ? new Date(String(value.occurredAt)) : new Date();
  if (Number.isNaN(occurredAt.getTime())) throw new Error("INVALID_OCCURRED_AT");
  const severity = value.exceptionSeverity == null ? null : String(value.exceptionSeverity).toUpperCase();
  if (severity !== null && !["LOW", "MEDIUM", "HIGH"].includes(severity)) throw new Error("INVALID_EXCEPTION_SEVERITY");
  const exceptionReason = typeof value.exceptionReason === "string" ? value.exceptionReason.trim() : null;
  if (eventType === "EXCEPTION" && !exceptionReason) throw new Error("EXCEPTION_REASON_REQUIRED");
  return {
    eventType: eventType as keyof typeof EVENT_STATUS,
    status: EVENT_STATUS[eventType as keyof typeof EVENT_STATUS],
    occurredAt,
    memo: typeof value.memo === "string" ? value.memo.trim() || null : null,
    exceptionReason,
    exceptionSeverity: severity as LogisticsIssueSeverity | null,
  };
}
