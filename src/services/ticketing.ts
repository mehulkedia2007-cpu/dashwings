import { demoStore } from '../store/demoStore';
import { mockDelay } from './delay';

/** In the pilot, airline staff issue tickets from the winner list. */
export interface TicketingService {
  issue(orderIds: string[]): Promise<{ orderId: string; ticketRef: string }[]>;
}

export class MockTicketingService implements TicketingService {
  async issue(orderIds: string[]) {
    await mockDelay();
    demoStore.getState().issueTickets(orderIds);
    return orderIds.map((orderId) => ({ orderId, ticketRef: `SAMPLE-${orderId.toUpperCase()}` }));
  }
}

export const ticketingService: TicketingService = new MockTicketingService();
