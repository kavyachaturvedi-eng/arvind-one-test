"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Today — the store manager's execution console. The store runs its day from
// here; everything rolls up to Live Execution.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from "react";
import { NOTIFICATIONS, NOW, ROLES } from "@/lib/seed";
import { slaState } from "@/lib/rules";
import { enterprise, missedOpportunities, sizeSetExceptions, topSellers, trend, vitalsFor } from "@/lib/engine";
import { useApp, type ModuleId } from "@/lib/state";
import {
  BarChart,
  Callout,
  Card,
  Chip,
  Delta,
  Empty,
  Freshness,
  SectionTitle,
  SlaBar,
  Stat,
  StatusDot,
  Swatch,
  inr,
  pct,
  relTime,
} from "@/components/ui";

export default function Home() {
  const app = useApp();
  const role = ROLES.find((r) => r.id === app.role)!;
  const v = vitalsFor(app.storeId);
  const exceptions = useMemo(() => sizeSetExceptions(app.storeId, 3), [app.storeId]);
  const missed = useMemo(() => missedOpportunities(app.storeId, 1), [app.storeId]);
  const tasks = app.tasks
    .filter((t) => t.storeId === app.storeId && t.status !== "done")
    .sort((a, b) => a.priority - b.priority || a.dueAt - b.dueAt);

  const dayVsLy = ((v.todaySales - v.lySameDay) / Math.max(1, v.lySameDay)) * 100;

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">Good morning, {role.person.split(" ")[0]}</h1>
          <p className="text-sm text-ink2 mt-1.5 max-w-2xl leading-relaxed">
            Today&apos;s decisions, ranked by what they are worth.
          </p>
        </div>
        <Chip tone="good">● {v.store.name}</Chip>
      </div>

      {/* Vitals */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat
          label="Month to date"
          value={inr(v.mtdSales, { compact: true })}
          sub={
            <span className="flex items-center gap-1.5 flex-wrap">
              <span className="num">{pct(v.achievement)} of target</span>
              <Delta value={(v.achievement - 1) * 100} suffix="pts" />
            </span>
          }
          tone={v.achievement >= 1 ? "good" : v.achievement >= 0.9 ? "warn" : "critical"}
          spark={trend(`mtd-${app.storeId}`, 13, 100, 0.03)}
        />
        <Stat
          label="Today"
          value={inr(v.todaySales, { compact: true })}
          sub={
            <span className="flex items-center gap-1.5">
              <span>vs {inr(v.lySameDay, { compact: true })} LY</span>
              <Delta value={dayVsLy} suffix="%" />
            </span>
          }
          freshness={6}
        />
        <Stat label="Conversion" value={pct(v.conversion, 1)} sub={`${v.bills} bills · ATV ${inr(v.atv)}`} tone={v.conversion >= 0.14 ? "good" : "warn"} />
        <Stat
          label="Size-set health"
          value={pct(v.sizeSetScore)}
          sub={`${v.brokenStyles} broken · ${v.atRiskStyles} at risk`}
          tone={v.sizeSetScore >= 0.9 ? "good" : v.sizeSetScore >= 0.75 ? "warn" : "critical"}
          onClick={() => app.go("sizeset")}
        />
        <Stat
          label="At risk this week"
          value={inr(v.valueAtRisk, { compact: true })}
          sub="Full-price sales lost if nothing moves"
          tone="critical"
          onClick={() => app.go("sizeset")}
          emphasis
        />
      </div>

      {/* Quick actions — app-like tap targets */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {QUICK.map((q) => (
          <button
            key={q.id}
            onClick={() => app.go(q.id)}
            className="card p-4 text-center hover:shadow-pop transition-shadow"
          >
            <div className="text-2xl mb-1.5 opacity-80">{q.glyph}</div>
            <div className="text-xs font-semibold text-ink">{q.label}</div>
            <div className="text-2xs text-muted mt-0.5 leading-snug">{q.sub}</div>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Do these first */}
        <Card className="lg:col-span-2">
          <SectionTitle title="Do these first" sub="Ranked by money at stake." right={<Freshness minutes={2} />} />
          <div className="space-y-2.5">
            {exceptions.map((e, i) => (
              <ActionRow
                key={e.style.id}
                index={i + 1}
                swatch={e.style.colourHex}
                title={`${e.style.name} — size ${e.health.missingCore.join(" and ") || "core"} at zero`}
                body={e.decision.reason}
                value={e.valueAtRisk}
                cta={
                  e.decision.action === "transfer_in"
                    ? "Find a donor store"
                    : e.decision.action === "replenish_from_dc"
                    ? `Pull ${e.decision.units} from warehouse`
                    : e.decision.action === "stop_sell"
                    ? "Stop featuring"
                    : "Review"
                }
                onClick={() => app.go(e.decision.action === "transfer_in" ? "savesale" : "sizeset")}
                tone={e.health.status === "broken" ? "critical" : "warn"}
              />
            ))}
            {exceptions.length === 0 && <Empty title="No size-set exceptions right now" body="Every core size on every carried style is on the floor." />}
          </div>

          {missed.length > 0 && (
            <div className="mt-4 pt-3 border-t border-line">
              <Callout tone="warn" title={`${missed[0].style.name} sells faster elsewhere in the region`}>
                You hold {missed[0].sellable} units with a healthy size set, so this is a display problem, not a stock one —
                worth moving to a front table before you request more.
              </Callout>
            </div>
          )}
        </Card>

        {/* Queue */}
        <Card>
          <SectionTitle title="Your queue" sub="Corporate, system and exception work in one list." right={<Chip>{tasks.length}</Chip>} />
          <div className="space-y-2">
            {tasks.slice(0, 6).map((t) => {
              const sla = slaState(t.dueAt - t.slaHours * 3600_000, t.slaHours, NOW);
              return (
                <button key={t.id} onClick={() => app.go("storeday")} className="w-full text-left rounded-lg border border-line p-2.5 hover:bg-[color:var(--plane)] transition-colors">
                  <div className="flex items-start gap-2">
                    <StatusDot tone={t.priority === 1 ? "critical" : t.priority === 2 ? "warn" : "neutral"} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-ink leading-snug">{t.title}</div>
                      <div className="text-2xs text-muted mt-0.5">
                        {t.assignedTo}
                        {t.valueAtRisk ? ` · ${inr(t.valueAtRisk, { compact: true })} at risk` : ""}
                      </div>
                      <div className="mt-1.5">
                        <SlaBar pctConsumed={sla.pctConsumed} label={sla.remainingLabel} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {tasks.length === 0 && <Empty title="Queue is clear" />}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <SectionTitle title="Top sellers" sub="True rate of sale — stockout days excluded." />
          <BarChart
            data={topSellers(app.storeId, 6).map((s) => ({
              label: s.style.name,
              value: s.ros,
              tone: s.health.status === "healthy" ? "var(--series-1)" : "var(--status-warning)",
            }))}
            format={(n) => `${n.toFixed(2)}/day`}
          />
          <div className="text-2xs text-muted mt-3">Amber: selling well with a broken or at-risk size set.</div>
        </Card>

        <Card>
          <SectionTitle title="What changed while you were closed" />
          <div className="space-y-2.5">
            {NOTIFICATIONS.filter((n) => n.role === "all" || n.role === "store").map((n) => (
              <div key={n.id} className="flex items-start gap-2.5">
                <StatusDot tone={n.severity === "critical" ? "critical" : n.severity === "warn" ? "warn" : "neutral"} />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-ink">{n.title}</div>
                  <div className="text-2xs text-ink2 mt-0.5 leading-relaxed">{n.body}</div>
                  <div className="text-2xs text-muted mt-0.5">{relTime(n.at, NOW)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <SameNumberStrip />
    </div>
  );
}

const QUICK: { id: ModuleId; glyph: string; label: string; sub: string }[] = [
  { id: "savesale", glyph: "⇄", label: "Save a sale", sub: "Transfer a size in" },
  { id: "sizeset", glyph: "▤", label: "Scan & stock", sub: "Sizes, inward, counts" },
  { id: "omni", glyph: "◱", label: "Pack orders", sub: "Online fulfilment" },
  { id: "outward", glyph: "⇥", label: "Outward", sub: "RTV & pullback" },
  { id: "tickets", glyph: "⚑", label: "Raise issue", sub: "Scan the asset" },
  { id: "cash", glyph: "₹", label: "Cash & close", sub: "Reconcile the day" },
];

function ActionRow({
  index,
  swatch,
  title,
  body,
  value,
  cta,
  onClick,
  tone,
}: {
  index: number;
  swatch: string;
  title: string;
  body: string;
  value: number;
  cta: string;
  onClick: () => void;
  tone: "critical" | "warn";
}) {
  return (
    <div className="rounded-lg border border-line p-3 flex items-start gap-3">
      <div
        className="w-6 h-6 rounded-full grid place-items-center text-2xs font-bold shrink-0 mt-0.5"
        style={{ background: tone === "critical" ? "#fbe9e9" : "#fdf3dc", color: tone === "critical" ? "#8f1f1f" : "#7a5600" }}
      >
        {index}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Swatch hex={swatch} />
          <div className="text-sm font-medium text-ink leading-snug">{title}</div>
        </div>
        <div className="text-xs text-ink2 mt-1 leading-relaxed">{body}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold num" style={{ color: "var(--status-critical)" }}>
          {inr(value, { compact: true })}
        </div>
        <button onClick={onClick} className="btn-primary mt-1.5 !py-1.5 !text-xs whitespace-nowrap">
          {cta}
        </button>
      </div>
    </div>
  );
}

function SameNumberStrip() {
  const app = useApp();
  const e = enterprise();
  const v = vitalsFor(app.storeId);

  return (
    <Card>
      <SectionTitle
        title="Across the business"
        sub="The same figures, seen by role."
        right={
          <button className="btn !py-1.5 !text-xs" onClick={() => app.go("truth")}>
            Stock reconciliation
          </button>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ROLES.map((r) => (
          <button
            key={r.id}
            onClick={() => app.setRole(r.id)}
            className={`rounded-lg border p-3.5 text-left transition-colors ${
              app.role === r.id ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-line hover:bg-[color:var(--plane)]"
            }`}
          >
            <div className="label">{r.label}</div>
            <div className="text-xs text-ink2 mt-1 leading-snug">{LENS[r.id]}</div>
            <div className="text-lg font-semibold text-ink num mt-2">
              {r.id === "store" ? `${v.sellableUnits.toLocaleString("en-IN")} units` : r.id === "planner" ? `${e.brokenStyles} broken sets` : pct(e.sellThrough)}
            </div>
            <div className="text-2xs text-muted mt-0.5">{LENS_SUB[r.id]}</div>
          </button>
        ))}
      </div>
    </Card>
  );
}

const LENS: Record<string, string> = {
  store: "What can I sell today?",
  planner: "Where has the plan drifted from the floor?",
  leadership: "Are we selling at full price?",
};
const LENS_SUB: Record<string, string> = {
  store: "Sellable stock in this store",
  planner: "Estate-wide size-set exceptions",
  leadership: "Full-price sell-through",
};
