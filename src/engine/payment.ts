import { CONFIG } from './config';
import type { IfThenOrder } from './types';

/** Amount held on the passenger's account when the order is placed. */
export function blockAmount(order: Pick<IfThenOrder, 'maxPricePerSeat' | 'travellers' | 'payment'>): number {
  const full = order.maxPricePerSeat * order.travellers.length;
  return order.payment === 'fullBlock' ? full : Math.round(full * CONFIG.payments.depositRate);
}

/** Split a block after the market: capture what is owed (up to the block), release the rest. */
export function settle(blocked: number, charge: number) {
  const captured = Math.min(blocked, charge);
  return { captured, released: blocked - captured, balanceDue: charge - captured };
}
