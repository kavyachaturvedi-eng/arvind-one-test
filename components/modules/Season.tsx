"use client";

// The season, in three phases.
//
// Pre-season is the buy and the first allocation. In-season is the only phase
// where anything can still be changed, and it is where a planner actually
// lives — so it gets the depth. Post-season is what the buy taught us, which is
// the only thing that improves the next one.
//
// The four in-season decisions — availability, markdown, pull-back, recut — are
// ranked against each other by money. Kept in four screens, the biggest one
// hides behind whichever screen you happened to open.

import React, { useMemo, useState } from "react";
import { Card, Chip, Empty, Meter, SectionTitle, Stat, StatusDot, Table, Tabs, Td, Th, fmtDate, inr, pct } from "@/components/ui";
import StoreLink from "@/components/StoreLink";
import Trust from "@/components/Trust";
import {
  allDropPerformance,
  allocationSplit,
  estateSummary,
  inSeasonActions,
  planningStores,
  rosWatch,
  seasonState,
  vitalsFor,
  type InSeasonAction,
} from "@/lib/engine";
import { DROPS, OTB, storeById, styleById } from "@/lib/seed";
import { otbRemaining } from "@/lib/rules";
import { useApp } from "@/lib/state";

type Phase = "pre" | "in" | "post";

const KIND_LABEL: Record<InSeasonAction["kind"], string> = {
  availability: "Availability",
  markdown: "Markdown",
  pullback: "Pull back",
  recut: "Recut",
};

export default function Season() {
  const app = useApp();
  const stores = planningStores();
  const state = useMemo(() => seasonState(), []);
  const [phase, setPhase] = useState<Phase>(state.phase);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">{state.season.name}</h1>
          <p className="text-sm text-ink2 mt-1">
            Day {state.dayOfSeason} · {state.daysLeft} to go · {state.dropsLanded} of {state.dropsTotal} drops landed
          </p>
        </div>
        <Tabs
          value={phase}
          onChange={setPhase}
          options={[
            { id: "pre", label: "Pre-season" },
            { id: "in", label: "In-season" },
            { id: "post", label: "Post-season" },
          ]}
        />
      </div>

      {phase !== state.phase && (
        <div className="text-2xs text-muted">
          The season is in its {state.phase === "in" ? "in-season" : state.phase === "pre" ? "pre-season" : "post-season"} phase today.
        </div>
      )}

      {phase === "pre" && <PreSeason />}
      {phase === "in" && <InSeason />}
      {phase === "post" && <PostSeason />}
    </div>
  );
}

// ── Pre-season ───────────────────────────────────────────────────────────────

function PreSeason() {
  const stores = planningStores();
  const brand = stores[0]?.brand ?? "Tommy Hilfiger";
  // OTB is held per category; the phase view wants the brand's whole book.
  const lines = OTB.filter((o) => o.brand === brand);
  const budgetUnits = lines.reduce((a, o) => a + o.budgetUnits, 0);
  const committedUnits = lines.reduce((a, o) => a + o.committedUnits, 0);
  const budgetValue = lines.reduce((a, o) => a + o.budgetValue, 0);
  const left = otbRemaining({ budgetUnits, committedUnits });

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="OTB budget" value={inr(budgetValue, { compact: true })} sub={`${budgetUnits.toLocaleString("en-IN")} units`} emphasis />
        <Stat label="Committed" value={pct(left.pctConsumed)} sub={`${committedUnits.toLocaleString("en-IN")} units`} />
        <Stat label="Left to commit" value={left.units.toLocaleString("en-IN")} tone={left.units > 0 ? "good" : "critical"} sub="units" />
        <Stat label="Drops bought" value={String(DROPS.filter((d) => d.seasonId === lines[0]?.seasonId).length)} />
        <Stat label="Doors to allocate" value={String(stores.length)} />
      </div>

      <Card>
        <SectionTitle title="What happens in this phase" />
        <Table>
          <thead>
            <tr><Th>Step</Th><Th>When</Th><Th>Where it is done</Th></tr>
          </thead>
          <tbody>
            <tr>
              <Td className="text-ink">Buy the season against OTB</Td>
              <Td className="text-xs text-ink2">A year out</Td>
              <Td className="text-xs text-ink2">OTB</Td>
            </tr>
            <tr>
              <Td className="text-ink">Initial allocation by door and drop</Td>
              <Td className="text-xs text-ink2">Before the drop lands</Td>
              <Td className="text-xs text-ink2">Allocation</Td>
            </tr>
            <tr>
              <Td className="text-ink">Revise it on the latest read</Td>
              <Td className="text-xs text-ink2">Weeks before launch</Td>
              <Td className="text-xs text-ink2">Allocation · recut</Td>
            </tr>
            <tr>
              <Td className="text-ink">Set the holdback</Td>
              <Td className="text-xs text-ink2">At the buy</Td>
              <Td className="text-xs text-ink2">Assumptions</Td>
            </tr>
          </tbody>
        </Table>
      </Card>
    </>
  );
}

