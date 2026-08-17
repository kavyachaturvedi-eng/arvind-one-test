"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Live Execution — every store's day, rolled up live for planning and the CEO.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { NOW } from "@/lib/seed";
import {
  allExecutionStatus,
  estateExecution,
  executionStatus,
  liveFeed,
  type ExecutionStatus,
} from "@/lib/engine";
import { useApp } from "@/lib/state";
import {
  Card,
  Chip,
  Empty,
  Meter,
  SectionTitle,
  Stat,
  StatusDot,
  Tabs,
  inr,
  pct,
  relTime,
} from "@/components/ui";

const CHANNEL_LABEL: Record<string, string> = {
  briefing: "Briefing",
  floor_walk: "Floor walk",
  scan: "Stock scan",
  transfer: "Transfer",
  omni: "Online order",
  outward: "Outward",
  ticket: "Issue",
  cash: "Cash",
  replenishment: "Replenishment",
};

export default function LiveExecution() {
  const app = useApp();
  const e = estateExecution();
  const statuses = useMemo(() => allExecutionStatus(), []);
  const feed = useMemo(() => liveFeed(30), []);
  const [filter, setFilter] = useState<"all" | "attention" | "behind">("all");

  const shown = statuses
    .filter((s) => (filter === "all" ? true : filter === "behind" ? s.health === "behind" : s.health !== "on_track"))
    .sort((a, b) => healthRank(a.health) - healthRank(b.health) || a.achievement - b.achievement);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">Live execution</h1>
          <p className="text-sm text-ink2 mt-1.5 max-w-2xl leading-relaxed">What every store is doing right now.</p>
        </div>
        <Chip tone="good" icon={<span className="w-2 h-2 rounded-full pulse-crit inline-block" style={{ background: "var(--status-good)" }} />}>
          Live
        </Chip>
      </div>

      {/* Estate pulse */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Trading now" value={`${e.storesTrading}/${e.storesTotal}`} sub="Stores open and executing" tone="good" />
        <Stat
          label="Briefings done"
          value={`${e.briefingsDone}/${e.storesTotal}`}
          sub="Morning briefing submitted in-app"
          tone={e.briefingsDone >= e.storesTotal * 0.8 ? "good" : "warn"}
        />
        <Stat
          label="Tasks completed"
          value={pct(e.tasksDone / Math.max(1, e.tasksTotal))}
          sub={`${e.tasksDone} of ${e.tasksTotal} across the estate`}
        />
        <Stat label="Open exceptions" value={String(e.exceptionsOpen)} sub="Size sets needing a decision" tone="warn" onClick={() => app.go("performance")} />
        <Stat
          label="Needs attention"
          value={String(e.attention + e.behind)}
          sub={`${e.behind} behind · ${e.attention} watch · ${e.onTrack} on track`}
          tone={e.behind > 0 ? "critical" : "warn"}
          emphasis
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Store grid */}
        <div className="lg:col-span-2">
          <Card>
            <SectionTitle
              title="Every store, right now"
              sub="Green is on plan; amber needs a look; red is behind on more than one front. Open a store to see its manager's view."
              right={
                <Tabs
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { id: "all", label: "All", count: statuses.length },
                    { id: "attention", label: "Needs a look", count: statuses.filter((s) => s.health !== "on_track").length },
                    { id: "behind", label: "Behind", count: statuses.filter((s) => s.health === "behind").length },
                  ]}
                />
              }
            />
            <div className="grid sm:grid-cols-2 gap-2.5">
              {shown.map((s) => (
                <StoreCard key={s.store.id} s={s} onOpen={() => { app.setRole("store"); app.setStore(s.store.id); app.go("home"); }} />
              ))}
              {shown.length === 0 && <Empty title="Nothing in this state" body="Every store is on track right now." />}
            </div>
          </Card>
        </div>

        {/* Live feed */}
        <div>
          <Card>
            <SectionTitle title="Activity feed" sub="What stores are doing, newest first." right={<StatusDot tone="good" />} />
            <ol className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
              {feed.map((ev) => {
                const store = statuses.find((s) => s.store.id === ev.storeId)?.store;
                return (
                  <li key={ev.id} className="flex items-start gap-2.5">
                    <StatusDot tone={ev.severity === "critical" ? "critical" : ev.severity === "good" ? "good" : ev.severity === "warn" ? "warn" : "neutral"} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-ink leading-snug">{ev.label}</div>
                      <div className="text-2xs text-muted mt-0.5">
                        <span className="font-medium">{store?.name}</span> · {CHANNEL_LABEL[ev.channel]} · {relTime(ev.at, NOW)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      </div>

    </div>
  );
}

function healthRank(h: ExecutionStatus["health"]) {
  return h === "behind" ? 0 : h === "attention" ? 1 : 2;
}

function StoreCard({ s, onOpen }: { s: ExecutionStatus; onOpen: () => void }) {
  const tone = s.health === "behind" ? "critical" : s.health === "attention" ? "warn" : "good";
  const accent = tone === "critical" ? "var(--status-critical)" : tone === "warn" ? "var(--status-warning)" : "var(--status-good)";
  return (
    <button
      onClick={onOpen}
      className="text-left rounded-xl border p-3 hover:shadow-pop transition-shadow bg-raised"
      style={{ borderColor: s.health === "on_track" ? "var(--line)" : accent }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink truncate flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} />
            {s.store.name}
          </div>
          <div className="text-2xs text-muted mt-0.5">
            {s.store.brand} · {s.store.city} · opened {s.openedAt}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold num text-ink">{pct(s.achievement)}</div>
          <div className="text-2xs text-muted">of target</div>
        </div>
      </div>

      {/* Execution checklist — the live bit */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3 text-2xs">
        <Row ok={s.briefingDone} label={s.briefingDone ? `Briefing ${s.briefingAt}` : "Briefing pending"} />
        <Row ok={s.floorWalkPct >= 0.99} label={`Floor walk ${pct(s.floorWalkPct)}`} warn={s.floorWalkPct < 0.6} />
        <Row ok={s.sizeSetOpen === 0} label={`${s.sizeSetOpen} size exceptions`} warn={s.sizeSetOpen > 0} />
        <Row ok={s.omniPending === 0} label={`${s.omniPending} orders to pack`} warn={s.omniPending > 2} />
        <Row ok={s.ticketsBreaching === 0} label={s.ticketsBreaching ? `${s.ticketsBreaching} SLA breach` : "No SLA breach"} warn={s.ticketsBreaching > 0} />
        <Row ok={false} neutral label={`${s.tasksDone}/${s.tasksTotal} tasks`} />
      </div>

      <div className="mt-2.5 pt-2 border-t border-line text-2xs text-muted truncate">
        <span className="text-ink2">Just now:</span> {s.lastActivity}
      </div>
    </button>
  );
}

function Row({ ok, warn, neutral, label }: { ok: boolean; warn?: boolean; neutral?: boolean; label: string }) {
  const tone = neutral ? "neutral" : ok ? "good" : warn ? "warn" : "neutral";
  return (
    <span className="inline-flex items-center gap-1.5 text-ink2">
      <StatusDot tone={tone as "good" | "warn" | "neutral"} />
      <span className="truncate">{label}</span>
    </span>
  );
}

