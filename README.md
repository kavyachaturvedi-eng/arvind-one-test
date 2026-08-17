# Arvind One

Store execution and live retail operations. The store team runs its day in one
app — scan and stock, save a sale with an inter-store transfer, pack online
orders, run outward/RTV, raise issues, reconcile and close — and Retail
Planning and the CEO see execution live as it happens.

Three roles: **Store Manager**, **Retail Planning**, **CEO**. Switch between
them with the control in the top-right corner.

All data is synthetic and deterministic (fixed demo clock: Thu 13 Aug 2026,
11:42 IST), so every screen renders identically on every machine. There is no
connection to any live system.

---

## Deploy to Vercel

A standard Next.js 14 project — no environment variables, no database, no
external services.

1. Push this folder to a GitHub repository (`package.json` must be at the repo
   root — do not nest the folder).
2. In Vercel: **Add New → Project**, import the repository, leave every
   setting on its default (framework preset: Next.js), and click **Deploy**.

Or from the command line:

```bash
npm i -g vercel
vercel --prod
```

### Run locally

```bash
npm install
npm run dev       # http://localhost:3000
```

---

## Screens

**My store** (Store Manager)
- `Today` — the day's decisions, ranked by value; quick actions; queue
- `Save the Sale` — inter-store transfer raised at the till, checked by a policy engine
- `Size & Stock` — broken core sizes with a recommended action for each
- `Online Orders` — find, pack, hand over, with digital POD and a cancellation ledger
- `Outward & RTV` — batches auto-split into compliant transfer codes, with a dispatch gate
- `Briefing & Floor` — briefing, floor walk, KPI sheet, champs
- `Raise an Issue` — maintenance, IT, VM and tag reprints on one SLA clock
- `Cash & Close` — tender mismatches matched against evidence; only exceptions surface

**Live** (Planning & CEO)
- `Live Execution` — every store's day, rolled up live, with an activity feed
- `Performance` — sell-through, markdown exposure, fill rate

**Planning**
- `Issues & SLA`, `Reallocation`, `Strategic Moves`, `Catchment`

**Data** (all roles)
- `Stock Position` — the stock figure, reconciled across source systems
- `Metric Registry` — one definition per metric, with owner, version, freshness
- `Ask One` — plain-language questions answered against governed metrics

---

## Architecture

```
lib/types.ts    Canonical domain model
lib/seed.ts     Deterministic dataset (stores, styles, stock, workflow objects)
lib/rules.ts    Pure decision rules — no data, no React, no clock reads
lib/engine.ts   Selectors over the dataset — the read model for every screen
lib/state.tsx   Application state and the audit trail

components/ui.tsx        Design system
components/Shell.tsx     App shell, role switcher, navigation
components/modules/*     One file per screen
```

## Tests

```bash
npm test          # 138 unit tests over the rules and the engine
```

End-to-end browser walkthrough (Playwright is deliberately not a project
dependency; install it ad hoc):

```bash
npm i -D playwright --no-save
npm run build && npm start    # terminal 1
npm run test:e2e              # terminal 2 (49 checks, screenshots in shots/)
```

---

*devx labs, August 2026. All data synthetic.*