// ── In-season: the action layer ──────────────────────────────────────────────

function InSeason() {
  const app = useApp();
  const stores = planningStores();
  const actions = useMemo(() => inSeasonActions(stores, 14), [stores]);
  const [kind, setKind] = useState<"all" | InSeasonAction["kind"]>("all");
  const watch = useMemo(() => rosWatch(stores, 10), [stores]);

  const shown = kind === "all" ? actions : actions.filter((a) => a.kind === kind);
  const total = actions.reduce((a, x) => a + x.value, 0);
  const countOf = (k: InSeasonAction["kind"]) => actions.filter((a) => a.kind === k).length;

  function act(a: InSeasonAction) {
    // Each action lands in the queue that owns it, with the reason carried over.
    if (a.kind === "availability") {
      app.go("replenish");
    } else if (a.kind === "pullback" || a.kind === "markdown") {
      app.go("renew");
    } else {
      app.go("allocate");
    }
    app.toastNow(`${KIND_LABEL[a.kind]} · ${a.title}`, "info");
  }

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="On the table" value={inr(total, { compact: true })} tone="warn" emphasis sub={`${actions.length} decisions`} />
        <Stat label="Availability" value={String(countOf("availability"))} tone={countOf("availability") ? "critical" : "good"} />
        <Stat label="Markdown" value={String(countOf("markdown"))} />
        <Stat label="Pull back" value={String(countOf("pullback"))} />
        <Stat label="Recut" value={String(countOf("recut"))} />
      </div>

      <Card>
        <SectionTitle
          title="Ranked by what it is worth"
          right={
            <div className="flex items-center gap-2 flex-wrap">
              <Trust inputs={["soh", "sales"]} />
              {(["all", "availability", "markdown", "pullback", "recut"] as const).map((k) => (
                <button
                  key={k}
                  data-season-kind={k}
                  onClick={() => setKind(k)}
                  className={`chip !text-2xs ${kind === k ? "!border-[color:var(--brand)] !text-[color:var(--brand)]" : ""}`}
                >
                  {k === "all" ? "All" : KIND_LABEL[k]}
                </button>
              ))}
            </div>
          }
        />
        {shown.length === 0 ? (
          <Empty title="Nothing in this queue" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Decision</Th>
                <Th>What</Th>
                <Th>Why</Th>
                <Th align="right">Worth</Th>
                <Th align="right">Act</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} data-season-action={a.kind}>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink2">
                      <StatusDot tone={a.kind === "availability" ? "critical" : a.kind === "recut" ? "good" : "warn"} />
                      {KIND_LABEL[a.kind]}
                    </span>
                  </Td>
                  <Td className="text-ink">{a.title}</Td>
                  <Td className="text-xs text-ink2">{a.detail}</Td>
                  <Td align="right" className="num text-xs">{inr(a.value, { compact: true })}</Td>
                  <Td align="right">
                    <button className="btn !py-1 !text-2xs" data-season-act onClick={() => act(a)}>
                      Open
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <SectionTitle
          title="Rate of sale, at style level"
          right={<Chip>Where ROS is high, availability has to hold</Chip>}
        />
        {watch.length === 0 ? (
          <Empty title="Nothing selling fast enough to worry about" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Style</Th>
                <Th>Store</Th>
                <Th align="right">ROS</Th>
                <Th align="right">On floor</Th>
                <Th align="right">Cover</Th>
                <Th>Size set</Th>
                <Th align="right">At risk</Th>
                <Th>Fix</Th>
              </tr>
            </thead>
            <tbody>
              {watch.map((r) => (
                <tr key={`${r.store.id}-${r.style.id}`} data-ros-row>
                  <Td className="num text-xs text-ink2">{r.style.id}</Td>
                  <Td className="text-ink">{r.style.name}</Td>
                  <Td><StoreLink storeId={r.store.id} muted /></Td>
                  <Td align="right" className="num text-xs font-medium text-ink">{r.ros.toFixed(1)}</Td>
                  <Td align="right" className="num text-xs">{r.sellable}</Td>
                  <Td align="right" className="num text-xs" style={{ color: r.cover < 14 ? "var(--status-critical)" : undefined }}>
                    {Math.round(r.cover)}d
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink2">
                      <StatusDot tone={r.status === "broken" ? "critical" : r.status === "at_risk" ? "warn" : "good"} />
                      {r.status.replace("_", " ")}
                    </span>
                  </Td>
                  <Td align="right" className="num text-xs">{inr(r.risk, { compact: true })}</Td>
                  <Td className="text-xs text-ink2">
                    {r.fix === "pull" ? `Pull ${r.warehouse} held` : r.fix === "transfer" ? "Transfer in" : "Recut"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <RecutCard />
    </>
  );
}

/** A door beating its target has earned more stock — in what, is the question. */
function RecutCard() {
  const stores = planningStores();
  const earners = useMemo(
    () =>
      stores
        .map((s) => ({ store: s, v: vitalsFor(s.id) }))
        .filter((x) => x.v.achievement >= 1.04)
        .sort((a, b) => b.v.achievement - a.v.achievement),
    [stores],
  );
  const [pick, setPick] = useState(earners[0]?.store.id ?? stores[0]?.id ?? "");
  const target = earners.find((e) => e.store.id === pick) ?? earners[0];
  const units = target ? Math.round(target.store.norm * (target.v.achievement - 1) * 1.6) : 0;
  const split = useMemo(() => (target ? allocationSplit(target.store.id, units) : null), [target, units]);

  if (!target || !split) return null;

  return (
    <Card>
      <SectionTitle
        title="Recut"
        right={
          <select
            value={pick}
            data-recut-store
            onChange={(e) => setPick(e.target.value)}
            className="border border-line bg-raised px-2 py-1 text-xs text-ink"
          >
            {earners.map((e) => (
              <option key={e.store.id} value={e.store.id}>
                {e.store.name} · {pct(e.v.achievement)}
              </option>
            ))}
          </select>
        }
      />
      <p className="text-sm text-ink2">
        {target.store.name} is trading at {pct(target.v.achievement)} of target. That earns roughly{" "}
        <span className="num text-ink font-medium">{units.toLocaleString("en-IN")}</span> more units — split by what it sells,
        not by what it already holds.
      </p>
      <div className="grid lg:grid-cols-2 gap-4 mt-3 items-start">
        <div>
          <div className="label mb-1">By category</div>
          <Table>
            <tbody>
              {split.byCategory.map((r) => (
                <tr key={r.key} data-recut-cat>
                  <Td className="text-ink">{r.label}</Td>
                  <Td align="right" className="num text-xs text-ink2">{pct(r.share)}</Td>
                  <Td align="right" className="num text-xs font-medium text-ink">{r.units}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <div>
          <div className="label mb-1">By price point</div>
          <Table>
            <tbody>
              {split.byBand.map((r) => (
                <tr key={r.key} data-recut-band>
                  <Td className="text-ink">{r.label}</Td>
                  <Td align="right" className="num text-xs text-ink2">{pct(r.share)}</Td>
                  <Td align="right" className="num text-xs font-medium text-ink">{r.units}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </Card>
  );
}

// ── Post-season ──────────────────────────────────────────────────────────────

function PostSeason() {
  const stores = planningStores();
  const drops = useMemo(() => allDropPerformance(stores), [stores]);
  const summary = useMemo(() => estateSummary(stores, "season"), [stores]);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Season sales" value={inr(summary.sales, { compact: true })} emphasis />
        <Stat label="Full-price sell-through" value={pct(summary.sellThrough)} tone={summary.sellThrough >= 0.85 ? "good" : "warn"} />
        <Stat label="Still on the floor" value={summary.sellableUnits.toLocaleString("en-IN")} />
        <Stat label="At risk" value={inr(summary.valueAtRisk, { compact: true })} tone="critical" />
        <Stat label="Drops" value={String(drops.length)} />
      </div>

      <Card>
        <SectionTitle title="What each drop did" right={<Trust inputs={["soh", "sales"]} />} />
        {drops.length === 0 ? (
          <Empty title="No drops landed yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Drop</Th>
                <Th>Landed</Th>
                <Th align="right">Styles</Th>
                <Th align="right">On floor</Th>
                <Th align="right">Held back</Th>
                <Th align="right">Sell-through</Th>
                <Th>Against the season</Th>
              </tr>
            </thead>
            <tbody>
              {drops.map((d) => (
                <tr key={d.drop.id} data-drop-row>
                  <Td className="text-ink">{d.drop.label}</Td>
                  <Td className="text-xs text-ink2">{fmtDate(d.drop.landsAt)}</Td>
                  <Td align="right" className="num text-xs">{d.styles}</Td>
                  <Td align="right" className="num text-xs">{d.onFloor.toLocaleString("en-IN")}</Td>
                  <Td align="right" className="num text-xs text-ink2">{d.warehouse.toLocaleString("en-IN")}</Td>
                  <Td align="right" className="num text-xs" style={{ color: d.sellThrough < 0.5 ? "var(--status-critical)" : undefined }}>
                    {pct(d.sellThrough)}
                  </Td>
                  <Td><Meter value={d.sellThrough} target={summary.sellThrough} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <SectionTitle title="What it should change" />
        <p className="text-sm text-ink2 leading-relaxed">
          {drops.length > 0 &&
            (() => {
              const best = [...drops].sort((a, b) => b.sellThrough - a.sellThrough)[0];
              const worst = [...drops].sort((a, b) => a.sellThrough - b.sellThrough)[0];
              return `${best.drop.label} sold through at ${pct(best.sellThrough)} against ${worst.drop.label} at ${pct(worst.sellThrough)}. On a ${pct(summary.sellThrough)} season, the depth behind ${worst.drop.label} is the line to argue about in the next buy.`;
            })()}
        </p>
      </Card>
    </>
  );
}
