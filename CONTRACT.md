# Arvind One — module authoring contract

Read this before writing any file in `components/modules/`.

## What this product is

A single role-based layer that sits **above** Arvind Fashions' existing systems (SAP, Microsoft
Dynamics 365 + POS, Vector for replenishment/IST, Power BI, Capillary CRM, Omuni) so that a
**Store Manager, Area Manager, Central Planner and the CEO all read the same number and can act
without leaving the screen**. It replaces no ERP. It removes the email, the Excel, the 23 paper
registers, and the nine logins.

The pains it exists to kill, verbatim from discovery at AFL (Tommy Hilfiger / Calvin Klein /
Arrow / Flying Machine / U.S. Polo Assn.):

| Pain | Today | Target |
|---|---|---|
| Inter-store transfer to save a sale | email planning → wait for IST code → ≥1 day | under 5 minutes, self-initiated at the till |
| Broken size sets on top sellers | nobody owns it; remaining sizes sit and get marked down | standing exception queue ranked by value at risk |
| Stock visibility | Power BI refreshes at 21:00 | live, with a freshness stamp on every number |
| Outward / RTV of 2,500 units | 9+ hand-keyed transactions, 4–40 days | one batch, auto-split, 2 days |
| Online order cancellations | unit unfindable, no root cause ever recorded | find-timer, auto-reassign, root-cause ledger |
| Cash / tender mismatch | manual justification note + bank slip hunt | auto-explained exceptions, only the real ones surface |
| Maintenance ticket | email → vendor → quote → approval → PO, 20+ days | QR-raised, auto-dispatched, SLA ladder |
| Price tag reprint | email, 15–50 days, sometimes never arrives | auto-created from the SAP price change, 24h SLA |
| Planner wants a report | request it, wait ~1 week | ask in plain language, answered against a governed metric |
| Full-price sell-through | ~72–75% vs Zara ~85–90% | close the gap by acting on the four levers above |

**Tone: this is a client-facing prototype shown to a CEO on Friday.** Every screen must (a) work,
(b) handle its edge cases visibly, and (c) make the "before vs after" contrast legible without
narration. Prefer showing a real mechanism over showing a pretty empty state.

## Hard rules

1. `"use client";` at the top of every module file.
2. **Default export** a component taking no props: `export default function SizeSets() {…}`.
3. **No `Date.now()`, no `Math.random()`, no `new Date()` with no argument.** The demo clock is the
   exported constant `NOW` from `@/lib/seed`. Everything must render identically on server and
   client — a hydration mismatch is a visible bug in the demo.
4. No new npm dependencies. Charts are inline SVG or the helpers in `@/components/ui`.
5. Tailwind classes only from the tokens below; never raw hex in JSX except via the CSS variables
   already defined (`var(--series-1)` … `var(--status-critical)`).
6. Never put a number on screen without a unit or a comparison. Never a dual-axis chart.
7. Status colour never carries meaning alone — pair with an icon or a label (use `<StatusDot>` /
   `<Chip>`).
8. Indian number formatting: use `inr()` from `@/components/ui` (`inr(4200000, {compact:true})` →
   `₹42 L`). Percentages via `pct()`.
9. Keep each module file under ~450 lines. Extract local sub-components inside the same file.
10. Every interactive control must actually do something — mutate state via `useApp()` and show a
    toast. No dead buttons, no `alert()`.

## Available API

### `@/lib/seed`
```ts
NOW: number            // 2026-08-13T11:42 IST, ms epoch. THE demo clock.
HOUR, DAY: number
ROLES: Role[]          // 4 personas
STORES: Store[]        // 15 stores
STYLES: Style[]        // 32 styles
STOCK: StockRow[]
METRICS: MetricDef[]   // the semantic layer / metric registry
STAFF: StaffKpi[]      // per-associate KPI for STORES[0]
CASH_EXCEPTIONS: CashException[]
NOTIFICATIONS: Notification[]
LEGACY_SYSTEMS: LegacySystem[]   // {name, role, users, pain, keep: "keep"|"absorb"|"retire"}
SEED_TICKETS, SEED_OMNI, SEED_OUTWARD
BRANDS, REGIONS, CATEGORIES
storeById(id): Store
styleById(id): Style
rng(seed): () => number   // deterministic; use this instead of Math.random
```

