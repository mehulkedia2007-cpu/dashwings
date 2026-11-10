import { CONFIG } from './config';
import type { MarketRun, PaymentMode } from './types';

export interface Bid {
  id: string;
  seats: number;
  maxPricePerSeat: number;
  payment: PaymentMode;
  placedAt: string;
}

export interface ClearResult {
  winners: Bid[];
  clearingPrice: number | null;
  seatsSold: number;
  revenue: number;
}

/** Uniform-price clearing for one flight (rules 6.6 steps 2–5). */
export function clearFlight(bids: Bid[], seats: number, floorPrice: number): ClearResult {
  const ranked = bids
    .filter((b) => b.maxPricePerSeat >= floorPrice)
    .sort(
      (a, b) =>
        b.maxPricePerSeat - a.maxPricePerSeat ||
        Number(a.payment === 'deposit') - Number(b.payment === 'deposit') ||
        a.placedAt.localeCompare(b.placedAt),
    );

  const winners: Bid[] = [];
  let left = seats;
  for (const b of ranked) {
    if (b.seats <= left) {
      winners.push(b); // groups are all-or-nothing; a group that does not fit is skipped
      left -= b.seats;
    }
  }

  if (!winners.length) return { winners, clearingPrice: null, seatsSold: 0, revenue: 0 };
  const clearingPrice = Math.min(...winners.map((w) => w.maxPricePerSeat));
  const seatsSold = seats - left;
  return { winners, clearingPrice, seatsSold, revenue: clearingPrice * seatsSold };
}

export interface MarketFlight {
  flightId: string;
  departure: string;
  seatsReleased: number;
  floorPrice: number;
}

export interface MarketBid extends Bid {
  usableFlightIds: string[];
}

export interface OrderOutcome {
  status: 'won' | 'notWon';
  flightId?: string;
  pricePerSeat?: number;
  charge: number; // amount to capture; everything else blocked is released
}

/** Runs every flight in departure order; losers roll on to their next usable flight (rule 6.6). */
export function runMarket(flights: MarketFlight[], bids: MarketBid[], ranAt: string) {
  const runs: MarketRun[] = [];
  const outcomes: Record<string, OrderOutcome> = {};

  for (const f of [...flights].sort((a, b) => a.departure.localeCompare(b.departure))) {
    const open = bids.filter((b) => !outcomes[b.id] && b.usableFlightIds.includes(f.flightId));
    const r = clearFlight(open, f.seatsReleased, f.floorPrice);
    for (const w of r.winners) {
      outcomes[w.id] = { status: 'won', flightId: f.flightId, pricePerSeat: r.clearingPrice!, charge: r.clearingPrice! * w.seats };
    }
    runs.push({
      id: `${f.flightId}@${ranAt}`,
      flightId: f.flightId,
      ranAt,
      seatsReleased: f.seatsReleased,
      floorPrice: f.floorPrice,
      clearingPrice: r.clearingPrice,
      winners: r.winners.map((w) => w.id),
      seatsSold: r.seatsSold,
      revenue: r.revenue,
      commission: Math.round(r.revenue * CONFIG.market.commissionRate),
    });
  }

  for (const b of bids) outcomes[b.id] ??= { status: 'notWon', charge: 0 };
  return { runs, outcomes };
}
