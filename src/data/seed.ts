import { chartTime } from '../engine/chartTime';
import type { Flight, IfThenOrder, ReleaseRule, StationAirport, TrainBooking, TrainClass, PnrStatus } from '../engine/types';

// Fictional airline. Checked: no real airline by this name. Flight prefix "NLX" is not an IATA code format.
export const AIRLINE = { name: 'Nilambar Air', prefix: 'NLX', note: 'Nilambar Air is a fictional airline used for this demo.' };

/** Day 0 of the demo. All dates are derived from this so the seed is identical every time. */
export const DEMO_START_DATE = '2026-12-04';

export const STATION_AIRPORTS: StationAirport[] = [
  { station: 'Hyderabad', airport: 'HYD', distanceKm: 32, travelMinutes: 60 },
  { station: 'Delhi', airport: 'DEL', distanceKm: 16, travelMinutes: 50 },
  { station: 'Bengaluru', airport: 'BLR', distanceKm: 38, travelMinutes: 75 },
  { station: 'Kolkata', airport: 'CCU', distanceKm: 17, travelMinutes: 45 },
  { station: 'Mumbai', airport: 'BOM', distanceKm: 21, travelMinutes: 60 },
  { station: 'Patna', airport: 'PAT', distanceKm: 7, travelMinutes: 25 },
  { station: 'Sample Hill Town', airport: 'PAT', distanceKm: 265, travelMinutes: 360 }, // too far: route ineligible
];

export const AIRPORT_NAMES: Record<string, string> = {
  HYD: 'Hyderabad', DEL: 'Delhi', BLR: 'Bengaluru', CCU: 'Kolkata', BOM: 'Mumbai', PAT: 'Patna',
};

interface RouteDef {
  from: string; to: string; fromAirport: string; toAirport: string;
  durationMin: number; floor: number;
  flights: { no: number; dep: string; sold: number; fare: number; mode?: 'approve' }[];
}

const ROUTES: RouteDef[] = [
  {
    from: 'Hyderabad', to: 'Delhi', fromAirport: 'HYD', toAirport: 'DEL', durationMin: 130, floor: 3200,
    flights: [
      { no: 201, dep: '07:30', sold: 81, fare: 7800 }, // emptier
      { no: 205, dep: '12:15', sold: 117, fare: 8400 },
      { no: 209, dep: '18:40', sold: 168, fare: 9600 }, // nearly full: releases nothing
    ],
  },
  {
    from: 'Bengaluru', to: 'Kolkata', fromAirport: 'BLR', toAirport: 'CCU', durationMin: 150, floor: 3000,
    flights: [
      { no: 311, dep: '08:10', sold: 90, fare: 8200 },
      { no: 315, dep: '14:00', sold: 126, fare: 8900, mode: 'approve' },
      { no: 319, dep: '20:05', sold: 171, fare: 10200 },
    ],
  },
  {
    from: 'Mumbai', to: 'Patna', fromAirport: 'BOM', toAirport: 'PAT', durationMin: 140, floor: 3400,
    flights: [
      { no: 421, dep: '09:00', sold: 99, fare: 8600 },
      { no: 425, dep: '16:30', sold: 162, fare: 9900 },
    ],
  },
];

const CAPACITY = 180;
const MAX_SEATS = 12;

/** mulberry32: tiny deterministic PRNG. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ISO for an IST wall-clock time, `dayOffset` days after demo day `day`. */
export function istAt(day: number, hhmm: string, dayOffset = 0): string {
  const base = new Date(`${DEMO_START_DATE}T${hhmm}:00+05:30`).getTime();
  return new Date(base + (day + dayOffset) * 86_400_000).toISOString();
}

const FIRST = ['Asha', 'Ravi', 'Meena', 'Arjun', 'Kavya', 'Imran', 'Sunita', 'Vikram', 'Neha', 'Farhan', 'Lakshmi', 'Rohan', 'Pooja', 'Suresh', 'Divya', 'Anil', 'Zoya', 'Harish', 'Geeta', 'Manoj'];
const LAST = ['K', 'R', 'S', 'P', 'M', 'D', 'N', 'T', 'B', 'G'];

export interface SampleCase {
  pnr: string;
  label: string;
  shows: string;
  suggestedMaxPrice: number;
}

