"use client";

// The drop a planner is looking at. Buying works drop by drop, so this is
// context rather than a filter: every planning screen reads the same drop.

import React, { useMemo } from "react";
import { Card } from "@/components/ui";
import { allDropPerformance, filterStores } from "@/lib/engine";
import { CURRENT_SEASON } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { inr, pct } from "@/lib/rules";

export default function DropBar() {
  const app = useApp();
  const stores = useMemo(() => filterStores(app.estate.filters), [app.estate.filters]);
  const perf = useMemo(() => allDropPerformance(stores), [stores]);

  return (
    <Card pad={false}>
      <div className="p-3 flex items-center gap-2 flex-wrap">
        <span className="label shrink-0">{CURRENT_SEASON.name}</span>
        {perf.map((p) => {
          const active = app.estate.dropId === p.drop.id;
          return (
            <button
              key={p.drop.id}
              data-drop-tab={p.drop.id}
              onClick={() => app.setDrop(p.drop.id)}
              className={`border px-3 py-1.5 text-left ${
                active ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-line hover:bg-[color:var(--plane)]"
              }`}
            >
              <div className={`text-xs font-medium ${active ? "text-[color:var(--brand)]" : "text-ink"}`}>
                {p.drop.label}
                <span className="text-2xs text-muted ml-1.5 num">{p.daysOut > 0 ? `in ${p.daysOut}d` : `${Math.abs(p.daysOut)}d ago`}</span>
              </div>
              <div className="text-2xs text-muted num mt-0.5">
                {p.styles} styles · {pct(p.sellThrough)} ST · {inr(p.valueAtRisk, { compact: true })} at risk
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
