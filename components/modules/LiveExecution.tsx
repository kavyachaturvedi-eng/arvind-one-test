"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Live Execution — every store's day, rolled up live for planning and the CEO.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { NOW } from "@/lib/seed";
import { allExecutionStatus, estateExecution, strategicMoves, type ExecutionStatus } from "@/lib/engine";
import { agentActivity } from "@/lib/agents";
import { slaState } from "@/lib/rules";
import { useApp } from "@/lib/state";
import { Card, Chip, Empty, SectionTitle, Stat, StatusDot, Tabs, inr, pct } from "@/components/ui";

export default function LiveExecution() {
  const app = useApp();
  const e = estateExecution();
  const statuses = useMemo(() => allExecutionStatus(), []);
  // Admin sees the short version: only stores needing a look, no approval queue.
  const admin = app.role === "leadership";
  const [filter, setFilter] = useState<"all" | "attention" | "behind">(admin ? "attention" : "all");

  const shown = statuses
    .filter((s) => (filter === "all" ? true : filter === "behind" ? s.health === "behind" : s.health !== "on_track"))
    .sort((a, b) => healthRank(a.health) - healthRank(b.health) || a.achievement - b.achievement);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">Live execution</h1>
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
        />
        <Stat label="Open exceptions" value={String(e.exceptionsOpen)} sub="Size sets needing a decision" tone="warn" onClick={() => app.go("performance")} />
        <Stat
          label="Needs attention"
          value={String(e.attention + e.behind)}
          tone={e.behind > 0 ? "critical" : "warn"}
          emphasis
        />
      </div>

      {/* Watchtower — the agent's anomaly flags */}
      <Card>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="serif-accent text-sm shrink-0">Arvi</span>
          <span className="label">Watchtower flags</span>
          {agentActivity("watchtower", app.storeId).filter((x) => x.kind === "flagged").map((x) => (
            <span key={x.label} className="inline-flex items-center gap-2 border border-line px-2.5 py-1.5 text-xs text-ink">
              <StatusDot tone="critical" />
              {x.label}
            </span>
          ))}
          <button className="btn !py-1 !text-2xs" onClick={() => app.go("agents")}>All agents</button>
        </div>
      </Card>

      <div className={admin ? "" : "grid lg:grid-cols-3 gap-5"}>
        {/* Store grid */}
        <div className={admin ? "" : "lg:col-span-2"}>
          <Card>
            <SectionTitle
              title="Every store, right now"
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
            <div className={`grid sm:grid-cols-2 ${admin ? "xl:grid-cols-3" : ""} gap-2.5`}>
              {shown.map((s) => (
                <StoreCard key={s.store.id} s={s} onOpen={() => { app.setRole("store"); app.setStore(s.store.id); app.go("home"); }} />
              ))}
              {shown.length === 0 && <Empty title="Nothing in this state" body="Every store is on track right now." />}
            </div>
          </Card>
        </div>

        {/* Action queue — planning only; admin reads, planning decides */}
        {!admin && (
          <div>
            <ActionQueue />
          </div>
        )}
      </div>

    </div>
  );
}

// The planner's queue: everything waiting on a decision, ranked by value.
function ActionQueue() {
  const app = useApp();
  const moves = useMemo(() => strategicMoves(4), []);
  const [acted, setActed] = useState<string[]>([]);

  const istPending = app.ist.filter((r) => r.status === "pending_approval");
  const quotePending = app.tickets.filter((t) => t.status === "awaiting_approval");
  const breaching = app.tickets
    .filter((t) => t.status !== "resolved" && slaState(t.raisedAt, t.slaHours, NOW).breached)
    .slice(0, 4);
  const openMoves = moves.filter((m) => !acted.includes(m.id));

  function approveTicket(id: string) {
    app.dispatch({ type: "ticket:update", id, patch: { status: "in_progress" } });
    app.toastNow(`${id} approved — vendor dispatched`, "good");
  }
  function approveIst(id: string) {
    app.dispatch({ type: "ist:status", id, status: "approved", actor: app.actorName, label: `Approved by ${app.actorName}`, by: app.actorName });
    app.toastNow(`${id} approved — pick task created`, "good");
  }
  function approveMove(id: string) {
    setActed((a) => [...a, id]);
    app.toastNow(`${id} approved — transfer raised`, "good");
  }

  const total = istPending.length + quotePending.length + breaching.length + openMoves.length;

  return (
    <Card>
      <SectionTitle title="Decide now" right={<Chip tone={total ? "warn" : "good"}>{total}</Chip>} />
      <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
        {istPending.map((r) => (
          <QueueRow
            key={r.id}
            tone="warn"
            title={`Transfer ${r.id} — ${r.qty} unit${r.qty > 1 ? "s" : ""}, customer waiting`}
            sub="One gated policy check"
            cta="Approve"
            onAct={() => approveIst(r.id)}
          />
        ))}
        {quotePending.map((t) => (
          <QueueRow
            key={t.id}
            tone="warn"
            title={`${t.id} — quote ${inr(t.quoteValue ?? 0)}`}
            sub={`${t.title} · above store threshold`}
            cta="Approve"
            onAct={() => approveTicket(t.id)}
          />
        ))}
        {breaching.map((t) => (
          <QueueRow
            key={t.id}
            tone="critical"
            title={`${t.id} — SLA breached`}
            sub={t.title}
            cta="Escalate"
            onAct={() => {
              app.dispatch({ type: "ticket:update", id: t.id, patch: { escalationLevel: Math.min(3, (t.escalationLevel ?? 0) + 1) } });
              app.toastNow(`${t.id} escalated`, "warn");
            }}
          />
        ))}
        {openMoves.map((m) => (
          <QueueRow
            key={m.id}
            tone="neutral"
            title={`Move ${m.units} × ${m.styleName} (${m.size})`}
            cta="Approve"
            onAct={() => approveMove(m.id)}
          />
        ))}
        {total === 0 && <Empty title="Queue clear" body="Nothing is waiting on a decision." />}
      </div>
    </Card>
  );
}

function QueueRow({ tone, title, sub, cta, onAct }: { tone: "warn" | "critical" | "neutral"; title: string; sub?: string; cta: string; onAct: () => void }) {
  return (
    <div className="rounded-lg border border-line p-2.5 flex items-start gap-2.5">
      <StatusDot tone={tone} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-ink leading-snug">{title}</div>
        <div className="text-2xs text-muted mt-0.5 leading-snug">{sub}</div>
      </div>
      <button className="btn-primary !py-1 !text-2xs shrink-0" onClick={onAct}>{cta}</button>
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

