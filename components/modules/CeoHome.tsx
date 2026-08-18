"use client";

// Executive view — the CEO's one screen: five numbers, brands, and what needs
// a decision. Everything drills into Performance or Live Execution.

import React, { useMemo } from "react";
import { rng } from "@/lib/seed";
import { brandRollups, enterprise, estateExecution, regionRollups } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { Card, Chip, SectionTitle, Stat, StatusDot, Table, Td, Th, inr, pct } from "@/components/ui";

export default function CeoHome() {
  const app = useApp();
  const e = useMemo(() => enterprise(), []);
  const brands = useMemo(() => brandRollups(), []);
  const regions = useMemo(() => regionRollups(), []);
  const exec = useMemo(() => estateExecution(), []);

  const alerts = [
    {
      label: `${exec.behind} stores behind plan today`,
      tone: (exec.behind > 3 ? "critical" : "warn") as "critical" | "warn",
      go: () => app.go("live"),
      cta: "See stores",
    },
    {
      label: `${inr(e.markdownExposure, { compact: true })} markdown exposure building`,
      tone: "critical" as const,
      go: () => app.go("performance"),
      cta: "See why",
    },
    {
      label: `${e.brokenStyles} broken size sets · ${inr(e.valueAtRisk, { compact: true })} at risk this week`,
      tone: "warn" as const,
      go: () => app.go("moves"),
      cta: "See the fixes",
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">The business, now</h1>
        <p className="text-sm text-ink2 mt-1">{e.stores} stores · Thu 13 Aug, 11:42.</p>
      </div>

      {/* Five numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat
          label="MTD vs target"
          value={pct(e.mtdSales / Math.max(1, e.mtdTarget))}
          sub={`${inr(e.mtdSales, { compact: true })} of ${inr(e.mtdTarget, { compact: true })}`}
          tone={e.mtdSales >= e.mtdTarget ? "good" : "warn"}
          emphasis
        />
        <Stat label="Full-price sell-through" value={pct(e.sellThrough)} sub="Season to date" tone={e.sellThrough >= 0.75 ? "good" : "warn"} />
        <Stat label="Markdown exposure" value={inr(e.markdownExposure, { compact: true })} tone="critical" sub="If nothing moves before EOSS" />
        <Stat label="At risk this week" value={inr(e.valueAtRisk, { compact: true })} tone="warn" sub="Broken size sets" />
        <Stat label="Fill rate" value={pct(e.fillRate)} sub="Estate vs norm" tone={e.fillRate >= 0.9 ? "good" : "warn"} />
      </div>

      {/* The agent-written brief */}
      <Card>
        <div className="flex items-start gap-3">
          <span className="serif-accent text-base shrink-0 mt-0.5">Ai</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="label">Morning brief · written by Watchtower · 08:00</span>
              <button className="btn !py-0.5 !px-1.5 !text-2xs" onClick={() => app.go("agents")}>Agents</button>
            </div>
            <p className="text-sm text-ink2 leading-relaxed mt-1.5">
              Estate at 94% of MTD target. Full-price sell-through 71%. Markdown exposure ₹62 L, two-thirds of it in two
              styles — proposals are with Planning. 5 stores behind plan: 3 execution, 1 demand anomaly (UB City), 1
              reopening after fit-out. Customer capture 78% and climbing.
            </p>
          </div>
        </div>
      </Card>

      {/* Decisions needed */}
      <Card>
        <SectionTitle title="Needs your attention" />
        <div className="space-y-2">
          {alerts.map((a) => (
            <div key={a.label} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
              <span className="inline-flex items-center gap-2.5 text-sm text-ink">
                <StatusDot tone={a.tone} />
                {a.label}
              </span>
              <button className="btn-primary !py-1.5 !text-xs whitespace-nowrap" onClick={a.go}>{a.cta}</button>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Brands */}
        <Card className="lg:col-span-2">
          <SectionTitle title="By brand" right={<button className="btn !py-1.5 !text-xs" onClick={() => app.go("performance")}>Full performance</button>} />
          <Table>
            <thead>
              <tr>
                <Th>Brand</Th><Th align="right">Stores</Th><Th align="right">Sell-through</Th>
                <Th align="right">Markdown exposure</Th><Th align="right">Size-set health</Th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.brand}>
                  <Td className="text-sm font-medium text-ink">{b.brand}</Td>
                  <Td align="right" className="num text-xs">{b.stores}</Td>
                  <Td align="right" className="num font-semibold" style={{ color: b.sellThrough >= 0.75 ? "var(--success-text)" : "var(--status-critical)" }}>{pct(b.sellThrough)}</Td>
                  <Td align="right" className="num text-xs">{inr(b.markdownExposure, { compact: true })}</Td>
                  <Td align="right">
                    <span className="inline-flex items-center gap-1.5 num text-xs">
                      <StatusDot tone={b.sizeSetScore >= 0.85 ? "good" : b.sizeSetScore >= 0.7 ? "warn" : "critical"} />
                      {pct(b.sizeSetScore)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {/* Regions + execution pulse */}
        <div className="space-y-4">
          <Card>
            <SectionTitle title="By region" />
            <Table>
              <tbody>
                {regions.map((rg) => (
                  <tr key={rg.region}>
                    <Td className="text-xs text-ink">{rg.region}</Td>
                    <Td align="right" className="num text-xs">{pct(rg.sellThrough)}</Td>
                    <Td align="right" className="num text-xs text-muted">{rg.stores} stores</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card>
            <SectionTitle title="Customers" />
            <CustomerKpis />
          </Card>

          <Card>
            <SectionTitle title="Execution now" right={<Chip tone="good">Live</Chip>} />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-line p-2.5">
                <div className="text-xl font-semibold num" style={{ color: "var(--success-text)" }}>{exec.onTrack}</div>
                <div className="text-2xs text-muted mt-0.5">on track</div>
              </div>
              <div className="rounded-lg border border-line p-2.5">
                <div className="text-xl font-semibold num" style={{ color: "#9A6700" }}>{exec.attention}</div>
                <div className="text-2xs text-muted mt-0.5">watch</div>
              </div>
              <div className="rounded-lg border border-line p-2.5">
                <div className="text-xl font-semibold num" style={{ color: "var(--status-critical)" }}>{exec.behind}</div>
                <div className="text-2xs text-muted mt-0.5">behind</div>
              </div>
            </div>
            <button className="btn w-full mt-3 !py-1.5 !text-xs" onClick={() => app.go("live")}>Open live view</button>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Estate-level CRM KPIs — the loyalty engine's own numbers, rolled up.
function CustomerKpis() {
  const r = rng(424242);
  const members = 118_000 + Math.floor(r() * 24_000);
  const capture = 0.66 + r() * 0.14;
  const repeat = 0.27 + r() * 0.1;
  const liability = members * (150 + r() * 120);
  return (
    <div className="space-y-2 text-xs">
      <div className="flex justify-between"><span className="text-muted">Members</span><span className="num font-semibold text-ink">{members.toLocaleString("en-IN")}</span></div>
      <div className="flex justify-between"><span className="text-muted">Capture rate today</span><span className="num font-semibold" style={{ color: capture >= 0.75 ? "var(--success-text)" : "#9A6700" }}>{pct(capture)}</span></div>
      <div className="flex justify-between"><span className="text-muted">Repeat share, MTD</span><span className="num font-semibold text-ink">{pct(repeat)}</span></div>
      <div className="flex justify-between"><span className="text-muted">Points liability</span><span className="num font-semibold text-ink">{inr(liability, { compact: true })}</span></div>
      <div className="flex justify-between"><span className="text-muted">Member ATV vs walk-in</span><span className="num font-semibold text-ink">1.4×</span></div>
    </div>
  );
}
