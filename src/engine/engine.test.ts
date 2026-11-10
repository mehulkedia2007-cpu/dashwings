import { describe, expect, it } from 'vitest';
import { chartTime } from './chartTime';
import { checkEligibility, type EligibilityInput } from './eligibility';
import { seatsReleased, usableFlightIds } from './flights';
import { clearFlight, runMarket, type Bid, type MarketBid } from './market';
import { triggerOrder } from './trigger';
import type { Flight, ReleaseRule, StationAirport, TrainBooking } from './types';

const ist = (s: string) => new Date(`${s}+05:30`).toISOString();

let n = 0;
const bid = (maxPricePerSeat: number, seats = 1, extra: Partial<Bid> = {}): Bid => ({
  id: extra.id ?? `o${++n}`,
  seats,
  maxPricePerSeat,
  payment: 'fullBlock',
  placedAt: ist(`2026-11-10T10:${String(n).padStart(2, '0')}:00`),
  ...extra,
});

describe('chart time (6.1)', () => {
  it('06:10 departure -> 21:00 previous day', () => {
    expect(chartTime(ist('2026-11-12T06:10:00'))).toBe(ist('2026-11-11T21:00:00'));
  });
  it('22:30 departure -> 14:30 same day', () => {
    expect(chartTime(ist('2026-11-12T22:30:00'))).toBe(ist('2026-11-12T14:30:00'));
  });
  it('14:00 is outside the morning band -> 8 hours before', () => {
    expect(chartTime(ist('2026-11-12T14:00:00'))).toBe(ist('2026-11-12T06:00:00'));
  });
  it('a 02:00 departure crosses midnight', () => {
    expect(chartTime(ist('2026-11-12T02:00:00'))).toBe(ist('2026-11-11T18:00:00'));
  });
});

describe('market clearing (6.6)', () => {
  it('basic: top three win at 3,600; below-floor order dropped', () => {
    const bids = [5000, 4200, 3600, 3300, 2800].map((p) => bid(p));
    const r = clearFlight(bids, 3, 3000);
    expect(r.winners.map((w) => w.maxPricePerSeat)).toEqual([5000, 4200, 3600]);
    expect(r.clearingPrice).toBe(3600);
    expect(r.revenue).toBe(10_800);
  });

  it('fewer orders than seats: both win at 3,500', () => {
    const r = clearFlight([bid(4000), bid(3500)], 5, 3000);
    expect(r.winners).toHaveLength(2);
    expect(r.clearingPrice).toBe(3500);
    expect(r.seatsSold).toBe(2);
    expect(r.revenue).toBe(7000);
  });

  it('no valid orders: price null, nothing sold', () => {
    const r = clearFlight([bid(2000), bid(2500)], 3, 3000);
    expect(r).toEqual({ winners: [], clearingPrice: null, seatsSold: 0, revenue: 0 });
    expect(clearFlight([], 3, 3000).clearingPrice).toBeNull();
  });

  it('group skip: A and C win, B skipped, price 4,000', () => {
    const r = clearFlight([bid(5000, 1, { id: 'A' }), bid(4500, 4, { id: 'B' }), bid(4000, 2, { id: 'C' })], 3, 3000);
    expect(r.winners.map((w) => w.id)).toEqual(['A', 'C']);
    expect(r.clearingPrice).toBe(4000);
    expect(r.revenue).toBe(12_000);
  });

  it('tie: full block beats deposit, then earlier order wins', () => {
    const early = ist('2026-11-10T09:00:00');
    const late = ist('2026-11-10T11:00:00');
    const dep = bid(4000, 1, { id: 'deposit-early', payment: 'deposit', placedAt: early });
    const full = bid(4000, 1, { id: 'full-late', placedAt: late });
    expect(clearFlight([dep, full], 1, 3000).winners.map((w) => w.id)).toEqual(['full-late']);

    const a = bid(4000, 1, { id: 'later', placedAt: late });
    const b = bid(4000, 1, { id: 'earlier', placedAt: early });
    expect(clearFlight([a, b], 1, 3000).winners.map((w) => w.id)).toEqual(['earlier']);
  });

  it('roll-over: loser on first flight wins on a later usable flight', () => {
    const flights = [
      { flightId: 'F2', departure: ist('2026-11-12T12:00:00'), seatsReleased: 1, floorPrice: 3000 },
      { flightId: 'F1', departure: ist('2026-11-12T08:00:00'), seatsReleased: 1, floorPrice: 3000 },
    ];
    const both = ['F1', 'F2'];
    const bids: MarketBid[] = [
      { ...bid(5000, 1, { id: 'high' }), usableFlightIds: both },
      { ...bid(4000, 1, { id: 'mid' }), usableFlightIds: both },
      { ...bid(3500, 1, { id: 'low' }), usableFlightIds: both },
    ];
    const { runs, outcomes } = runMarket(flights, bids, ist('2026-11-11T21:30:00'));
    expect(runs.map((r) => r.flightId)).toEqual(['F1', 'F2']);
    expect(outcomes.high).toMatchObject({ status: 'won', flightId: 'F1', pricePerSeat: 5000, charge: 5000 });
    expect(outcomes.mid).toMatchObject({ status: 'won', flightId: 'F2', pricePerSeat: 4000 });
    expect(outcomes.low).toEqual({ status: 'notWon', charge: 0 });
    expect(runs[0].commission).toBe(400); // 8% of 5,000
  });

  it('roll-over only to flights the order can use', () => {
    const flights = [
      { flightId: 'F1', departure: ist('2026-11-12T08:00:00'), seatsReleased: 1, floorPrice: 3000 },
      { flightId: 'F2', departure: ist('2026-11-12T12:00:00'), seatsReleased: 1, floorPrice: 3000 },
    ];
    const bids: MarketBid[] = [
      { ...bid(5000, 1, { id: 'a' }), usableFlightIds: ['F1'] },
      { ...bid(4000, 1, { id: 'b' }), usableFlightIds: ['F1'] },
    ];
    const { outcomes, runs } = runMarket(flights, bids, ist('2026-11-11T21:30:00'));
    expect(outcomes.b.status).toBe('notWon');
    expect(runs[1].clearingPrice).toBeNull();
  });
});

