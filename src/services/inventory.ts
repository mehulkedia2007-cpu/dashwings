import { demoStore, releasedSeats } from '../store/demoStore';
import type { Flight, ReleaseRule } from '../engine/types';
import { mockDelay } from './delay';

export interface InventoryService {
  listFlights(): Promise<(Flight & { rule: ReleaseRule; seatsReleased: number })[]>;
  updateRule(flightId: string, patch: Partial<Omit<ReleaseRule, 'flightId'>>): Promise<void>;
}

export class MockInventoryService implements InventoryService {
  async listFlights() {
    await mockDelay();
    const s = demoStore.getState();
    const released = releasedSeats(s);
    return s.flights.map((f) => ({ ...f, rule: s.rules[f.id], seatsReleased: released[f.id] }));
  }
  async updateRule(flightId: string, patch: Partial<Omit<ReleaseRule, 'flightId'>>) {
    await mockDelay();
    demoStore.getState().setRule(flightId, patch);
  }
}

export const inventoryService: InventoryService = new MockInventoryService();
