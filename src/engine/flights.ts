import { CONFIG } from './config';
import { airportsNear } from './eligibility';
import type { Flight, IfThenOrder, ReleaseRule, StationAirport, TrainBooking } from './types';

/** Seats a flight puts into the market. `approved` = a person clicked Release (approve mode only). */
export function seatsReleased(flight: Flight, rule: ReleaseRule, approved = false): number {
  if (rule.blackout) return 0;
  const free = Math.max(0, Math.min(rule.maxSeats, flight.capacity - flight.sold));
  if (rule.mode === 'approve') return approved ? free : 0;
  return flight.sold / flight.capacity <= rule.maxLoadFactorToRelease ? free : 0;
}

/** Flight ids this order may use, sorted by departure. `released` maps flightId -> seats released. */
export function usableFlightIds(
  order: Pick<IfThenOrder, 'acceptableWindow'>,
  booking: Pick<TrainBooking, 'fromStation' | 'toStation'>,
  flights: Flight[],
  released: Record<string, number>,
  stationAirports: StationAirport[],
  marketResultAt: string,
): string[] {
  const origins = new Map(airportsNear(booking.fromStation, stationAirports).map((a) => [a.airport, a.travelMinutes]));
  const dests = new Set(airportsNear(booking.toStation, stationAirports).map((a) => a.airport));
  const earliest = new Date(order.acceptableWindow.earliest).getTime();
  const latest = new Date(order.acceptableWindow.latest).getTime();
  const resultAt = new Date(marketResultAt).getTime();

  return flights
    .filter((f) => {
      const travel = origins.get(f.fromAirport);
      if (travel === undefined || !dests.has(f.toAirport)) return false;
      const dep = new Date(f.departure).getTime();
      if (dep < earliest || dep > latest) return false;
      if (dep - resultAt < (travel + CONFIG.matching.bufferHoursAfterResult * 60) * 60_000) return false;
      return (released[f.id] ?? 0) > 0;
    })
    .sort((a, b) => a.departure.localeCompare(b.departure))
    .map((f) => f.id);
}
