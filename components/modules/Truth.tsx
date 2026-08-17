"use client";

// Stock Position — what is in the system, per style, per size. Numbers first.

import React, { useMemo, useState } from "react";
import { METRICS, STYLES, storeById, styleById } from "@/lib/seed";
import { inventoryLineage, sellable, stockForStyleAtStore, styleSignal, stylesAtStore, vitalsFor } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { Card, Chip, SectionTitle, SizeGrid, Stat, StatusDot, Swatch, Table, Td, Th, inr, pct } from "@/components/ui";

export default function Truth() {
  const app = useApp();
  const store = storeById(app.storeId);
  const v = vitalsFor(app.storeId);

  const carried = useMemo(() => stylesAtStore(app.storeId), [app.storeId]);
  const [styleId, setStyleId] = useState<string>(() => carried[0]?.id ?? STYLES[0].id);
  const style = styleById(carried.some((c) => c.id === styleId) ? styleId : carried[0]?.id ?? STYLES[0].id);

  const lineage = useMemo(() => inventoryLineage(app.storeId, style.id), [app.storeId, style.id]);
  const signal = useMemo(() => styleSignal(app.storeId, style.id), [app.storeId, style.id]);
  const rows = stockForStyleAtStore(app.storeId, style.id);

  const units: Record<string, number> = {};
  for (const r of rows) units[r.size] = sellable(r);

  const adj = Object.fromEntries(lineage.adjustments.map((a) => [a.label, a.units])) as Record<string, number>;
  const metric = METRICS.find((m) => m.id === "sellable_stock")!;

  // Today's movement log, derived from the position so the numbers always tie out.
  const movements = useMemo(() => {
    const onHand = adj["Physical on-hand (D365)"] ?? 0;
    const reserved = Math.abs(adj["Less: reserved against omni orders"] ?? 0);
    const defective = Math.abs(adj["Less: flagged defective"] ?? 0);
    const staged = Math.abs(adj["Less: staged for outward"] ?? 0);
    const sold = Math.min(3, Math.max(1, defective + 1));
    let bal = onHand + sold;
    const rows: { at: string; label: string; units: number; balance: number }[] = [];
    const push = (at: string, label: string, units: number) => {
      bal += units;
      rows.push({ at, label, units, balance: bal });
    };
    rows.push({ at: "10:03", label: "Opening position", units: 0, balance: bal });
    push("10:41", "Sold at till", -sold);
    if (reserved) push("10:58", "Reserved against omni order", -reserved);
    if (defective) push("11:12", "Flagged defective at floor walk", -defective);
    if (staged) push("11:26", "Staged into outward batch", -staged);
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.storeId, style.id]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Stock Position</h1>
          <p className="text-sm text-ink2 mt-1">{store.name}</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted">Store total</span>
          <span className="num font-semibold text-ink">{v.sellableUnits.toLocaleString("en-IN")} sellable</span>
          <span className="text-muted">·</span>
          <span className="num font-semibold text-ink">{v.inTransit} in transit</span>
          <span className="text-muted">·</span>
          <span className="num font-semibold text-ink">{pct(v.fillRate)} of norm</span>
        </div>
      </div>

      {/* Selector */}
      <Card>
        <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="label block mb-1.5">Style</label>
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
            <Chip>MRP {inr(style.mrp)}</Chip>
          </div>
        </div>
      </Card>

      {/* The position, as numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Stat label="Sellable now" value={String(lineage.reconciled)} tone="good" emphasis sub="On floor, free to sell" />
        <Stat label="Physical on-hand" value={String(adj["Physical on-hand (D365)"] ?? 0)} sub="Last physical count" />
        <Stat label="Reserved (omni)" value={String(Math.abs(adj["Less: reserved against omni orders"] ?? 0))} sub="Committed to online orders" />
        <Stat label="Defective" value={String(Math.abs(adj["Less: flagged defective"] ?? 0))} sub="Flagged, not sellable" />
        <Stat label="Staged outward" value={String(Math.abs(adj["Less: staged for outward"] ?? 0))} sub="In an outward batch" />
        <Stat label="In transit" value={String(adj["Reported separately: in transit"] ?? 0)} sub="Inbound, not counted" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Sizes */}
        <Card>
          <SectionTitle title="By size — sellable" />
          <SizeGrid sizes={style.sizes} units={units} core={style.coreSizes} />
          <Table className="mt-3">
            <tbody>
              <tr>
                <Td className="text-xs text-muted">True rate of sale</Td>
                <Td align="right" className="num text-xs font-semibold text-ink">{signal.ros.toFixed(2)}/day</Td>
                <Td className="text-xs text-muted">Cover</Td>
                <Td align="right" className="num text-xs font-semibold text-ink">{signal.cover > 900 ? "—" : `${signal.cover.toFixed(0)}d`}</Td>
              </tr>
              <tr>
                <Td className="text-xs text-muted">Full-price window</Td>
                <Td align="right" className="num text-xs font-semibold text-ink">{signal.daysLeftInWindow}d left</Td>
                <Td className="text-xs text-muted">Size set</Td>
                <Td align="right">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold capitalize">
                    <StatusDot tone={signal.health.status === "healthy" ? "good" : signal.health.status === "at_risk" ? "warn" : "critical"} />
                    {signal.health.status.replace("_", " ")}
                  </span>
                </Td>
              </tr>
            </tbody>
          </Table>
        </Card>

        {/* Movement log */}
        <Card>
          <SectionTitle title="Movements — today" right={<Chip>ledger</Chip>} />
          <Table>
            <thead>
              <tr><Th>Time</Th><Th>Movement</Th><Th align="right">Units</Th><Th align="right">Balance</Th></tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.at + m.label}>
                  <Td className="num text-2xs text-muted whitespace-nowrap">{m.at}</Td>
                  <Td className="text-xs text-ink2">{m.label}</Td>
                  <Td align="right" className="num text-xs font-semibold" style={{ color: m.units < 0 ? "var(--status-critical)" : "var(--success-text)" }}>
                    {m.units > 0 ? "+" : ""}{m.units}
                  </Td>
                  <Td align="right" className="num text-xs text-ink">{m.balance}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-3 text-2xs text-muted">
            Sellable = on-hand − reserved − defective − staged outward. Definition {metric.version} ·{" "}
            <button className="underline" onClick={() => app.go("governance")}>registry</button> · summarised financials post to SAP Finance at day close
          </div>
        </Card>
      </div>
    </div>
  );
}
