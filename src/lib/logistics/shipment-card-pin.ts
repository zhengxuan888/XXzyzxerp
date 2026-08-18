export type PinnableShipmentCard = {
  id: string;
  isPinned: boolean;
  pinnedAt: string | null;
};

function pinnedTimestamp(value: string | null) {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

/**
 * Keeps the caller's existing dynamic order for unpinned cards while moving
 * personal pins to the front, newest pin first. The input array is never
 * mutated, so the same function can be used by the server and optimistic UI.
 */
export function sortPinnedShipmentCards<T extends PinnableShipmentCard>(rows: readonly T[]): T[] {
  return rows
    .map((row, originalIndex) => ({ row, originalIndex }))
    .sort((left, right) => {
      if (left.row.isPinned !== right.row.isPinned) return left.row.isPinned ? -1 : 1;
      if (left.row.isPinned) {
        const pinDelta = pinnedTimestamp(right.row.pinnedAt) - pinnedTimestamp(left.row.pinnedAt);
        if (pinDelta !== 0) return pinDelta;
      }
      return left.originalIndex - right.originalIndex;
    })
    .map(({ row }) => row);
}
