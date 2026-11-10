import { demoStore, type Notification } from '../store/demoStore';
import { mockDelay } from './delay';

/** SMS / WhatsApp in the pilot. The demo only keeps an in-app log. */
export interface NotificationService {
  send(orderId: string, text: string): Promise<void>;
  forOrder(orderId: string): Promise<Notification[]>;
}

export class MockNotificationService implements NotificationService {
  async send(orderId: string, text: string) {
    await mockDelay();
    demoStore.getState().notify(orderId, text);
  }
  async forOrder(orderId: string) {
    await mockDelay();
    return demoStore.getState().notifications.filter((n) => n.orderId === orderId);
  }
}

export const notificationService: NotificationService = new MockNotificationService();
