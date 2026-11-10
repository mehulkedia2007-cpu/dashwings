import { createStore } from 'zustand/vanilla';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { seedDay, STATION_AIRPORTS, type SampleCase } from '../data/seed';
import { chartTime } from '../engine/chartTime';
import { checkEligibility, type EligibilityResult } from '../engine/eligibility';
import { seatsReleased, usableFlightIds } from '../engine/flights';
import { runMarket as runEngineMarket, type MarketBid } from '../engine/market';
import { blockAmount, settle } from '../engine/payment';
import { triggerOrder } from '../engine/trigger';
import type { Flight, IfThenOrder, MarketRun, ReleaseRule, TrainBooking } from '../engine/types';

export interface PaymentEntry { blocked: number; captured: number; released: number; balanceDue: number }
export interface Notification { at: string; orderId: string; kind: 'chart' | 'market' | 'other'; text: string }
export interface Rejection { at: string; pnr: string; reasons: string[] }

export interface DemoData {
  day: number;
  clock: string; // simulated "now", ISO
  chartAt: string;
  chartPrepared: boolean;
  bookings: Record<string, TrainBooking>;
  flights: Flight[];
  rules: Record<string, ReleaseRule>;
  approved: Record<string, boolean>; // approve-mode flights released by a person
  orders: IfThenOrder[];
  runs: MarketRun[];
  payments: Record<string, PaymentEntry>;
  ticketsIssued: Record<string, boolean>; // orderId -> issued (sample)
  notifications: Notification[];
  rejections: Rejection[];
  samples: SampleCase[];
  history: { day: number; runs: MarketRun[]; orders: IfThenOrder[] }[];
}

export type OrderDraft = Omit<IfThenOrder, 'id' | 'placedAt' | 'status' | 'result'>;

export interface DemoActions {
  placeOrder(draft: OrderDraft): { ok: true; order: IfThenOrder } | { ok: false; eligibility: EligibilityResult };
  checkOrder(draft: Pick<OrderDraft, 'pnr' | 'travellers' | 'racCountsAsFailed'>): EligibilityResult;
  cancelOrder(orderId: string): void;
  setRule(flightId: string, patch: Partial<Omit<ReleaseRule, 'flightId'>>): void;
  approveRelease(flightId: string): void;
  advanceClock(minutes: number): void;
  jumpToBeforeChart(): void;
  prepareChart(): void;
  runMarket(): void;
  issueTickets(orderIds: string[]): void;
  notify(orderId: string, text: string): void;
  nextDay(): void;
  reset(): void;
}

export type DemoState = DemoData & DemoActions;

const MIN = 60_000;

function freshDay(day: number, history: DemoData['history'] = []): DemoData {
  const s = seedDay(day);
  const payments: Record<string, PaymentEntry> = {};
  for (const o of s.orders) payments[o.id] = { blocked: blockAmount(o), captured: 0, released: 0, balanceDue: 0 };
  return {
    day: s.day, clock: s.clock, chartAt: s.chartAt, chartPrepared: false,
    bookings: s.bookings, flights: s.flights, rules: s.rules, approved: {},
    orders: s.orders, runs: [], payments, ticketsIssued: {}, notifications: [], rejections: [],
    samples: s.samples, history,
  };
}

/** Seats each flight releases under its current rule. */
export function releasedSeats(s: Pick<DemoData, 'flights' | 'rules' | 'approved'>): Record<string, number> {
  return Object.fromEntries(s.flights.map((f) => [f.id, seatsReleased(f, s.rules[f.id], !!s.approved[f.id])]));
}

/** Wins per traveller name across past days plus today (for the yearly limit). */
function winsThisYear(s: DemoData): Record<string, number> {
  const wins: Record<string, number> = {};
  for (const o of [...s.history.flatMap((h) => h.orders), ...s.orders]) {
    if (o.status === 'won') for (const t of o.travellers) wins[t.nameOnId] = (wins[t.nameOnId] ?? 0) + 1;
  }
  return wins;
}

// Storage that never throws; falls back to memory when localStorage is unavailable.
const memory = new Map<string, string>();
const safeStorage: StateStorage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return memory.get(k) ?? null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { memory.set(k, v); } },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { memory.delete(k); } },
};

export const STORAGE_KEY = 'dashwings-demo-v1';