describe('trigger (6.3)', () => {
  const two = [{ nameOnId: 'A' }, { nameOnId: 'B' }];
  it('all confirmed -> trainConfirmed', () => {
    expect(triggerOrder({ travellers: two, racCountsAsFailed: false, groupTrigger: 'anyLeftOut' }, ['CNF', 'CNF']).status).toBe('trainConfirmed');
  });
  it('WL left -> inMarket with seats = travellers', () => {
    expect(triggerOrder({ travellers: two, racCountsAsFailed: false, groupTrigger: 'anyLeftOut' }, ['WL', 'CNF'])).toEqual({ status: 'inMarket', seats: 2 });
  });
  it('allLeftOut needs every passenger left out', () => {
    expect(triggerOrder({ travellers: two, racCountsAsFailed: false, groupTrigger: 'allLeftOut' }, ['WL', 'CNF']).status).toBe('trainConfirmed');
    expect(triggerOrder({ travellers: two, racCountsAsFailed: false, groupTrigger: 'allLeftOut' }, ['WL', 'WL']).status).toBe('inMarket');
  });
  it('RAC triggers only when opted in', () => {
    const o = { travellers: [{ nameOnId: 'A' }], groupTrigger: 'anyLeftOut' as const };
    expect(triggerOrder({ ...o, racCountsAsFailed: false }, ['RAC']).status).toBe('trainConfirmed');
    expect(triggerOrder({ ...o, racCountsAsFailed: true }, ['RAC']).status).toBe('inMarket');
  });
});

const map: StationAirport[] = [
  { station: 'Sample Central', airport: 'HYD', distanceKm: 30, travelMinutes: 60 },
  { station: 'Sample Junction', airport: 'DEL', distanceKm: 15, travelMinutes: 45 },
  { station: 'Remote Halt', airport: 'DEL', distanceKm: 340, travelMinutes: 400 },
];

const flight = (id: string, departure: string, extra: Partial<Flight> = {}): Flight => ({
  id,
  flightNo: `XX ${id}`,
  fromAirport: 'HYD',
  toAirport: 'DEL',
  departure,
  arrival: departure,
  capacity: 180,
  sold: 100,
  publicFare: 7500,
  cabinBagKg: 7,
  checkInBagKg: 15,
  ...extra,
});

