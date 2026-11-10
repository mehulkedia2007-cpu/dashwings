import { demoStore } from '../store/demoStore';
import type { TrainBooking } from '../engine/types';
import { mockDelay } from './delay';

/** Train status as an outside source would report it before the chart: no final outcome. */
export type PnrLookup = Omit<TrainBooking, 'finalOutcome'>;

export interface PnrService {
  lookup(pnr: string): Promise<PnrLookup | null>;
}

export class MockPnrService implements PnrService {
  async lookup(pnr: string) {
    await mockDelay();
    const b = demoStore.getState().bookings[pnr.trim()];
    if (!b) return null;
    const { finalOutcome: _hidden, ...visible } = b;
    return visible;
  }
}

export const pnrService: PnrService = new MockPnrService();
