"use client";

// Allocating one style to one store, across its sizes at once.
//
// Sending a unit is never really one variant: it is a set, or a handful of
// sizes. This is the one panel that does that job, used by Send units, Renewal
// and Move stock, so the same decision is not three different shapes.
//
// It shows, per size: what the source can give, what the destination already
// has, whether that size is pivotal, and whether the set is broken there.

import React, { useMemo } from "react";
import { Chip, StatusDot } from "@/components/ui";
import { dcAvailable, gradedStyles, unitsAt } from "@/lib/engine";
import { styleById } from "@/lib/seed";
import { maxSets, setsToUnits, sizeCurve, unitsPerSet, unitsToSets } from "@/lib/rules";
import type { Size } from "@/lib/types";

export type SizeMap = Partial<Record<Size, number>>;

export default function SizeAllocator({
  styleId,
  toStoreId,
  from = "warehouse",
  value,
  onChange,
}: {
  styleId: string;
  toStoreId: string;
  /** "warehouse", or a store id for a store-to-store move. */
  from?: string;
  value: SizeMap;
  onChange: (next: SizeMap) => void;
}) {
  const style = styleById(styleId);
  const curve = useMemo(() => sizeCurve(style.sizes, style.coreSizes), [style.sizes, style.coreSizes]);
  const perSet = unitsPerSet(curve);

  const available = useMemo(() => {
    const out: SizeMap = {};
    style.sizes.forEach((sz) => {
      out[sz] = from === "warehouse" ? dcAvailable(styleId, sz) : unitsAt(from, styleId, sz);
    });
    return out;
  }, [style.sizes, styleId, from]);

  const setsPossible = maxSets(curve, available);
  const { sets, remainder } = unitsToSets(curve, value);
  const total = Object.values(value).reduce((a, n) => a + (n ?? 0), 0);

  // Which sizes this store is actually missing — the reason to send anything.
  const health = useMemo(() => gradedStyles(toStoreId, 90).find((g) => g.signal.style.id === styleId), [toStoreId, styleId]);
  const missing = new Set(health?.signal.health.missingCore ?? []);

  const over = style.sizes.filter((sz) => (value[sz] ?? 0) > (available[sz] ?? 0));

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <span className="label">Sets</span>
        <input
          type="number"
          min={0}
          value={sets}
          data-alloc-sets
          onChange={(e) => onChange(setsToUnits(curve, Math.max(0, Math.min(99, Number(e.target.value) || 0)))) }
          className="w-14 border border-line bg-raised px-2 py-1 text-sm text-ink text-right num"
        />
        <span className="text-ink2 num">
          1 set = {perSet} · {curve.map((c) => `${c.ratio}${c.size}`).join(" ")}
        </span>
        <span className="text-ink2 num">{setsPossible} possible</span>
        {remainder > 0 && <Chip>{remainder} loose</Chip>}
        {health && health.signal.health.status !== "healthy" && (
          <Chip tone={health.signal.health.status === "broken" ? "critical" : "warn"}>
            {health.signal.health.status === "broken" ? "Broken" : "At risk"}
            {missing.size > 0 ? `: ${[...missing].join(", ")} gone` : ""}
          </Chip>
        )}
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {style.sizes.map((sz) => {
          const has = unitsAt(toStoreId, styleId, sz);
          const canGive = available[sz] ?? 0;
          const asked = value[sz] ?? 0;
          const gone = missing.has(sz);
          const tooMuch = asked > canGive;
          return (
            <div
              key={sz}
              data-alloc-size={gone ? "gone" : "held"}
              className="border px-2 py-1.5"
              style={{ borderColor: tooMuch ? "var(--status-critical)" : gone ? "var(--status-critical)" : "var(--line)" }}
            >
              <div className="flex items-center gap-1 text-2xs num">
                {gone && <StatusDot tone="critical" />}
                <span className="text-ink">{sz}</span>
                {style.coreSizes.includes(sz) && <span className="text-muted">piv</span>}
              </div>
              <div className="text-2xs num text-muted mb-1">
                has {has} · {canGive} free
              </div>
              <input
                type="number"
                min={0}
                value={asked}
                data-alloc-size-qty
                onChange={(e) => onChange({ ...value, [sz]: Math.max(0, Number(e.target.value) || 0) })}
                className="w-14 border border-line bg-raised px-1.5 py-1 text-sm text-ink text-right num"
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 text-2xs num">
        <span className="text-ink">{total} units</span>
        {over.length > 0 && (
          <span style={{ color: "var(--status-critical)" }}>Over what the source holds in {over.join(", ")}</span>
        )}
      </div>
    </div>
  );
}
