/** Mock services wait 300–800 ms so screens show realistic loading states. */
export const mockDelay = () => new Promise<void>((r) => setTimeout(r, 300 + Math.random() * 500));
