"use client";

// My store today. Four numbers, the actions worth money, who is on the floor,
// and what is coming. Nothing else.

import React, { useMemo } from "react";
import { NOW, STAFF, rng, storeById } from "@/lib/seed";
import { sizeSetExceptions, vitalsFor } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { Card, Chip, Empty, SectionTitle, Stat, StatusDot, Swatch, inr, pct } from "@/components/ui";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

export default function Home() {
  const app = useApp();
  const store = storeById(app.storeId);
  const v = vitalsFor(app.storeId);
  const exceptions = useMemo(() => sizeSetExceptions(app.storeId, 3), [app.storeId]);

  // Who is in today, deterministic (matches the shift grid's Thursday column).
  const present = STAFF.filter((s) => rng(hash("shift" + s.name))() * 7 >= 1 || true).slice(0, 6);
  const offToday = STAFF.filter((s) => Math.floor(rng(hash("shift" + s.name))() * 7) === 3).map((s) => s.name.split(" ")[0]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">My store today</h1>
          <p className="text-sm text-ink2 mt-1">{store.name} · Thursday 13 Aug</p>
        </div>
        <div className="flex items-center gap-2">
          {app.dayOpen ? (
            <Chip tone="good">● Day open · 10:02</Chip>
          ) : (
            <button
              data-day-open
              className="btn-primary"
              onClick={() => {
                app.dispatch({ type: "day:open", by: app.actorName });
                app.toastNow("Day opened. Float confirmed, checklist started.", "good");
              }}
            >
              ☀ Open the day
            </button>
          )}
        </div>
      </div>

      {/* The four numbers that matter */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Today"
          value={inr(v.todaySales, { compact: true })}
          sub={`vs ${inr(v.lySameDay, { compact: true })} this day last year`}
          tone={v.todaySales >= v.lySameDay ? "good" : "warn"}
          emphasis
        />
        <Stat label="Conversion" value={pct(v.conversion, 1)} sub={`${v.bills} bills from ${v.footfall.toLocaleString("en-IN")} walk-ins`} tone={v.conversion >= 0.14 ? "good" : "warn"} />
        <Stat label="Sell-through" value={pct(v.sellThrough)} sub="Full price, season so far" tone={v.sellThrough >= 0.75 ? "good" : "warn"} />
        <Stat label="Fill rate" value={pct(v.fillRate)} sub={`${v.sellableUnits.toLocaleString("en-IN")} units on the floor`} tone={v.fillRate >= 0.9 ? "good" : "warn"} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Do these first */}
        <Card className="lg:col-span-2">
          <SectionTitle title="Do these first" right={<Chip tone={exceptions.length ? "warn" : "good"}>{exceptions.length}</Chip>} />
          <div className="space-y-2.5">
            {exceptions.map((e, i) => (
              <div key={e.style.id} className="rounded-lg border border-line p-3 flex items-start gap-3">
                <div
                  className="w-6 h-6 rounded-full grid place-items-center text-2xs font-bold shrink-0 mt-0.5"
                  style={{
                    background: e.health.status === "broken" ? "var(--crit-soft)" : "var(--warn-soft)",
                    color: e.health.status === "broken" ? "#C0392B" : "#9A6700",
                  }}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Swatch hex={e.style.colourHex} />
                    <div className="text-sm font-medium text-ink leading-snug">
                      {e.style.name}: size {e.health.missingCore.join(" and ") || "core"} at zero
                    </div>
                  </div>
                  <div className="text-xs text-ink2 mt-1 leading-relaxed">{e.decision.reason.replace(/\s—\s/g, ". ")}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold num" style={{ color: "var(--status-critical)" }}>
                    {inr(e.valueAtRisk, { compact: true })}
                  </div>
                  <button
                    onClick={() => app.go(e.decision.action === "transfer_in" ? "savesale" : "replenish")}
                    className="btn-primary mt-1.5 !py-1.5 !text-xs whitespace-nowrap"
                  >
                    {e.decision.action === "transfer_in" ? "Get it from a store" : `Pull ${e.decision.units || ""} from warehouse`}
                  </button>
                </div>
              </div>
            ))}
            {exceptions.length === 0 && <Empty title="Nothing urgent" body="Every core size on every carried style is on the floor." />}
          </div>
        </Card>

        <div className="space-y-5">
          {/* Staff today */}
          <Card>
            <SectionTitle title="Staff today" right={<Chip tone="good">{present.length} in</Chip>} />
            <div className="space-y-1.5">
              {STAFF.slice(0, 6).map((s) => (
                <div key={s.name} className="flex items-center gap-2.5">
                  <StatusDot tone={offToday.includes(s.name.split(" ")[0]) ? "neutral" : "good"} />
                  <span className="text-sm text-ink flex-1 truncate">{s.name}</span>
                  <span className="text-xs num text-ink2">{inr(s.sales, { compact: true })}</span>
                </div>
              ))}
            </div>
            <div className="text-2xs text-muted mt-2.5 pt-2 border-t border-line">
              Sales this month, per person. {offToday.length ? `Off today: ${offToday.join(", ")}.` : "Full house today."}
            </div>
          </Card>

          {/* Upcoming event */}
          <Card>
            <SectionTitle title="Coming up" />
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden>✦</span>
              <div>
                <div className="text-sm font-semibold text-ink">Onam · 26 Aug · 13 days away</div>
                <div className="text-xs text-ink2 mt-1 leading-relaxed">
                  Linen sold 2.3× in the South this week last year. Smart Moves has the stock plan ready.
                </div>
                <button className="btn !py-1.5 !text-xs mt-2" onClick={() => app.go("merch")}>See the plan</button>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-line flex items-start gap-3">
              <span className="text-2xl" aria-hidden>✦</span>
              <div>
                <div className="text-sm font-semibold text-ink">Raksha Bandhan · 28 Aug</div>
                <div className="text-xs text-ink2 mt-1">Gifting week. Belts and wallets forward, gift wrap at the counter.</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