### `@/lib/rules` (pure, unit-tested)
```ts
trueRos(row): number                 // full-price units / days genuinely in stock
naiveRos(row, periodDays?): number
demandUnderstatement(row): number
sizeSetHealth(style, rows): { status: "healthy"|"at_risk"|"broken", missingCore, presentCore, coverage }
coverDays(sellable, ros): number
replenishmentDecision({sellable, ros, dcAvailable, peerExcess, daysLeftInWindow, sizeSet, isNOS})
   → { action: "replenish_from_dc"|"transfer_in"|"hold"|"stop_sell"|"pull_back", reason, units, confidence }
evaluateIstPolicy(input): { outcome: "auto_approved"|"needs_approval"|"blocked", checks: PolicyCheck[], slaHours, legacyHours }
splitOutward(totalUnits, batchId): OutwardCode[]      // 300-unit cap, 30-unit carton floor
validateOutward({codes, videoProof, lrNumber}): string[]   // list of blocking errors
slaState(raisedAt, slaHours, now): { elapsedHours, pctConsumed, breached, level: 0|1|2|3, levelLabel, remainingLabel }
ticketSlaHours(kind): number
classifyCancellation({systemStock, physicallyFound, findMinutes, findSlaMinutes, damaged, reservedElsewhere, customerInitiated})
   → { cause, narrative, correctiveAction }
sellThrough(soldFullPrice, received): number
markdownExposure({residualUnits, mrp, expectedDepth}): number
sellThroughUplift({currentSellThrough, targetSellThrough, seasonUnits, averageMrp, markdownDepth, grossMargin})
   → { unitsMoved, marginUnlocked, markdownAvoided }
classifyCashDelta({delta, hasDepositSlip, lodgedAfterCutoff, matchesFeeSchedule, ageHours})
   → { status: "auto_cleared"|"needs_review"|"escalated", confidence }
distanceKm(a, b): number
inr(n, {compact?}): string
pct(n, digits?): string
OUTWARD_CODE_LIMIT = 300, CARTON_MIN_UNITS = 30, CARTON_MAX_UNITS = 120
```

### `@/lib/engine` (selectors over the dataset)
```ts
stockForStore(storeId): StockRow[]
stockForStyleAtStore(storeId, styleId): StockRow[]
skuRow(storeId, styleId, size): StockRow | undefined
sellable(row): number                       // onHand - reserved
stylesAtStore(storeId): Style[]
dcAvailable(styleId, size): number          // warehouse (RPC) units
storeVitals(storeId) / vitalsFor(storeId) / allVitals(): StoreVitals
   // StoreVitals: { store, sellableUnits, inTransit, fillRate, mtdSales, mtdTargetToDate,
   //   achievement, lySameDay, todaySales, footfall, bills, conversion, atv, upt,
   //   sizeSetScore, brokenStyles, atRiskStyles, valueAtRisk, sellThrough }
styleTrueRos(storeId, styleId): number
daysLeftInWindow(style): number
styleSignal(storeId, styleId): StyleSignal
   // { style, storeId, sellable, ros, naiveRos, cover, health, decision, valueAtRisk,
   //   daysLeftInWindow, regionalRank, regionalRos, dcUnits, donorUnits }
sizeSetExceptions(storeId, limit?): StyleSignal[]      // ranked by value at risk
topSellers(storeId, limit?): StyleSignal[]
missedOpportunities(storeId, limit?): StyleSignal[]
findDonors(storeId, styleId, size, minUnits?): Donor[]
   // Donor: { store, sellable, excess, distanceKm, fillRate, ros, saleable, score }
inventoryLineage(storeId, styleId): { reconciled, entries: LineageEntry[], adjustments }
brandRollups(): BrandRollup[]
categoryRollups(): CategoryRollup[]
regionRollups(): { region, sellThrough, fillRate, stores, valueAtRisk }[]
reallocationPlan(styleId, totalUnits): ReallocationRow[]
   // { store, plannedUnits, recommendedUnits, delta, reason, performanceIndex, confidence }
strategicMoves(limit?): StrategicMove[]
   // { id, styleId, styleName, size, from, to, units, distanceKm, rationale, valueUnlocked, confidence }
catchment(storeId): CatchmentCell[]   // { pincode, area, customers, spend, distanceKm, nearestStore }
enterprise(): { stores, styles, totalUnits, sellThrough, valueAtRisk, markdownExposure,
                fillRate, sizeSetScore, brokenStyles, mtdSales, mtdTarget }
trend(seedKey, points?, base?, drift?): number[]   // deterministic sparkline series
```

