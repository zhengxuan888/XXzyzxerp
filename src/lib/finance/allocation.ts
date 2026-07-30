export type AllocationEffectLike = { amountCents: bigint };

export type AllocationWithEffects = {
  id: string;
  amountCents: bigint;
  effects?: AllocationEffectLike[];
};

/**
 * Financial corrections are append-only. A reversal therefore changes the
 * effective amount rather than rewriting the original allocation. A negative
 * effective balance is a data-integrity failure, never a value to clamp away.
 */
export function effectiveAllocationAmount(allocation: AllocationWithEffects) {
  const effectTotal = (allocation.effects ?? []).reduce((sum, effect) => sum + effect.amountCents, BigInt(0));
  if (effectTotal > allocation.amountCents) {
    throw new Error(`Allocation ${allocation.id} has reversal effects above its original amount.`);
  }
  return allocation.amountCents - effectTotal;
}

export function totalEffectiveAllocationAmount(allocations: AllocationWithEffects[]) {
  return allocations.reduce((sum, allocation) => sum + effectiveAllocationAmount(allocation), BigInt(0));
}