describe('eligibility (6.2)', () => {
  const booking: TrainBooking = {
    pnr: '1234567890',
    trainName: 'Sample Express 1',
    fromStation: 'Sample Central',
    toStation: 'Sample Junction',
    departure: ist('2026-11-20T22:30:00'),
    trainClass: '3A',
    bookedAt: ist('2026-11-01T10:00:00'),
    passengers: [
      { name: 'Asha', statusAtBooking: 'WL 20', currentStatus: 'WL 8' },
      { name: 'Ravi', statusAtBooking: 'WL 21', currentStatus: 'WL 9' },
    ],
    confirmChanceAtBooking: 0.5,
    confirmChanceNow: 0.3,
    finalOutcome: ['WL', 'WL'],
  };
  const base: EligibilityInput = {
    booking,
    travellers: [{ nameOnId: 'Asha' }],
    racCountsAsFailed: false,
    now: ist('2026-11-15T10:00:00'),
    stationAirports: map,
    flights: [flight('F1', ist('2026-11-21T08:00:00'))],
    winsThisYear: {},
  };
  const codes = (patch: Partial<EligibilityInput>) => checkEligibility({ ...base, ...patch }).reasons.map((r) => r.code);

  it('valid order passes', () => {
    expect(checkEligibility(base)).toEqual({ eligible: true, reasons: [] });
  });
  it('class: SL not eligible', () => {
    expect(codes({ booking: { ...booking, trainClass: 'SL' } })).toEqual(['class']);
  });
  it('status: all confirmed is not eligible', () => {
    const passengers = booking.passengers.map((p) => ({ ...p, currentStatus: 'CNF B2 14' }));
    expect(codes({ booking: { ...booking, passengers } })).toEqual(['status']);
  });
  it('status: RAC only counts when opted in', () => {
    const passengers = booking.passengers.map((p) => ({ ...p, currentStatus: 'RAC 3' }));
    expect(codes({ booking: { ...booking, passengers } })).toEqual(['status']);
    expect(codes({ booking: { ...booking, passengers }, racCountsAsFailed: true })).toEqual([]);
  });
  it('booked early: booked the day before travel fails', () => {
    expect(codes({ booking: { ...booking, bookedAt: ist('2026-11-19T22:30:00') }, now: ist('2026-11-20T01:00:00') })).toEqual(['bookedLate']);
  });
  it('genuine intent: confirmation chance below 25% fails', () => {
    expect(codes({ booking: { ...booking, confirmChanceAtBooking: 0.1 } })).toEqual(['lowConfirmChance']);
  });
  it('order timing: less than 2 hours before chart fails', () => {
    // chart for 22:30 departure is 14:30
    expect(codes({ now: ist('2026-11-20T13:00:00') })).toEqual(['tooCloseToChart']);
    expect(codes({ now: ist('2026-11-20T12:30:00') })).toEqual([]);
  });
  it('yearly limit: 4 wins already fails', () => {
    expect(codes({ winsThisYear: { Asha: 4 } })).toEqual(['yearlyLimit']);
  });
  it('travellers: more than passengers on the PNR fails', () => {
    expect(codes({ travellers: [{ nameOnId: 'A' }, { nameOnId: 'B' }, { nameOnId: 'C' }] })).toEqual(['tooManyTravellers']);
  });
  it('route: station with no airport within 200 km fails', () => {
    expect(codes({ booking: { ...booking, toStation: 'Remote Halt' } })).toEqual(['route']);
  });
  it('route: airports exist but no flight fails', () => {
    expect(codes({ flights: [] })).toEqual(['route']);
  });
});

describe('seats released (6.5)', () => {
  const rule: ReleaseRule = { flightId: 'F1', mode: 'auto', maxLoadFactorToRelease: 0.75, maxSeats: 20, floorPrice: 3000, blackout: false };
  it('auto: releases min(maxSeats, free) under the load-factor limit', () => {
    expect(seatsReleased(flight('F1', '', { sold: 100 }), rule)).toBe(20);
    expect(seatsReleased(flight('F1', '', { sold: 100 }), { ...rule, maxSeats: 200 })).toBe(80);
  });
  it('auto: nearly full flight releases nothing', () => {
    expect(seatsReleased(flight('F1', '', { sold: 170 }), rule)).toBe(0);
  });
  it('approve: nothing until approved', () => {
    expect(seatsReleased(flight('F1', ''), { ...rule, mode: 'approve' })).toBe(0);
    expect(seatsReleased(flight('F1', ''), { ...rule, mode: 'approve' }, true)).toBe(20);
  });
  it('blackout releases nothing', () => {
    expect(seatsReleased(flight('F1', ''), { ...rule, blackout: true }, true)).toBe(0);
  });
});

describe('usable flights (6.4)', () => {
  const order = { acceptableWindow: { earliest: ist('2026-11-21T06:00:00'), latest: ist('2026-11-21T20:00:00') } };
  const route = { fromStation: 'Sample Central', toStation: 'Sample Junction' };
  const resultAt = ist('2026-11-21T03:00:00');
  const flights = [
    flight('late', ist('2026-11-21T18:00:00')),
    flight('tooSoon', ist('2026-11-21T06:30:00')), // needs 03:00 + 1h travel + 3h = 07:00
    flight('ok', ist('2026-11-21T07:00:00')),
    flight('outside', ist('2026-11-21T21:00:00')),
    flight('noSeats', ist('2026-11-21T10:00:00')),
    flight('otherRoute', ist('2026-11-21T10:00:00'), { toAirport: 'CCU' }),
  ];
  const released = { late: 5, tooSoon: 5, ok: 5, outside: 5, noSeats: 0, otherRoute: 5 };

  it('filters by route, window, travel buffer and released seats; sorted by departure', () => {
    expect(usableFlightIds(order, route, flights, released, map, resultAt)).toEqual(['ok', 'late']);
  });
});
