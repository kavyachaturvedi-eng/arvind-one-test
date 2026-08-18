"use client";

// AI Agents — the autonomous workers, their activity, and the approvals they
// are holding for a human. Autonomy is bounded and every action is logged.

import React, { useMemo, useState } from "react";
import { NOW } from "@/lib/seed";
import { agentActivity, agentApprovals, agentsFor, type AgentDef } from "@/lib/agents";
import { useApp } from "@/lib/state";
import { Card, Chip, Empty, SectionTitle, Stat, StatusDot, relTime } from "@/components/ui";

export default function Agents() {
  const app = useApp();
  const agents = useMemo(() => agentsFor(app.role), [app.role]);
  const [decided, setDecided] = useState<Record<string, "approved" | "rejected">>({});

  const approvals = agents.flatMap((a) => agentApprovals(a.id, app.storeId).map((ap) => ({ agent: a, ap })));
  const openApprovals = approvals.filter(({ ap }) => !decided[ap.id]);

  function decide(id: string, verdict: "approved" | "rejected", label: string) {
    setDecided((d) => ({ ...d, [id]: verdict }));
    app.dispatch({
      type: "audit",
      entry: { at: NOW, actor: app.actorName, action: `${verdict === "approved" ? "Approved" : "Rejected"} agent proposal: ${label}`, object: id, system: "Arvind One" },
    });
    app.toastNow(verdict === "approved" ? `Approved — the agent is executing it now` : `Rejected — the agent will not retry without new data`, verdict === "approved" ? "good" : "warn");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">AI Agents</h1>
          <p className="text-sm text-ink2 mt-1">Bounded autonomy: small moves run alone, big moves wait for you, everything is logged.</p>
        </div>
        <Chip tone={openApprovals.length ? "warn" : "good"}>{openApprovals.length} awaiting approval</Chip>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Agents on duty" value={String(agents.length)} sub="Scoped to your view" />
        <Stat label="Actions today" value={String(agents.reduce((n, a) => n + agentActivity(a.id, app.storeId).filter((x) => x.kind === "did").length, 0))} sub="Executed inside autonomy limits" tone="good" />
        <Stat label="Waiting on a human" value={String(openApprovals.length)} tone={openApprovals.length ? "warn" : "good"} sub="Above-limit moves and all pricing" emphasis />
        <Stat label="Flags raised" value={String(agents.reduce((n, a) => n + agentActivity(a.id, app.storeId).filter((x) => x.kind === "flagged").length, 0))} sub="Anomalies for a person to judge" />
      </div>

      {/* Approval queue — the human-in-the-loop heart of the screen */}
      {openApprovals.length > 0 && (
        <Card>
          <SectionTitle title="Waiting on you" sub="Approve and the agent executes; reject and it stands down." />
          <div className="space-y-2">
            {openApprovals.map(({ agent, ap }) => (
              <div key={ap.id} className="border border-line p-3 flex items-start gap-3">
                <span className="w-8 h-8 grid place-items-center border border-line shrink-0 text-sm">{agent.glyph}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">{ap.label}</div>
                  <div className="text-xs text-ink2 mt-0.5 leading-relaxed">{ap.detail}</div>
                  <div className="text-2xs mt-1" style={{ color: "var(--success-text)" }}>{ap.impact}</div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button className="btn-primary !py-1.5 !text-xs" onClick={() => decide(ap.id, "approved", ap.label)}>Approve</button>
                  <button className="btn !py-1.5 !text-xs" onClick={() => decide(ap.id, "rejected", ap.label)}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* The agents themselves */}
      <div className="grid lg:grid-cols-2 gap-4">
        {agents.map((a) => (
          <AgentCard key={a.id} a={a} storeId={app.storeId} />
        ))}
        {agents.length === 0 && <Empty title="No agents in this view" />}
      </div>
    </div>
  );
}

function AgentCard({ a, storeId }: { a: AgentDef; storeId: string }) {
  const activity = agentActivity(a.id, storeId);
  return (
    <Card>
      <div className="flex items-start gap-3 mb-3">
        <span className="w-10 h-10 grid place-items-center border border-line shrink-0 text-base">{a.glyph}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink">{a.name}</span>
            <span className="inline-flex items-center gap-1.5 text-2xs" style={{ color: "var(--success-text)" }}>
              <span className="w-1.5 h-1.5 rounded-full pulse-crit inline-block" style={{ background: "var(--status-good)" }} />
              on duty
            </span>
          </div>
          <div className="text-2xs text-muted mt-0.5">{a.tagline}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="label">Today</div>
          <div className="text-xs text-ink num mt-0.5">{a.impactToday}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-2xs mb-3 pb-3 border-b border-line">
        <div>
          <div className="label mb-0.5">Watches</div>
          <div className="text-ink2 leading-relaxed">{a.watches}</div>
        </div>
        <div>
          <div className="label mb-0.5">Autonomy</div>
          <div className="text-ink2 leading-relaxed">{a.autonomy}</div>
        </div>
      </div>

      <div className="space-y-2">
        {activity.map((x) => (
          <div key={x.label} className="flex items-start gap-2">
            <StatusDot tone={x.kind === "did" ? "good" : x.kind === "flagged" ? "critical" : "warn"} />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-ink leading-snug">{x.label}</div>
              <div className="text-2xs text-muted num">{relTime(x.at, NOW)} · {x.kind === "did" ? "executed" : x.kind === "flagged" ? "flagged" : "proposed"}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
