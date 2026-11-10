'use client';

import { useState } from 'react';
import { istAt, AIRLINE } from '@/data/seed';
import type { EligibilityResult } from '@/engine/eligibility';
import { pnrService, type PnrLookup } from '@/services/pnr';
import { paymentService } from '@/services/payments';
import { blockAmount } from '@/engine/payment';
import { releasedSeats } from '@/store/demoStore';
import { useDemo } from '@/store/useDemo';
import { rs, time, when } from '@/lib/format';

const btn = 'rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800';
const th = 'px-2 py-1 text-left font-medium';
const td = 'px-2 py-1 tabular-nums';

export default function DebugPage() {
  const s = useDemo((x) => x);
  const released = releasedSeats(s);
  const [pnr, setPnr] = useState('');
  const [lookup, setLookup] = useState<{ loading: boolean; booking?: PnrLookup | null; elig?: EligibilityResult; msg?: string }>({ loading: false });

  async function find(p: string) {
    setPnr(p);
    setLookup({ loading: true });
    const booking = await pnrService.lookup(p);
    const elig = booking ? s.checkOrder({ pnr: p, travellers: booking.passengers.map((x) => ({ nameOnId: x.name })), racCountsAsFailed: true }) : undefined;
    setLookup({ loading: false, booking, elig });
  }

  async function place() {
    const booking = lookup.booking;
    if (!booking) return;
    const sample = s.samples.find((x) => x.pnr === booking.pnr);
    const draft = {
      pnr: booking.pnr,
      travellers: booking.passengers.map((x) => ({ nameOnId: x.name })),
      maxPricePerSeat: sample?.suggestedMaxPrice ?? 3800,
      acceptableWindow: { earliest: istAt(s.day, '05:00', 1), latest: istAt(s.day, '23:59', 1) },
      racCountsAsFailed: true,
      groupTrigger: 'anyLeftOut' as const,
      payment: 'fullBlock' as const,
    };
    setLookup({ ...lookup, loading: true });
    const block = await paymentService.requestBlock(blockAmount(draft));
    const r = s.placeOrder(draft);
    setLookup({ ...lookup, loading: false, msg: r.ok ? `Order ${r.order.id} placed. UPI block (simulated) ${block.reference}.` : r.eligibility.reasons.map((x) => x.message).join(' ') });
  }

  const counts = s.orders.reduce<Record<string, number>>((m, o) => ({ ...m, [o.status]: (m[o.status] ?? 0) + 1 }), {});

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-xl font-semibold">Dashwings · debug</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Phase 2 check page. {AIRLINE.note}</p>
      </header>

      <section aria-label="Demo clock" className="space-y-2 rounded border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-sm">
          Demo clock <strong className="tabular-nums">{when(s.clock)}</strong> · day {s.day} · chart at {when(s.chartAt)} ·{' '}
          {s.chartPrepared ? 'chart prepared' : 'chart not prepared'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className={btn} onClick={() => s.advanceClock(60)}>+1 hour</button>
          <button className={btn} onClick={s.jumpToBeforeChart}>Jump to 1 hour before chart</button>
          <button className={btn} onClick={s.prepareChart}>Prepare chart</button>
          <button className={btn} onClick={s.runMarket} disabled={!s.chartPrepared}>Run market</button>
          <button className={btn} onClick={s.nextDay}>Next day</button>
          <button className={btn} onClick={s.reset}>Reset demo</button>
        </div>
      </section>

      <section aria-label="Sample PNR" className="space-y-2 rounded border border-zinc-200 p-3 dark:border-zinc-800">
        <h2 className="font-medium">Look up a PNR</h2>
        <div className="flex flex-wrap gap-2">
          <input aria-label="PNR" value={pnr} onChange={(e) => setPnr(e.target.value)} inputMode="numeric" className="w-36 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900" />
          <button className={btn} onClick={() => find(pnr)} disabled={lookup.loading}>Look up</button>
          <select aria-label="Sample PNR" className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" value="" onChange={(e) => e.target.value && find(e.target.value)}>
            <option value="">Try a sample PNR…</option>
            {s.samples.map((x) => <option key={x.pnr} value={x.pnr}>{x.pnr} · {x.label}</option>)}
          </select>
        </div>
        {lookup.loading && <p className="text-sm">Loading…</p>}
        {!lookup.loading && lookup.booking === null && <p className="text-sm text-red-700 dark:text-red-400">PNR not found in sample data.</p>}
        {!lookup.loading && lookup.booking && (
          <div className="text-sm">
            <p>{lookup.booking.trainName} · {lookup.booking.fromStation} → {lookup.booking.toStation} · {lookup.booking.trainClass} · departs {when(lookup.booking.departure)}</p>
            <p>{lookup.booking.passengers.map((p) => `${p.name}: ${p.currentStatus}`).join(' · ')}</p>
            <p>{lookup.elig?.eligible ? '✓ Eligible (RAC treated as not confirmed)' : `✗ ${lookup.elig?.reasons.map((r) => r.message).join(' ')}`}</p>
            <button className={`${btn} mt-2`} onClick={place}>Place order at suggested price</button>
          </div>
        )}
        {lookup.msg && <p className="text-sm" role="status">{lookup.msg}</p>}
      </section>

      <section aria-label="Flights" className="overflow-x-auto">
        <h2 className="mb-1 font-medium">Flights ({s.flights.length})</h2>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-zinc-300 dark:border-zinc-700">
            {['Flight', 'Route', 'Departs', 'Load', 'Mode', 'Public fare', 'Floor', 'Released', ''].map((h) => <th key={h} className={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {s.flights.map((f) => {
              const rule = s.rules[f.id];
              return (
                <tr key={f.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className={td}>{f.flightNo}</td>
                  <td className={td}>{f.fromAirport} → {f.toAirport}</td>
                  <td className={td}>{time(f.departure)}</td>
                  <td className={td}>{Math.round((f.sold / f.capacity) * 100)}%</td>
                  <td className={td}>{rule.mode}</td>
                  <td className={td}>{rs(f.publicFare)}</td>
                  <td className={td}>
                    <input aria-label={`Floor price ${f.flightNo}`} type="number" step={50} value={rule.floorPrice} onChange={(e) => s.setRule(f.id, { floorPrice: Number(e.target.value) })} className="w-24 rounded border border-zinc-300 px-1 dark:border-zinc-700 dark:bg-zinc-900" />
                  </td>
                  <td className={td}>{released[f.id]}</td>
                  <td className={td}>{rule.mode === 'approve' && !s.approved[f.id] && <button className={btn} onClick={() => s.approveRelease(f.id)}>Release</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section aria-label="Market runs" className="overflow-x-auto">
        <h2 className="mb-1 font-medium">Market runs ({s.runs.length})</h2>
        {s.runs.length === 0 ? <p className="text-sm text-zinc-600 dark:text-zinc-400">No runs yet. Prepare the chart, then run the market.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-300 dark:border-zinc-700">
              {['Flight', 'Released', 'Floor', 'Clearing price', 'Sold', 'Revenue', 'Commission'].map((h) => <th key={h} className={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {s.runs.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className={td}>{s.flights.find((f) => f.id === r.flightId)?.flightNo}</td>
                  <td className={td}>{r.seatsReleased}</td>
                  <td className={td}>{rs(r.floorPrice)}</td>
                  <td className={td}>{rs(r.clearingPrice)}</td>
                  <td className={td}>{r.seatsSold}</td>
                  <td className={td}>{rs(r.revenue)}</td>
                  <td className={td}>{rs(r.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="Orders" className="overflow-x-auto">
        <h2 className="mb-1 font-medium">Orders ({s.orders.length}) · {Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}</h2>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-zinc-300 dark:border-zinc-700">
            {['Order', 'PNR', 'Seats', 'Max / seat', 'Payment', 'Status', 'Paid / seat', 'Blocked', 'Released'].map((h) => <th key={h} className={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {[...s.orders].reverse().map((o) => (
              <tr key={o.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className={td}>{o.id}</td>
                <td className={td}>{o.pnr}</td>
                <td className={td}>{o.travellers.length}</td>
                <td className={td}>{rs(o.maxPricePerSeat)}</td>
                <td className={td}>{o.payment}</td>
                <td className={td}>{o.status}</td>
                <td className={td}>{rs(o.result?.pricePerSeat)}</td>
                <td className={td}>{rs(s.payments[o.id]?.blocked)}</td>
                <td className={td}>{rs(s.payments[o.id]?.released)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
