import { CONFIG } from './config';
import { chartTime } from './chartTime';
import type { Flight, PnrStatus, StationAirport, TrainBooking } from './types';

export type IneligibleCode =
  | 'class'
  | 'status'
  | 'bookedLate'
  | 'lowConfirmChance'
  | 'tooCloseToChart'
  | 'yearlyLimit'
  | 'tooManyTravellers'
  | 'route';

export interface EligibilityInput {
  booking: TrainBooking;
  travellers: { nameOnId: string }[];
  racCountsAsFailed: boolean;
  now: string; // ISO, when the order is being placed
  stationAirports: StationAirport[];
  flights: Flight[];
  winsThisYear: Record<string, number>; // keyed by nameOnId
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: { code: IneligibleCode; message: string }[];
}

const DAY = 24 * 60 * 60_000;
const HOUR = 60 * 60_000;

/** Reads a status like "WL 12", "RAC 4" or "CNF B2 31". */
export function statusKind(status: string): PnrStatus {
  const s = status.trim().toUpperCase();
  if (s.startsWith('RAC')) return 'RAC';
  if (s.includes('WL')) return 'WL';
  return 'CNF';
}

export function airportsNear(station: string, map: StationAirport[]): StationAirport[] {
  return map.filter((m) => m.station === station && m.distanceKm <= CONFIG.eligibility.maxStationToAirportKm);
}

export function flightsForRoute(booking: TrainBooking, map: StationAirport[], flights: Flight[]): Flight[] {
  const from = new Set(airportsNear(booking.fromStation, map).map((a) => a.airport));
  const to = new Set(airportsNear(booking.toStation, map).map((a) => a.airport));
  return flights.filter((f) => from.has(f.fromAirport) && to.has(f.toAirport));
}

export function checkEligibility(input: EligibilityInput): EligibilityResult {
  const { booking, travellers, racCountsAsFailed, now, winsThisYear } = input;
  const rules = CONFIG.eligibility;
  const reasons: EligibilityResult['reasons'] = [];
  const fail = (code: IneligibleCode, message: string) => reasons.push({ code, message });

  if (!(rules.classes as readonly string[]).includes(booking.trainClass)) {
    fail('class', `Sorry, ${booking.trainClass} class tickets are not covered yet. Only ${rules.classes.join(', ')} are eligible.`);
  }

  const kinds = booking.passengers.map((p) => statusKind(p.currentStatus));
  if (!kinds.some((k) => k === 'WL' || (racCountsAsFailed && k === 'RAC'))) {
    fail(
      'status',
      kinds.includes('RAC')
        ? 'Your ticket is RAC. Choose "treat RAC as not confirmed" if you want a flight backup.'
        : 'No passenger on this ticket is waitlisted, so a backup is not needed.',
    );
  }

  const dep = new Date(booking.departure).getTime();
  if (dep - new Date(booking.bookedAt).getTime() < rules.minDaysBookedBeforeTravel * DAY) {
    fail('bookedLate', `This ticket was booked less than ${rules.minDaysBookedBeforeTravel} days before travel, so it is not eligible.`);
  }

  if (booking.confirmChanceAtBooking < rules.minConfirmChanceAtBooking) {
    fail('lowConfirmChance', 'This ticket had a very low chance of confirmation when booked, so it is not eligible.');
  }

  if (new Date(chartTime(booking.departure)).getTime() - new Date(now).getTime() < rules.minHoursBeforeChart * HOUR) {
    fail('tooCloseToChart', `Orders close ${rules.minHoursBeforeChart} hours before the chart is prepared.`);
  }

  const capped = travellers.filter((t) => (winsThisYear[t.nameOnId] ?? 0) >= rules.maxWinsPerTravellerPerYear);
  if (capped.length) {
    fail('yearlyLimit', `${capped.map((t) => t.nameOnId).join(', ')} already used ${rules.maxWinsPerTravellerPerYear} flight backups this year.`);
  }

  if (travellers.length < 1 || travellers.length > booking.passengers.length) {
    fail('tooManyTravellers', `Add between 1 and ${booking.passengers.length} travellers (the number of passengers on this ticket).`);
  }

  if (flightsForRoute(booking, input.stationAirports, input.flights).length === 0) {
    fail('route', 'There is no airport close enough to both stations with a flight on this route.');
  }

  return { eligible: reasons.length === 0, reasons };
}
