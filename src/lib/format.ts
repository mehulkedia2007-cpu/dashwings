const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const rs = (n: number | null | undefined) => (n == null ? '—' : `Rs ${inr.format(n)}`);
export const num = (n: number) => inr.format(n);

const dt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const t = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
export const when = (iso: string) => dt.format(new Date(iso));
export const time = (iso: string) => t.format(new Date(iso));
