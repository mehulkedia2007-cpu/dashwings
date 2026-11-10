import type { IfThenOrder, PnrStatus } from './types';

export interface TriggerResult {
  status: 'inMarket' | 'trainConfirmed';
  seats: number; // seats the order asks for in the market
}

/**
 * Decide what happens to an active order once the chart reveals `finalOutcome`.
 * 'trainConfirmed' means close the order and release the block.
 */
export function triggerOrder(
  order: Pick<IfThenOrder, 'travellers' | 'racCountsAsFailed' | 'groupTrigger'>,
  finalOutcome: PnrStatus[],
): TriggerResult {
  const leftOut = finalOutcome.map((s) => s === 'WL' || (s === 'RAC' && order.racCountsAsFailed));
  const triggered = order.groupTrigger === 'anyLeftOut' ? leftOut.some(Boolean) : leftOut.length > 0 && leftOut.every(Boolean);
  return { status: triggered ? 'inMarket' : 'trainConfirmed', seats: order.travellers.length };
}
