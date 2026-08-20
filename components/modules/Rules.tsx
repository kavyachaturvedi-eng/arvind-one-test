"use client";

// Rules — the thresholds the planning layer runs on, grouped by the decision
// they drive rather than listed flat. The run's own triggers are editable here
// and take effect immediately; the rest state where the number comes from.

import React from "react";
import { Card, Chip, SectionTitle, Stat, StatusDot, Table, Td, Th } from "@/components/ui";
import { planningStores, replenRun } from "@/lib/engine";
import { CLUSTERS, NOW } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { ASSUMPTIONS, HOLDBACK_GOAL, HOLDBACK_SHARE, coreShareTarget, pct } from "@/lib/rules";

export default function Rules() {
  const app = useApp();
  const t = app.thresholds;
  const run = replenRun(NOW, app.pausedStores, t);
  const stores = planningStores();

  function set(patch: Partial<typeof t>, label: string) {
    app.dispatch({ type: "rule:set", patch, by: app.actorName, label });
  }

  const invented = ASSUMPTIONS.filter((a) => a.basis === "invented").length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-ink">Rules</h1>
        <Chip tone={invented > 0 ? "warn" : "good"}>{invented} not yet confirmed by AFL</Chip>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Stores the run covers" value={`${run.triggered.length} of ${stores.length}`} emphasis tone={run.triggered.length > 0 ? "warn" : "good"} />
        <Stat label="Lines it would raise" value={String(run.lines.length)} />
        <Stat label="Run days" value="Tue · Fri" />
        <Stat label="Warehouse holdback" value={pct(HOLDBACK_SHARE)} sub={`goal ${pct(HOLDBACK_GOAL)}`} />
      </div>

      <Card>
        <SectionTitle title="When the run fires" right={<Chip tone="brand">Live</Chip>} />
        <div className="space-y-4">
          <Slider
            label="Replenish below this fill rate"
            value={t.fillTrigger}
            min={0.7}
            max={1.0}
            step={0.01}
            name="fill"
            onChange={(v) => set({ fillTrigger: v }, `Replenishment trigger → ${pct(v)} fill rate`)}
          />
          <Slider
            label="Replenish above this share of unhealthy styles"
            value={t.brokenTrigger}
            min={0.1}
            max={0.9}
            step={0.01}
            name="broken"
            onChange={(v) => set({ brokenTrigger: v }, `Brokenness trigger → ${pct(v)} of carried styles`)}
          />
        </div>
        <div className="mt-3 text-xs text-ink2 num">
          {run.triggered.length} of {stores.length} stores qualify at these settings
        </div>
      </Card>

      <Card>
        <SectionTitle title="Set by the buy" />
        <Table>
          <thead>
            <tr>
              <Th>Rule</Th>
              <Th>Value</Th>
              <Th>Where it comes from</Th>
            </tr>
          </thead>
          <tbody>
            <Row rule="Warehouse holdback" value={pct(HOLDBACK_SHARE)} from="Confirmed by AFL" ok />
            <Row rule="Holdback goal" value={pct(HOLDBACK_GOAL)} from="Confirmed by AFL" ok />
            <Row rule="Healthy fill rate" value="97%–105% of norm" from="Confirmed by AFL" ok />
            <Row rule="Run cadence" value="Tuesday and Friday" from="Confirmed by AFL" ok />
            <Row rule="Core vs fashion" value="Product master attribute" from="Confirmed by AFL" ok />
          </tbody>
        </Table>
      </Card>

      <Card>
        <SectionTitle title="Per store" />
        <Table>
          <thead>
            <tr>
              <Th>Store</Th>
              <Th>Cluster</Th>
              <Th>Grade</Th>
              <Th align="right">Norm</Th>
              <Th align="right">Replenish share</Th>
              <Th align="right">Core target</Th>
              <Th align="right">Run</Th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => {
              const paused = app.pausedStores.includes(s.id);
              return (
                <tr key={s.id} data-rule-store>
                  <Td className="text-ink">{s.name}</Td>
                  <Td className="text-ink2">{CLUSTERS.find((c) => c.id === s.clusterId)?.name}</Td>
                  <Td>{s.grade}</Td>
                  <Td align="right" className="num">{app.normFor(s.id).toLocaleString("en-IN")}</Td>
                  <Td align="right" className="num">{pct(s.replenShare)}</Td>
                  <Td align="right" className="num">{pct(coreShareTarget(s.grade))}</Td>
                  <Td align="right">
                    <button
                      className="btn !py-1 !text-2xs"
                      data-rule-pause
                      onClick={() => app.dispatch({ type: "store:pause", storeId: s.id, paused: !paused, by: app.actorName })}
                    >
                      {paused ? "Paused" : "Running"}
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function Row({ rule, value, from, ok }: { rule: string; value: string; from: string; ok?: boolean }) {
  return (
    <tr data-rule-row>
      <Td>
        <span className="inline-flex items-center gap-2">
          <StatusDot tone={ok ? "good" : "warn"} />
          <span className="text-ink">{rule}</span>
        </span>
      </Td>
      <Td className="num">{value}</Td>
      <Td className="text-xs text-ink2">{from}</Td>
    </tr>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  name,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  name: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink">{label}</span>
        <span className="num text-lg text-ink">{pct(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-rule={name}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-1.5 accent-[color:var(--brand)]"
      />
    </div>
  );
}
