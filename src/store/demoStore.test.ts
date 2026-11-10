import { beforeEach, describe, expect, it } from 'vitest';
import { istAt, seedDay } from '../data/seed';
import { demoStore, releasedSeats, type OrderDraft } from './demoStore';

const s = () => demoStore.getState();
const sample = (label: string) => s().samples.find((x) => x.label === label)!;

const draft = (label: string, patch: Partial<OrderDraft> = {}): OrderDraft => {
  const c = sample(label);
  const b = s().bookings[c.pnr];
  return {
    pnr: c.pnr,
    travellers: b.passengers.map((p) => ({ nameOnId: p.name })),
    maxPricePerSeat: c.suggestedMaxPrice,
    acceptableWindow: { earliest: istAt(0, '05:00', 1), latest: istAt(0, '23:59', 1) },
    racCountsAsFailed: false,
    groupTrigger: 'anyLeftOut',
    payment: 'fullBlock',
    ...patch,
  };
};

const place = (label: string, patch?: Partial<OrderDraft>) => {
  const r = s().placeOrder(draft(label, patch));
  if (!r.ok) throw new Error(`${label}: ${r.eligibility.reasons.map((x) => x.code)}`);
  return r.order.id;
};
const order = (id: string) => s().orders.find((o) => o.id === id)!;

beforeEach(() => s().reset());

describe('seed', () => {
  it('is identical every time', () => {
    expect(seedDay(0)).toEqual(seedDay(0));
    expect(seedDay(1).flights[0].id).not.toBe(seedDay(0).flights[0].id);
  });
  it('has ~40 background orders with unique PNRs, and each route has an empty and a full flight', () => {
    const d = seedDay(0);
    expect(d.orders).toHaveLength(40);
    expect(new Set(d.orders.map((o) => o.pnr)).size).toBe(40);
    const released = releasedSeats({ flights: d.flights, rules: d.rules, approved: {} });
    expect(Object.values(released).filter((n) => n === 0).length).toBeGreaterThanOrEqual(3);
  });
});

describe('sample PNR cases end to end', () => {
  it('ineligible cases give the right reason', () => {
    const codes = (label: string) => s().checkOrder(draft(label)).reasons.map((r) => r.code);
    expect(codes('Booked the day before travel')).toEqual(['bookedLate']);
    expect(codes('Sleeper class')).toEqual(['class']);
    expect(codes('Route with no airport nearby')).toEqual(['route']);
    expect(s().placeOrder(draft('Sleeper class')).ok).toBe(false);
    expect(s().rejections).toHaveLength(1);
  });

  it('RAC needs the opt-in', () => {
    expect(s().checkOrder(draft('RAC')).reasons.map((r) => r.code)).toEqual(['status']);
    expect(s().checkOrder(draft('RAC', { racCountsAsFailed: true })).eligible).toBe(true);
  });

  it('full day: win, self-cancel, RAC, family group, low bid', () => {
    const win = place('WL, stays WL');
    const confirmed = place('WL, gets confirmed');
    const rac = place('RAC', { racCountsAsFailed: true });
    const family = place('Family of 4, two confirm');
    const familyAll = place('Family of 4, two confirm', { groupTrigger: 'allLeftOut' });
    const low = place('Low bid');
    expect(s().payments[win]).toMatchObject({ blocked: 3800 });

    s().jumpToBeforeChart();
    expect(s().placeOrder(draft('WL, stays WL')).ok).toBe(false); // too close to chart

    s().prepareChart();
    expect(order(confirmed).status).toBe('trainConfirmed');
    expect(s().payments[confirmed].released).toBe(3800);
    expect(order(rac).status).toBe('inMarket');
    expect(order(family).status).toBe('inMarket');
    expect(order(familyAll).status).toBe('trainConfirmed');

    s().runMarket();
    expect(order(win)).toMatchObject({ status: 'won' });
    const price = order(win).result!.pricePerSeat;
    expect(price).toBeLessThanOrEqual(3800);
    expect(s().payments[win]).toEqual({ blocked: 3800, captured: price, released: 3800 - price, balanceDue: 0 });
    expect(order(low).status).toBe('notWon');
    expect(s().payments[low].released).toBe(3450);
    expect(s().runs.length).toBeGreaterThan(0);
  });

  it('raising the floor and re-running changes the result', () => {
    place('WL, stays WL');
    s().prepareChart();
    s().runMarket();
    const flightId = s().runs.find((r) => r.flightId.startsWith('NLX201'))!.flightId;
    const before = s().runs.find((r) => r.flightId === flightId)!;
    s().setRule(flightId, { floorPrice: 4500 });
    s().runMarket();
    const after = s().runs.find((r) => r.flightId === flightId)!;
    expect(after.floorPrice).toBe(4500);
    expect(after.seatsSold).toBeLessThan(before.seatsSold);
  });

  it('next day keeps history; reset restores the seed', () => {
    place('WL, stays WL');
    s().prepareChart();
    s().runMarket();
    s().nextDay();
    expect(s().day).toBe(1);
    expect(s().history).toHaveLength(1);
    s().reset();
    expect(s().day).toBe(0);
    expect(s().orders).toHaveLength(40);
  });
});
