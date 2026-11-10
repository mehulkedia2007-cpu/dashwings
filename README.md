# Dashwings

**A flight backup for train passengers whose waitlisted ticket doesn't get confirmed, and extra revenue for airlines from seats that would otherwise fly empty.**

> **Demo · sample data.** This repository is a demo built for pilot conversations. It uses made-up data only. It has no connection to any railway, airline, payment or messaging system. The airline, trains and flight numbers are fictional.

---

## The problem

**For train passengers.** Every night in India, a large number of people hold waitlisted (WL) train tickets in AC classes. They find out only when the reservation chart is prepared, often a few hours before departure, whether they can travel. If the ticket isn't confirmed, they're stuck. A normal flight bought at the last minute is very expensive, and there's no simple, affordable backup they can arrange in advance.

**For airlines.** On the same routes, flights leave with empty seats. An empty seat earns nothing once the door closes. Airlines can't just cut public fares to fill them: that teaches every customer to wait for a discount and damages normal sales.

The two problems fit together. One group needs a seat on short notice at a fair price. The other has seats it can't sell without hurting its own fares.

## How Dashwings solves it

Dashwings lets an airline sell spare seats to **one verified, closed group**: train passengers whose waitlisted ticket did not get confirmed.

1. **The passenger places an If-Then order in advance.**
   *"If my train is not confirmed, book me a flight for up to Rs 3,800 per seat."*
   The money is only **blocked**, not charged.
2. **The chart is prepared.** Dashwings checks each ticket. Passengers who got confirmed have their block released and are done. Passengers who were left out enter a **market** for the seats the airline chose to release.
3. **The market runs.** Seats go to the highest orders, and **every winner pays the same price**: the lowest winning order (a uniform-price auction). Each winner is charged only that price, and the rest of the block is released. People who don't win get their whole block back, plus fallback options.
4. **The special price is never public.** Only verified train passengers can take part, so the airline's normal fares are not affected.

### Why airlines can trust it

- **The airline stays in control.** Per flight, it chooses how many seats to release, the minimum (floor) price, a load-factor limit and blackout dates. It can also require manual approval before any seats are released.
- **Normal sales are protected.** The public fare never changes, and full flights release nothing.
- **Gaming is blocked.** Eligibility rules require an eligible AC class, a genuinely waitlisted ticket booked well in advance with a real chance of confirmation, orders placed before the chart, and a yearly limit per traveller.
- **The extra revenue is measured honestly.** A holdout group (the "Truth Meter") shows how much revenue is truly extra.

### Who uses it

| User | What they get |
|---|---|
| Airline revenue team (paying customer) | A dashboard showing forecast demand and the order book, with release rules and market results |
| Passenger | A simple phone flow: enter PNR, place an order, get the result |
| Train-booking apps | A clean passenger flow that could sit inside their app |

---

## What this repo contains

A demo that looks and behaves like the pilot version, built in phases:

| Phase | Scope | Status |
|---|---|---|
| 1 | Engine: chart time, eligibility, trigger, flight matching, market, plus tests | ✅ Done |
| 2 | Seed data, mock services, store with cross-tab sync, demo clock | ✅ Done |
| 3 | Passenger flow (phone-first) | ⏳ Next |
| 4 | Airline dashboard (desktop-first) | — |
| 5 | Demo bar, presenter mode, ops view, polish | — |
| 6 | Deploy and presenter guide | — |

### Engine (`src/engine/`)

Pure TypeScript with no UI code, so it can move to a server unchanged.

| File | What it does |
|---|---|
| `config.ts` | Every rule number in one place (class list, 3-day booking rule, 8% commission, and so on) |
| `types.ts` | Data model: train booking, flight, release rule, order, market run |
| `chartTime.ts` | When the chart is prepared: trains departing 05:00–14:00 get a chart at 21:00 the previous day; all others, 8 hours before departure |
| `eligibility.ts` | Whether a PNR can place an order, with a polite reason for each rule it fails |
| `trigger.ts` | After the chart: whether the order enters the market or closes because the train was confirmed |
| `flights.ts` | How many seats a flight releases, and which flights an order can use |
| `market.ts` | Uniform-price auction per flight. Groups are all-or-nothing; losers roll on to the next usable flight |
| `payment.ts` | Block amount (full, or a 20% deposit) and how a block is split after the market |
| `engine.test.ts` | 31 tests, including every required case from the build plan |

### Data, services and store

| Path | What it does |
|---|---|
| `src/data/seed.ts` | Seeded generator: fictional airline Nilambar Air, 3 routes, 8 flights, about 40 background orders and the 8 sample PNRs. Identical every time |
| `src/services/` | PNR, inventory, payments, notifications and ticketing interfaces, each with a mock that waits 300–800 ms |
| `src/store/demoStore.ts` | Demo state and actions (place order, prepare chart, run market, next day, reset). Saved in the browser and synced live across tabs |
| `src/app/debug` | Check page at `/debug`: demo clock buttons, PNR lookup, flights, market runs and orders |

### Sample PNRs

| PNR | Case |
|---|---|
| 4512300001 | WL, stays WL: main winning path |
| 4512300002 | WL, gets confirmed: order closes itself |
| 4512300003 | RAC: the RAC choice |
| 4512300004 | Family of 4, two confirm: group choice |
| 4512300005 | Booked the day before travel: ineligible |
| 4512300006 | Sleeper class: ineligible |
| 4512300007 | No airport nearby: ineligible |
| 4512300008 | Low bid: enters the market, does not win |

## Running it

Requires Node.js 22 or later.

```bash
npm install
npm test        # run the engine tests
npm run dev     # then open http://localhost:3000/debug
```

## Tech

Next.js (App Router), TypeScript, Tailwind CSS, Vitest. Later phases add a client-side store persisted to browser storage and synced across tabs, so the demo runs with no server. Every future real connection (PNR status, airline inventory, payments, notifications, ticketing) sits behind an interface with a mock implementation, ready to swap for the pilot.

## Not in scope for the demo

No real railway or PNR data, no airline inventory, no UPI or payments, no SMS or WhatsApp, no login, no real tickets. Before any pilot, the open questions to settle with professionals are: the permitted way to check PNR status at volume, the licence needed to sell air tickets, who holds customer money, and data-protection duties.