export interface DaySeed {
  day: number;
  clock: string;
  chartAt: string;
  bookings: Record<string, TrainBooking>;
  flights: Flight[];
  rules: Record<string, ReleaseRule>;
  orders: IfThenOrder[];
  samples: SampleCase[];
}

/** Everything for one demo day. Same `day` always gives the same data. */
export function seedDay(day: number): DaySeed {
  const r = rng(20261204 + day * 7919);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);
  const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.floor(min % 60)).padStart(2, '0')}`;
  const dateTag = new Date(new Date(DEMO_START_DATE).getTime() + (day + 1) * 86_400_000).toISOString().slice(0, 10); // flight date in IST

  // Flights tomorrow (relative to the demo day) and their release rules.
  const flights: Flight[] = [];
  const rules: Record<string, ReleaseRule> = {};
  for (const route of ROUTES) {
    for (const f of route.flights) {
      const id = `${AIRLINE.prefix}${f.no}-${dateTag}`;
      const departure = istAt(day, f.dep, 1);
      flights.push({
        id, flightNo: `${AIRLINE.prefix} ${f.no}`, fromAirport: route.fromAirport, toAirport: route.toAirport,
        departure, arrival: new Date(new Date(departure).getTime() + route.durationMin * 60_000).toISOString(),
        capacity: CAPACITY, sold: f.sold, publicFare: f.fare, cabinBagKg: 7, checkInBagKg: 15,
      });
      rules[id] = { flightId: id, mode: f.mode ?? 'auto', maxLoadFactorToRelease: 0.75, maxSeats: MAX_SEATS, floorPrice: route.floor, blackout: false };
    }
  }

  const bookings: Record<string, TrainBooking> = {};
  let trainNo = 1;
  const booking = (b: Partial<TrainBooking> & Pick<TrainBooking, 'pnr' | 'fromStation' | 'toStation' | 'passengers' | 'finalOutcome'>): TrainBooking => {
    const full: TrainBooking = {
      trainName: `Sample Express ${trainNo++}`,
      departure: istAt(day, '06:10', 1),
      trainClass: '3A',
      bookedAt: istAt(day, '10:00', -18),
      confirmChanceAtBooking: 0.55,
      confirmChanceNow: 0.3,
      ...b,
    };
    bookings[full.pnr] = full;
    return full;
  };
  const pax = (statuses: string[], names: string[]) =>
    statuses.map((s, i) => ({ name: names[i], statusAtBooking: s.replace(/\d+/, (n) => String(Number(n) + 12)), currentStatus: s }));

  // Presenter's sample PNRs: one per case in the build plan.
  const pnrBase = 4512300000 + day * 100;
  const P = (i: number) => String(pnrBase + i);
  booking({ pnr: P(1), fromStation: 'Hyderabad', toStation: 'Delhi', passengers: pax(['WL 14'], ['Asha Kulkarni']), finalOutcome: ['WL'] });
  booking({ pnr: P(2), fromStation: 'Hyderabad', toStation: 'Delhi', passengers: pax(['WL 3'], ['Ravi Shetty']), finalOutcome: ['CNF'], confirmChanceNow: 0.81 });
  booking({ pnr: P(3), fromStation: 'Bengaluru', toStation: 'Kolkata', trainClass: '2A', passengers: pax(['RAC 6'], ['Meena Das']), finalOutcome: ['RAC'], confirmChanceNow: 0.6 });
  booking({
    pnr: P(4), fromStation: 'Bengaluru', toStation: 'Kolkata',
    passengers: pax(['WL 9', 'WL 10', 'WL 11', 'WL 12'], ['Arjun Rao', 'Kavya Rao', 'Ishaan Rao', 'Diya Rao']),
    finalOutcome: ['CNF', 'CNF', 'WL', 'WL'], confirmChanceNow: 0.45,
  });
  booking({ pnr: P(5), fromStation: 'Hyderabad', toStation: 'Delhi', bookedAt: istAt(day, '08:00'), passengers: pax(['WL 22'], ['Imran Sheikh']), finalOutcome: ['WL'] });
  booking({ pnr: P(6), fromStation: 'Mumbai', toStation: 'Patna', trainClass: 'SL', passengers: pax(['WL 40'], ['Sunita Yadav']), finalOutcome: ['WL'] });
  booking({ pnr: P(7), fromStation: 'Sample Hill Town', toStation: 'Delhi', passengers: pax(['WL 18'], ['Vikram Negi']), finalOutcome: ['WL'] });
  booking({ pnr: P(8), fromStation: 'Mumbai', toStation: 'Patna', passengers: pax(['WL 27'], ['Neha Sinha']), finalOutcome: ['WL'], confirmChanceNow: 0.12 });

  const samples: SampleCase[] = [
    { pnr: P(1), label: 'WL, stays WL', shows: 'Main winning path', suggestedMaxPrice: 3800 },
    { pnr: P(2), label: 'WL, gets confirmed', shows: 'Order cancels itself, block released', suggestedMaxPrice: 3800 },
    { pnr: P(3), label: 'RAC', shows: 'The RAC choice', suggestedMaxPrice: 3600 },
    { pnr: P(4), label: 'Family of 4, two confirm', shows: 'Group trigger choice', suggestedMaxPrice: 3500 },
    { pnr: P(5), label: 'Booked the day before travel', shows: 'Ineligible: booked too late', suggestedMaxPrice: 3800 },
    { pnr: P(6), label: 'Sleeper class', shows: 'Ineligible: class', suggestedMaxPrice: 3800 },
    { pnr: P(7), label: 'Route with no airport nearby', shows: 'Ineligible: route', suggestedMaxPrice: 3800 },
    { pnr: P(8), label: 'Low bid', shows: 'Enters the market and does not win', suggestedMaxPrice: 3450 },
  ];

  // ~40 background orders so the order book looks alive. Mumbai → Patna gets extra
  // demand so the low-bid sample reliably loses.
  const orders: IfThenOrder[] = [];
  const routeWeights = [ROUTES[0], ROUTES[0], ROUTES[1], ROUTES[1], ROUTES[2], ROUTES[2], ROUTES[2]];
  for (let i = 0; i < 40; i++) {
    const route = i < 14 ? ROUTES[2] : pick(routeWeights);
    const n = r() < 0.7 ? 1 : r() < 0.66 ? 2 : 3;
    const surname = pick(LAST);
    const names = Array.from({ length: n }, () => `${pick(FIRST)} ${surname}`);
    const finalOutcome: PnrStatus[] = names.map(() => (r() < 0.65 ? 'WL' : 'CNF'));
    const pnr = `7${String(day % 1000).padStart(3, '0')}${String(i).padStart(2, '0')}${String(Math.floor(r() * 10000)).padStart(4, '0')}`;
    const b = booking({
      pnr, fromStation: route.from, toStation: route.to,
      trainClass: pick<TrainClass>(['3A', '3A', '3A', '2A', '2A', '1A']),
      departure: istAt(day, hhmm(between(5 * 60 + 15, 13 * 60 + 30)), 1),
      bookedAt: istAt(day, hhmm(between(8 * 60, 20 * 60)), -Math.floor(between(5, 25))),
      confirmChanceAtBooking: Math.round(between(0.3, 0.75) * 100) / 100,
      confirmChanceNow: Math.round(between(0.1, 0.5) * 100) / 100,
      passengers: pax(names.map(() => `WL ${Math.floor(between(2, 45))}`), names),
      finalOutcome,
    });
    // Prices spread around the floor: some below, most just above, a few keen buyers.
    const mult = i < 14 ? between(1.03, 1.45) : between(0.88, 1.4);
    orders.push({
      id: `bg-${day}-${i + 1}`,
      pnr: b.pnr,
      travellers: names.map((nameOnId) => ({ nameOnId })),
      maxPricePerSeat: Math.round((route.floor * mult) / 50) * 50,
      acceptableWindow: { earliest: istAt(day, '05:00', 1), latest: istAt(day, '23:59', 1) },
      racCountsAsFailed: false,
      groupTrigger: 'anyLeftOut',
      payment: r() < 0.8 ? 'fullBlock' : 'deposit',
      placedAt: istAt(day, hhmm(between(9 * 60, 22 * 60)), -Math.floor(between(1, 4))),
      status: 'active',
    });
  }

  return {
    day,
    clock: istAt(day, '10:00'),
    chartAt: chartTime(istAt(day, '06:10', 1)), // every seeded train departs tomorrow morning: one chart
    bookings,
    flights,
    rules,
    orders,
    samples,
  };
}
