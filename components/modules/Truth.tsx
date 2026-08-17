"use client";

// One Number — the on-hand stock figure reconciled across source systems.

import React, { useMemo, useState } from "react";
import { METRICS, STORES, STYLES, storeById, styleById } from "@/lib/seed";
import { inventoryLineage, sellable, stockForStyleAtStore, styleSignal, stylesAtStore, vitalsFor } from "@/lib/engine";
import { useApp } from "@/lib/state";
import {
  Callout,
  Card,
  Chip,
  Freshness,
  SectionTitle,
  SizeGrid,
  Stat,
  StatusDot,
  Swatch,
  Table,
  Td,
  Th,
  inr,
  pct,
} from "@/components/ui";

export default function Truth() {
  const app = useApp();
  const store = storeById(app.storeId);

  const carried = useMemo(() => stylesAtStore(app.storeId), [app.storeId]);
  const [styleId, setStyleId] = useState<string>(() => carried[0]?.id ?? STYLES[0].id);
  const style = styleById(carried.some((c) => c.id === styleId) ? styleId : carried[0]?.id ?? STYLES[0].id);

  const lineage = useMemo(() => inventoryLineage(app.storeId, style.id), [app.storeId, style.id]);
  const signal = useMemo(() => styleSignal(app.storeId, style.id), [app.storeId, style.id]);
  const rows = stockForStyleAtStore(app.storeId, style.id);

  const units: Record<string, number> = {};
  for (const r of rows) units[r.size] = sellable(r);

  const spread = Math.max(...lineage.entries.map((e) => e.value)) - Math.min(...lineage.entries.map((e) => e.value));
  const metric = METRICS.find((m) => m.id === "sellable_stock")!;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">One Number</h1>
          <p className="text-sm text-ink2 mt-1 max-w-2xl">
            The on-hand stock figure for any style in any store, reconciled across source systems.
          </p>
        </div>
      </div>

      {/* Selector */}
      <Card>
        <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="label block mb-1.5">Style — {store.name}</label>
            <select
              value={style.id}
              onChange={(e) => setStyleId(e.target.value)}
              className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink"
            >
              {carried.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.category} · {s.id}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2.5">
            <Swatch hex={style.colourHex} label={style.colour} />
            <Chip>{style.category}</Chip>
            <Chip>MRP {inr(style.mrp)}</Chip>
          </div>
        </div>
      </Card>

      {/* The divergence */}
      <Card>
        <SectionTitle
          title="Stock by source system"
          sub={`${new Set(lineage.entries.map((e) => e.value)).size} of ${lineage.entries.length} systems report a different figure for this style at this store.`}
          right={<Chip tone={spread > 4 ? "critical" : "warn"}>{spread} unit spread</Chip>}
        />

        <div className="grid md:grid-cols-5 gap-2.5">
          {lineage.entries.map((e) => {
            const isTruth = e.system === "Arvind One";
            return (
              <div
                key={e.system}
                className={`rounded-lg border p-3 ${isTruth ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-line"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-ink">{e.system}</div>
                  <StatusDot tone={e.status === "match" ? "good" : e.status === "stale" ? "warn" : "critical"} />
                </div>
                <div className="text-[28px] font-semibold text-ink num leading-none mt-2">{e.value}</div>
                <div className="text-2xs text-muted mt-1">{e.asOf}</div>
                <div className="text-2xs text-ink2 mt-2 leading-relaxed">{e.note}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-2xs">
          <span className="inline-flex items-center gap-1.5">
            <StatusDot tone="good" /> reconciled
          </span>
          <span className="inline-flex items-center gap-1.5">
            <StatusDot tone="warn" /> stale — correct logic, old data
          </span>
          <span className="inline-flex items-center gap-1.5">
            <StatusDot tone="critical" /> divergent — different definition
          </span>
        </div>
      </Card>

      {/* The reconciliation */}
      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <SectionTitle
            title="The reconciliation, line by line"
            sub="From physical count to sellable, one agreed definition applied once."
          />
          <Table>
            <tbody>
              {lineage.adjustments.map((a, i) => {
                const isTotal = a.label === "Sellable today";
                const isNote = a.label.startsWith("Reported separately");
                return (
                  <tr key={a.label} className={isTotal ? "bg-[color:var(--brand-soft)]" : ""}>
                    <Td className={`text-sm ${isTotal ? "font-semibold text-ink" : isNote ? "text-muted" : "text-ink2"}`}>
                      {a.label}
                    </Td>
                    <Td align="right" className={`num text-sm ${isTotal ? "font-semibold text-ink text-base" : isNote ? "text-muted" : "text-ink2"}`}>
                      {a.units > 0 && i > 0 && !isTotal && !isNote ? "+" : ""}
                      {a.units}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <Callout tone="brand" title="In-transit units">
            In-transit units are reported beside the sellable figure, never inside it, with the expected arrival date
            attached — the number reflects what the store can sell to the customer in front of it today.
          </Callout>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <Card>
            <SectionTitle title="Definition" right={<Chip tone="good">v{metric.version.replace("v", "")}</Chip>} />
            <div className="text-sm text-ink leading-relaxed">{metric.definition}</div>
            <div className="mt-3 rounded-lg bg-[color:var(--plane)] border border-line p-2.5">
              <div className="label mb-1">Formula</div>
              <code className="text-xs text-ink2 break-words">{metric.formula}</code>
            </div>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Owner</dt>
                <dd className="text-ink font-medium">{metric.owner}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Grain</dt>
                <dd className="text-ink">{metric.grain}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Definitions retired</dt>
                <dd className="text-ink num">{metric.replaces}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Freshness contract</dt>
                <dd>
                  <Freshness minutes={metric.ageMinutes} />
                </dd>
              </div>
            </dl>
            <button className="btn w-full mt-3" onClick={() => app.go("governance")}>
              Open the full metric registry
            </button>
          </Card>

          <Card>
            <SectionTitle title="Sizes on the floor now" sub="Sellable units. Starred sizes are the core sizes." />
            <SizeGrid sizes={style.sizes} units={units} core={style.coreSizes} />
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="label">True rate of sale</div>
                <div className="num text-ink font-semibold">{signal.ros.toFixed(2)}/day</div>
              </div>
              <div>
                <div className="label">Cover</div>
                <div className="num text-ink font-semibold">{signal.cover > 900 ? "—" : `${signal.cover.toFixed(0)} days`}</div>
              </div>
              <div>
                <div className="label">Full-price window left</div>
                <div className="num text-ink font-semibold">{signal.daysLeftInWindow} days</div>
              </div>
              <div>
                <div className="label">Size-set status</div>
                <div className="inline-flex items-center gap-1.5">
                  <StatusDot tone={signal.health.status === "healthy" ? "good" : signal.health.status === "at_risk" ? "warn" : "critical"} />
                  <span className="text-ink font-semibold capitalize">{signal.health.status.replace("_", " ")}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* By role */}
      <Card>
        <SectionTitle title="By role" sub="What each role reads from the reconciled figure, and the action available here." />
        <Table>
          <thead>
            <tr>
              <Th>Role</Th>
              <Th>Question</Th>
              <Th align="right">Answer</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td className="text-sm font-medium text-ink">Store Manager</Td>
              <Td className="text-xs text-ink2">Can I sell this to the customer standing here?</Td>
              <Td align="right" className="num text-sm font-semibold">{lineage.reconciled} sellable</Td>
              <Td className="text-xs text-ink2">Transfer a missing size in, or stop featuring the style</Td>
            </tr>
            <tr>
              <Td className="text-sm font-medium text-ink">Area Manager</Td>
              <Td className="text-xs text-ink2">Is this store carrying what it should be?</Td>
              <Td align="right" className="num text-sm font-semibold">{pct(vitalsFor(app.storeId).fillRate)} of norm</Td>
              <Td className="text-xs text-ink2">Approve a transfer, or escalate a fill-rate outlier</Td>
            </tr>
            <tr>
              <Td className="text-sm font-medium text-ink">Central Planner</Td>
              <Td className="text-xs text-ink2">Is this style in the right stores?</Td>
              <Td align="right" className="num text-sm font-semibold">rank {signal.regionalRank} in region</Td>
              <Td className="text-xs text-ink2">Re-cut the allocation, or run a strategic transfer</Td>
            </tr>
            <tr>
              <Td className="text-sm font-medium text-ink">Leadership</Td>
              <Td className="text-xs text-ink2">Will this sell at full price?</Td>
              <Td align="right" className="num text-sm font-semibold">
                {signal.cover > 900 ? "no demand" : signal.cover > signal.daysLeftInWindow ? "at markdown risk" : "on track"}
              </Td>
              <Td className="text-xs text-ink2">See the margin the gap is worth, and fund the fix</Td>
            </tr>
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