export const demoStore = createStore<DemoState>()(
  persist(
    (set, get) => {
      const update = (fn: (s: DemoData) => Partial<DemoData>) => set((s) => fn(s));

      return {
        ...freshDay(0),

        checkOrder(draft) {
          const s = get();
          const booking = s.bookings[draft.pnr];
          if (!booking) return { eligible: false, reasons: [{ code: 'route', message: 'We could not find this PNR in the sample data.' }] };
          return checkEligibility({
            booking, travellers: draft.travellers, racCountsAsFailed: draft.racCountsAsFailed,
            now: s.clock, stationAirports: STATION_AIRPORTS, flights: s.flights, winsThisYear: winsThisYear(s),
          });
        },

        placeOrder(draft) {
          const eligibility = get().checkOrder(draft);
          const s = get();
          if (!eligibility.eligible) {
            update((s) => ({ rejections: [...s.rejections, { at: s.clock, pnr: draft.pnr, reasons: eligibility.reasons.map((r) => r.message) }] }));
            return { ok: false, eligibility };
          }
          const order: IfThenOrder = { ...draft, id: `o-${s.day}-${s.orders.length + 1}`, placedAt: s.clock, status: 'active' };
          update((s) => ({
            orders: [...s.orders, order],
            payments: { ...s.payments, [order.id]: { blocked: blockAmount(order), captured: 0, released: 0, balanceDue: 0 } },
          }));
          return { ok: true, order };
        },

        cancelOrder(orderId) {
          update((s) => {
            const o = s.orders.find((x) => x.id === orderId);
            if (!o || o.status !== 'active') return {};
            const p = s.payments[orderId];
            return {
              orders: s.orders.map((x) => (x.id === orderId ? { ...x, status: 'cancelled' } : x)),
              payments: { ...s.payments, [orderId]: { ...p, released: p.blocked } },
            };
          });
        },

        setRule(flightId, patch) {
          update((s) => ({ rules: { ...s.rules, [flightId]: { ...s.rules[flightId], ...patch } } }));
        },

        approveRelease(flightId) {
          update((s) => ({ approved: { ...s.approved, [flightId]: true } }));
        },

        advanceClock(minutes) {
          update((s) => ({ clock: new Date(new Date(s.clock).getTime() + minutes * MIN).toISOString() }));
        },

        jumpToBeforeChart() {
          update((s) => ({ clock: new Date(new Date(s.chartAt).getTime() - 60 * MIN).toISOString() }));
        },

        prepareChart() {
          update((s) => {
            const clock = s.clock < s.chartAt ? s.chartAt : s.clock;
            const payments = { ...s.payments };
            const notifications = [...s.notifications];
            const orders = s.orders.map((o) => {
              const b = s.bookings[o.pnr];
              if (o.status !== 'active' || !b || chartTime(b.departure) > clock) return o;
              const t = triggerOrder(o, b.finalOutcome);
              if (t.status === 'trainConfirmed') {
                payments[o.id] = { ...payments[o.id], released: payments[o.id].blocked };
                notifications.push({ at: clock, orderId: o.id, kind: 'chart', text: 'Your train is confirmed. Your order is closed and the block is released.' });
              }
              return { ...o, status: t.status };
            });
            return { clock, chartPrepared: true, orders, payments, notifications };
          });
        },

        runMarket() {
          update((s) => {
            if (!s.chartPrepared) return {};
            // Re-running replaces today's previous run (presenter changes the floor and runs again).
            const inPlay = s.orders.filter((o) => ['inMarket', 'won', 'notWon'].includes(o.status) && !s.ticketsIssued[o.id]);
            const released = releasedSeats(s);
            const bids: MarketBid[] = inPlay.map((o) => ({
              id: o.id, seats: o.travellers.length, maxPricePerSeat: o.maxPricePerSeat, payment: o.payment, placedAt: o.placedAt,
              usableFlightIds: usableFlightIds(o, s.bookings[o.pnr], s.flights, released, STATION_AIRPORTS, s.clock),
            }));
            const marketFlights = s.flights
              .filter((f) => released[f.id] > 0)
              .map((f) => ({ flightId: f.id, departure: f.departure, seatsReleased: released[f.id], floorPrice: s.rules[f.id].floorPrice }));
            const { runs, outcomes } = runEngineMarket(marketFlights, bids, s.clock);

            const payments = { ...s.payments };
            const inPlayIds = new Set(inPlay.map((o) => o.id));
            const notifications = s.notifications.filter((n) => !(n.kind === 'market' && inPlayIds.has(n.orderId)));
            const orders = s.orders.map((o) => {
              const out = outcomes[o.id];
              if (!out) return o;
              payments[o.id] = { blocked: payments[o.id].blocked, ...settle(payments[o.id].blocked, out.charge) };
              notifications.push({
                at: s.clock, orderId: o.id, kind: 'market',
                text: out.status === 'won'
                  ? `You got a seat on ${s.flights.find((f) => f.id === out.flightId)?.flightNo} at Rs ${out.pricePerSeat} per seat.`
                  : 'No seat this time. Your block is released in full.',
              });
              return {
                ...o, status: out.status,
                result: out.status === 'won' ? { flightId: out.flightId!, pricePerSeat: out.pricePerSeat! } : undefined,
              };
            });
            return { runs, orders, payments, notifications };
          });
        },

        issueTickets(orderIds) {
          update((s) => ({ ticketsIssued: { ...s.ticketsIssued, ...Object.fromEntries(orderIds.map((id) => [id, true])) } }));
        },

        notify(orderId, text) {
          update((s) => ({ notifications: [...s.notifications, { at: s.clock, orderId, kind: 'other', text }] }));
        },

        nextDay() {
          update((s) => freshDay(s.day + 1, [...s.history, { day: s.day, runs: s.runs, orders: s.orders }]));
        },

        reset() {
          set(freshDay(0));
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true, // rehydrated on the client after mount, so server and first client render match
    },
  ),
);

// Cross-tab sync: presenter can run the passenger view and the airline dashboard in two windows.
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  const channel = new BroadcastChannel('dashwings-demo');
  let applyingRemote = false;
  demoStore.subscribe((state) => {
    if (applyingRemote) return;
    const data = Object.fromEntries(Object.entries(state).filter(([, v]) => typeof v !== 'function'));
    channel.postMessage(data);
  });
  channel.onmessage = (e: MessageEvent<Partial<DemoData>>) => {
    applyingRemote = true;
    demoStore.setState(e.data);
    applyingRemote = false;
  };
}