### `@/lib/state`
```ts
const app = useApp();
app.role            // "store" | "area" | "planner" | "leadership"
app.storeId         // currently scoped store
app.actorName       // display name of the acting persona
app.go(moduleId)    // navigate: "home"|"truth"|"savesale"|"sizeset"|"omni"|"outward"|"storeday"
                    //  |"tickets"|"cash"|"allocate"|"moves"|"performance"|"catchment"
                    //  |"ask"|"governance"|"blueprint"
app.toastNow(msg, tone?)      // tone: "good" | "warn" | "info"
app.setStore(id)
app.ist: ISTRequest[]         // created at runtime by Save the Sale
app.tickets: Ticket[]
app.omni: OmniOrder[]
app.outward: OutwardBatch[]
app.tasks: Task[]
app.cash: CashException[]
app.audit: AuditEntry[]
app.createIst(input): ISTRequest
app.dispatch({...})           // typed actions, see lib/state.tsx:
  { type:"ticket:update", id, patch, label?, actor? }
  { type:"ticket:create", ticket }
  { type:"omni:update", id, patch, label?, actor? }
  { type:"outward:create", batch }
  { type:"outward:update", id, patch, label?, actor? }
  { type:"task:update", id, patch }
  { type:"task:create", task }
  { type:"cash:update", id, patch }
  { type:"audit", entry }
```

### `@/components/ui`
```tsx
<Card pad?>                       // .card wrapper
<SectionTitle title sub? right?/>
<Chip tone="neutral|good|warn|serious|critical|brand" icon?>
<StatusDot tone="good|warn|serious|critical|neutral"/>
<Delta value invert? suffix?/>
<Freshness minutes label?/>       // "as of 18 min ago" with a status dot
<Stat label value sub? tone? spark? freshness? onClick? emphasis?/>
<Sparkline data height? color? showArea?/>
<BarChart data={[{label,value,tone?,note?}]} format? color? height? max?/>
<ColumnChart categories={[]} series={[{name,color,values}]} format? height?/>   // has hover tooltip
<Meter value target? tone?/>       // norm band meter, marker at 100%
<SlaBar pctConsumed label/>
<Table><Th align?/><Td align?/></Table>
<Modal open onClose title sub? footer? wide?>
<Tabs value onChange options={[{id,label,count?}]}/>
<Empty title body?/>
<Callout tone="brand|good|warn|critical" title?>
<BeforeAfter before after beforeLabel? afterLabel?/>
<SizeGrid sizes units core onPick? selected?/>   // units: Record<size, number>
<Swatch hex label?/>
<Timeline events={[{at,actor,label,system}]}/>
<Toast .../>
fmtTime(ms) fmtDate(ms) fmtDateTime(ms) relTime(ms, now)
inr(n,{compact?}) pct(n,digits?)
```

Series colours, in fixed order, never cycled:
`var(--series-1)` blue, `-2` orange, `-3` aqua, `-4` yellow, `-5` magenta, `-6` green,
`-7` violet, `-8` red. Status: `var(--status-good|warning|serious|critical)`.
Text: `text-ink`, `text-ink2`, `text-muted`. Surfaces: `bg-raised`, `bg-plane`, `border-line`.

## Screen skeleton every module should follow

```tsx
"use client";
export default function Thing() {
  const app = useApp();
  return (
    <div className="space-y-4">
      <PageHeader />                 {/* h1 + one-line "what this replaces" */}
      <div className="grid …">…</div>{/* 3–4 stat tiles */}
      <Card>…main working surface…</Card>
      <Card>…the before/after or the mechanism explainer…</Card>
    </div>
  );
}
```

Start each module with a heading block in this shape (copy it):

```tsx
<div className="flex items-start justify-between gap-4 flex-wrap">
  <div>
    <h1 className="text-xl font-semibold text-ink">Size Sets</h1>
    <p className="text-sm text-ink2 mt-1 max-w-2xl">
      One sentence saying what this replaces and why it matters.
    </p>
  </div>
  <Chip tone="brand">Replaces: Power BI report #23 + WhatsApp</Chip>
</div>
```
