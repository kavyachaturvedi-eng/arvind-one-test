# Retail Planning — invented thresholds and assumptions

Every number in this file was **invented by us**, not supplied by Arvind Fashions.
They exist so the planning layer can run end to end before AFL's real
replenishment logic is available. Praveen offered the Vector replenishment/IST
documentation and a portal walkthrough — when that arrives, these get replaced.

Each one is a **setting**, not a truth. All of them are visible and editable in
the app under Planning → Settings (`planset`), which reads the same constants
this file documents (`ASSUMPTIONS` in `lib/rules.ts`). If you change a number
here, change it there.

---

## 1 · Warehouse holdback

| | Value | Source |
|---|---|---|
| Holdback today | **25%** | Confirmed by Pushpal, 20 Aug 2026 ("current is 20–25%, keep it 25") |
| Holdback goal | **40%** | Stated goal, not current state |

The source documents disagreed: Tarun said ~20% (16 Jul), Praveen implied 40–45%
(55–60% delivered up front), and the 10,000 / 6,000 / 2,000–3,000 worked example
implies 25–30%. We use **25% held at the warehouse, 75% pushed to stores at
launch**, and show the 40% goal as a target line.

## 2 · Fill rate

| | Value | Source |
|---|---|---|
| Healthy band | **97%–105% of norm** | Newme product manager call — "successful retailers maintain 97% to 105% fill rate against store capacity" |
| Replenishment trigger | **below 92%** | Invented |
| Overstock trigger | **above 112%** | Invented |

Norm is planned inventory in units, and is deliberately **not** display capacity
(Praveen: a store with lower display capacity may still carry a higher norm if it
sells fast). Norms are planning-owned and editable per store.

## 3 · Brokenness

| | Value | Source |
|---|---|---|
| Style is `at_risk` | **1 core size missing** | Existing rule, `lib/rules.ts` |
| Style is `broken` | **2+ core sizes missing** | Existing rule |
| Store-level brokenness trigger | **more than 55% of carried styles unhealthy** | Invented, and calibrated to the demo data |

The 55% is high because the synthetic dataset is deliberately broken so the store
screens have something real to show: across the 24 demo stores, brokenness runs
**25% to 70%, median 50%**. An 18% trigger fired on all 24 stores, which makes the
threshold meaningless. Against AFL's own data this number will be far lower —
which is the whole reason it is a setting and not a constant.

## 4 · Replenishment vs renewal

Definitions follow the Newme call and Tarun's 16 Jul framing:

- **Replenishment** — the same style returns, to fill specific size gaps. Mostly `core`.
- **Renewal** (a.k.a. refreshment) — a finished style is replaced by a *new* style,
  so the floor keeps looking fresh. Mostly `fashion`.

| | Value | Source |
|---|---|---|
| Default split, grade A | **65% replenish / 35% renew** | Invented |
| Default split, grade B | **72% / 28%** | Invented |
| Default split, grade C | **80% / 20%** | Invented |
| A style is "finished" and eligible for renewal | sell-through **≥ 78%** or **≤ 14 days** of full-price window left | Invented |

Renewal candidates are the brand's fashion styles this door is **under-weighted**
on, not only styles it has never carried. With a 47-style demo assortment, "never
carried" is nearly empty (0–2 styles per store), and under-weighted is the more
useful signal regardless: it is how a capsule gets consolidated into the doors
that can actually sell it, which is what Praveen described as a strategic move.

Rationale for the grade skew: A doors carry the widest range and can absorb more
newness; C doors carry a curated cut and lean on proven core.

## 5 · Run cadence

| | Value | Source |
|---|---|---|
| Replenishment run days | **Tuesday and Friday** | Confirmed by Pushpal, 20 Aug 2026 |

Praveen said "several times a week"; the first conversation said daily. Tue/Fri is
the confirmed cadence. The demo clock is frozen at **Thu 13 Aug 2026 11:42 IST**,
so the app shows the **last run as Tue 11 Aug** and the **next as Fri 14 Aug**.

## 6 · Core vs fashion

Treated as a **product-master attribute** (`Style.productType`), per Pushpal's
instruction — not derived. Tarun's definition: core is carried across more than
one season and is never discounted; fashion is seasonal and drives freshness.

`isNOS` is retained as a narrower flag: an always-on subset of core.

| | Value | Source |
|---|---|---|
| Target core share of units, grade A | **42%** | Invented |
| Target core share, grade B | **50%** | Invented |
| Target core share, grade C | **58%** | Invented |

## 7 · One brand, and a flat information architecture

Planning screens cover **Tommy Hilfiger only** (confirmed by Pushpal, 20 Aug).
A category planner owns one brand, so there is no brand filter anywhere in the
planning IA. That is **7 of the 24 demo stores**, across 5 clusters — if the
planning estate needs to be bigger for a demo, the fix is to add Tommy doors to
the seed, not to add a brand switch.

"Area" and "cluster" are the same thing (confirmed); we use *cluster*. Cluster
managers report to regional managers, per the Newme org description.

The hierarchy is still Region → Cluster → Store in the data, but the screens are
**flat**: one list of every store, plus filters (region, cluster, grade, fill
band) that narrow it. The earlier version drilled brand → region → cluster →
store and replaced the numbers above you at each step, so it was impossible to
tell what the figures on screen described. Filters say plainly what has been
narrowed and to what.

Every screen is addressable: `?m=store360&store=TO-MUM-001&cluster=CL-MUM`. The
browser back button moves back a screen instead of leaving the app.

## 7a · Periods

The KPI block runs on **today / this week / month to date**, not against last
year. This-week figures come from a deterministic seven-day series whose last
point is today, so the two can never contradict each other. Same-day-last-year
was removed on 20 Aug — a period filter carries more than a single LY column.

## 8 · Two planning personas

Modelled from Praveen's description of the planning organisation:

| Persona | Role id | Owns |
|---|---|---|
| Retail Planning | `planner` | Day-to-day: the run, Store 360, store liaison, IST, RTV, norms |
| Buying team | `catplan` | Season plan, OTB, core/NOS strategy, buy depth, allocation |

Named as AFL names them (confirmed by Pushpal, 20 Aug) — the earlier
"Regional"/"Category" labels were ours, not theirs.

### A word on "core"

The word does two jobs in this domain and we only use it for one. **Core** is a
product type: a style carried across more than one season, never discounted.
The pivotal sizes that decide whether a size set is broken are called
**pivotal** everywhere in the UI — Praveen's own term — because "core size" on a
screen that also says "Core / Fashion" reads as a contradiction.

## 9 · OTB

Open To Buy is modelled **lightly and deliberately** — budget, committed and
received units per brand × category × season, which yields OTB remaining. The
full season-planning workbench is out of scope for this round; Store 360 and the
OTB screen show consumption against budget only.

## 10 · What is still not real

Season length, drop dates and the LY comparison base are all generated from the
deterministic seed. There is no forecasting model: allocation recommendations are
transparent arithmetic over rate of sale, norms and the plan, exactly as the
store-side rules already work.
