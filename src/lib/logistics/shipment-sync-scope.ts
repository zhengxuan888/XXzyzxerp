import { isShipmentSyncAllowed, type ShipmentSyncTarget } from "@/lib/logistics/shipment-sync-policy";

export type ShipmentSyncScopeCandidate = ShipmentSyncTarget & {
  id: string;
  trackingNo: string | null;
  canSync: boolean;
};

export type ShipmentSyncScope = {
  shipmentIds: string[];
  finalizedCount: number;
  missingTrackingNoCount: number;
};

export function buildShipmentSyncScope(candidates: ShipmentSyncScopeCandidate[]): ShipmentSyncScope {
  const shipmentIds: string[] = [];
  const seen = new Set<string>();
  let finalizedCount = 0;
  let missingTrackingNoCount = 0;

  for (const candidate of candidates) {
    if (!candidate.canSync || seen.has(candidate.id)) continue;
    seen.add(candidate.id);

    if (!isShipmentSyncAllowed(candidate)) {
      finalizedCount += 1;
      continue;
    }
    if (!candidate.trackingNo?.trim()) {
      missingTrackingNoCount += 1;
      continue;
    }
    shipmentIds.push(candidate.id);
  }

  return { shipmentIds, finalizedCount, missingTrackingNoCount };
}
