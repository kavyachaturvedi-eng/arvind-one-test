"use client";

// Governance — the metric registry. One definition per metric, with an owner,
// a version and a freshness contract.

import React, { useMemo, useState } from "react";
import { DAY, METRICS, NOW } from "@/lib/seed";
import { inventoryLineage, stylesAtStore } from "@/lib/engine";
import { useApp } from "@/lib/state";
import {
  Callout,
  Card,
  Chip,
  Freshness,
  Modal,
  SectionTitle,
  Stat,
  StatusDot,
  Table,
  Td,
  Th,
  fmtDate,
  pct,
} from "@/components/ui";
import type { MetricDef } from "@/lib/types";

const FRESHNESS_PROMISE: Record<MetricDef["freshness"], string> = {
  live: "Live — under 5 minutes",
  hourly: "Hourly — on the hour",
  daily: "Daily — by 06:00",
};

/** Who reads each metric, by role. This is what stops a registry becoming a glossary. */
const READERS: Record<string, { role: string; use: string }[]> = {
  full_price_sell_through: [
    { role: "Store Manager", use: "Which of my styles are earning their space this week." },
    { role: "Area Manager", use: "Which stores in the cluster are burning full-price demand." },
    { role: "Central Planner", use: "Where the buy landed wrong, before markdown makes it permanent." },
    { role: "Leadership", use: "The gap to the 85–90% benchmark, and what closing it funds." },
  ],
  true_ros: [
    { role: "Store Manager", use: "What to reorder, without stockout days hiding real demand." },
    { role: "Area Manager", use: "Which stores are genuinely selling versus simply well stocked." },
    { role: "Central Planner", use: "The allocation weight used in the replenishment run." },
    { role: "Leadership", use: "Why the forecast keeps under-buying the winners." },
  ],
  size_set_health: [
    { role: "Store Manager", use: "The exception queue for the morning — which sets to repair first." },
    { role: "Area Manager", use: "Stores that let core sizes run out and never flagged it." },
    { role: "Central Planner", use: "Which styles to break down into transfers rather than replenishment." },
    { role: "Leadership", use: "A leading indicator of markdown, three weeks before markdown." },
  ],
  sellable_stock: [
    { role: "Store Manager", use: "Can I promise this unit to a customer standing in front of me." },
    { role: "Area Manager", use: "What the cluster can actually sell today." },
    { role: "Central Planner", use: "The denominator for every transfer and replenishment decision." },
    { role: "Leadership", use: "The single inventory figure used across roles." },
  ],
  cover_days: [
    { role: "Store Manager", use: "How long the floor lasts before the size set breaks." },
    { role: "Area Manager", use: "Which stores need a pull-forward this week." },
    { role: "Central Planner", use: "Cover-based replenishment instead of a fixed norm." },
    { role: "Leadership", use: "Whether the estate is holding stock in the right places." },
  ],
  fill_rate: [
    { role: "Store Manager", use: "Am I stocked to my norm, and where is the gap." },
    { role: "Area Manager", use: "The cluster view against the 97–105% band." },
    { role: "Central Planner", use: "Where the allocation over- or under-shot the norm." },
    { role: "Leadership", use: "Whether working capital is sitting where it can sell." },
  ],
  conversion: [
    { role: "Store Manager", use: "Today's trading conversation with the team." },
    { role: "Area Manager", use: "Store-by-store conversion on the floor walk." },
    { role: "Central Planner", use: "Demand signal quality — low conversion with high footfall means an assortment gap." },
    { role: "Leadership", use: "Whether traffic is being converted or merely counted." },
  ],
  markdown_exposure: [
    { role: "Store Manager", use: "Not published to stores until it is verified." },
    { role: "Area Manager", use: "Not published to clusters until it is verified." },
    { role: "Central Planner", use: "Directional ranking of which brands to act on first." },
    { role: "Leadership", use: "The size of the prize — but not yet a bookable provision." },
  ],
};

interface ChangeEntry {
  at: number;
  metricId: string;
  from: string;
  to: string;
  author: string;
  reason: string;
  reviewer: string;
}

/** Deterministic change log — versioned, reviewed, attributable. */
const CHANGE_LOG: ChangeEntry[] = [
  {
    at: NOW - 9 * DAY,
    metricId: "full_price_sell_through",
    from: "v2.0",
    to: "v2.1",
    author: "Retail Planning",
    reviewer: "Finance & Planning",
    reason: "Staff purchase was being counted as full-price. Excluded, which moved reported sell-through down by about 1.4 points and made the brand ranking change in two places.",
  },
  {
    at: NOW - 23 * DAY,
    metricId: "sellable_stock",
    from: "v2.2",
    to: "v3.0",
    author: "Store Operations",
    reviewer: "SCM + Finance",
    reason: "In-transit units were being added to on-hand. Now reported as a separate column.",
  },
  {
    at: NOW - 38 * DAY,
    metricId: "true_ros",
    from: "v1.3",
    to: "v1.4",
    author: "Retail Planning",
    reviewer: "Retail Planning",
    reason: "Markdown days removed from the denominator as well as the numerator, so a style discounted mid-season no longer looks like a faster seller than it is.",
  },
  {
    at: NOW - 52 * DAY,
    metricId: "fill_rate",
    from: "v1.9",
    to: "v2.0",
    author: "SCM",
    reviewer: "Retail Planning",
    reason: "Norm switched from display capacity to a rate-of-sale-driven norm. Best-in-class band restated as 97–105%.",
  },
  {
    at: NOW - 61 * DAY,
    metricId: "markdown_exposure",
    from: "—",
    to: "v0.9",
    author: "Finance & Planning",
    reviewer: "pending",
    reason: "First draft registered. Held below v1.0 until the expected-depth input has an agreed source; it is currently a planning assumption.",
  },
];

/** The adoption gate, evaluated from the registry entry itself. */
function gateChecks(m: MetricDef) {
  return [
    { label: "Named owner", pass: m.owner.length > 0, detail: m.owner },
    { label: "Plain-English definition", pass: m.definition.length > 40, detail: `${m.definition.length} characters` },
    { label: "Formula", pass: m.formula.length > 0, detail: m.formula },
    { label: "Freshness contract", pass: Boolean(m.freshness), detail: FRESHNESS_PROMISE[m.freshness] },
    { label: "Version at or past v1.0", pass: !m.version.startsWith("v0"), detail: m.version },
    {
      label: "Every input has a signed-off source",
      pass: m.id !== "markdown_exposure",
      detail: m.id === "markdown_exposure" ? "expected_markdown_depth is a planning assumption, not a Finance-agreed rate" : m.sources.join(", "),
    },
  ];
}

export default function Governance() {
  const app = useApp();
  const [open, setOpen] = useState<MetricDef | null>(null);

  const styleForLineage = useMemo(() => stylesAtStore(app.storeId)[0], [app.storeId]);
  const lineage = useMemo(
    () => (styleForLineage ? inventoryLineage(app.storeId, styleForLineage.id) : null),
    [app.storeId, styleForLineage]
  );

  const retired = METRICS.reduce((a, m) => a + m.replaces, 0);
  const verified = METRICS.filter((m) => m.verified).length;
  const slowest = METRICS.reduce((a, m) => (m.ageMinutes > a.ageMinutes ? m : a), METRICS[0]);
  const unverified = METRICS.filter((m) => !m.verified);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Metric Registry</h1>
          <p className="text-sm text-ink2 mt-1 max-w-2xl">
            One definition per metric, with an owner, a version and a freshness contract.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat label="Metrics governed" value={String(METRICS.length)} sub="Every number on every screen resolves to one of these" />
        <Stat label="Verified share" value={pct(verified / METRICS.length)} tone={verified === METRICS.length ? "good" : "warn"} sub={`${verified} of ${METRICS.length} have passed the adoption gate`} />
        <Stat label="Slowest refresh" value={`${(slowest.ageMinutes / 60).toFixed(1)} h`} tone="warn" sub={`${slowest.label} · contract: ${slowest.freshness}`} />
      </div>

      {/* ── The registry ── */}
      <Card>
        <SectionTitle title="The registry" sub="Open any row for the full definition, sources and readers." />
        <Table>
          <thead>
            <tr>
              <Th>Metric</Th>
              <Th>Formula</Th>
              <Th>Unit</Th>
              <Th>Grain</Th>
              <Th>Owner</Th>
              <Th>Sources</Th>
              <Th>Freshness</Th>
              <Th align="right">Version</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => (
              <tr key={m.id} className="hover:bg-[color:var(--plane)] cursor-pointer" onClick={() => setOpen(m)}>
                <Td>
                  <div className="text-ink font-medium">{m.label}</div>
                  <div className="text-2xs text-muted num">{m.id}</div>
                </Td>
                <Td className="text-2xs text-ink2 font-mono max-w-[220px]">{m.formula}</Td>
                <Td className="text-ink2">{m.unit}</Td>
                <Td className="text-2xs text-ink2">{m.grain}</Td>
                <Td className="text-ink2">{m.owner}</Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {m.sources.map((s) => (
                      <Chip key={s}>{s}</Chip>
                    ))}
                  </span>
                </Td>
                <Td><Freshness minutes={m.ageMinutes} /></Td>
                <Td align="right" className="num">{m.version}</Td>
                <Td>
                  {m.verified ? (
                    <Chip tone="good" icon={<StatusDot tone="good" />}>Verified</Chip>
                  ) : (
                    <Chip tone="warn" icon={<StatusDot tone="warn" />}>Unverified</Chip>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {/* ── Divergence demo ── */}
      {lineage && styleForLineage && (
        <Card>
          <SectionTitle
            title="One metric, five systems, five answers"
            sub={`Sellable stock for ${styleForLineage.name} (${styleForLineage.id}) at ${app.storeId}. This is not a hypothetical — it is what each system would tell you right now.`}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Table>
              <thead><tr><Th>System</Th><Th align="right">Units</Th><Th>As of</Th><Th>Why it differs</Th></tr></thead>
              <tbody>
                {lineage.entries.map((e) => (
                  <tr key={e.system}>
                    <Td className="font-medium text-ink">{e.system}</Td>
                    <Td align="right" className="num text-base font-semibold">{e.value}</Td>
                    <Td className="text-2xs text-ink2">{e.asOf}</Td>
                    <Td className="text-2xs text-ink2 max-w-[320px]">
                      <span className="inline-flex items-start gap-1.5">
                        <span className="mt-1"><StatusDot tone={e.status === "match" ? "good" : e.status === "stale" ? "warn" : "critical"} /></span>
                        <span>
                          <span className="font-semibold">{e.status === "match" ? "Reconciled" : e.status === "stale" ? "Stale" : "Divergent"}</span>{" "}
                          {e.note}
                        </span>
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div>
              <div className="label mb-2">The reconciliation, line by line</div>
              <div className="rounded-lg border border-line divide-y divide-[color:var(--line)]">
                {lineage.adjustments.map((a) => (
                  <div key={a.label} className="flex items-center justify-between px-3 py-2">
                    <span className={`text-xs ${a.label.startsWith("Sellable") ? "font-semibold text-ink" : "text-ink2"}`}>{a.label}</span>
                    <span className={`text-sm num ${a.label.startsWith("Sellable") ? "font-semibold text-ink" : "text-ink2"}`}>
                      {a.units > 0 && !a.label.startsWith("Physical") && !a.label.startsWith("Sellable") && !a.label.startsWith("Reported") ? "+" : ""}
                      {a.units}
                    </span>
                  </div>
                ))}
              </div>
              <Callout tone="brand" title="The point">
                The reconciliation is the product; the number is just the output. Nobody has to agree to use the same system —
                they have to agree to one definition, and this page is where that agreement is written down and versioned.
              </Callout>
            </div>
          </div>
        </Card>
      )}

      {/* ── Freshness contract ── */}
      <Card>
        <SectionTitle title="Freshness contracts" sub="Promised refresh against observed refresh, per metric." />
        <Table>
          <thead>
            <tr><Th>Metric</Th><Th>Promised refresh</Th><Th>Observed now</Th><Th align="right">Age</Th></tr>
          </thead>
          <tbody>
            {METRICS.map((m) => (
              <tr key={m.id}>
                <Td className="text-ink">{m.label}</Td>
                <Td className="text-ink2 text-xs">{FRESHNESS_PROMISE[m.freshness]}</Td>
                <Td><Freshness minutes={m.ageMinutes} /></Td>
                <Td align="right" className="num text-xs">{m.ageMinutes < 60 ? `${m.ageMinutes} min` : `${(m.ageMinutes / 60).toFixed(1)} h`}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {/* ── Change control ── */}
      <Card>
        <SectionTitle title="Change control" sub="Every definition change is a reviewed, versioned event with an author and a reason." />
        <Table>
          <thead><tr><Th>When</Th><Th>Metric</Th><Th align="center">Version</Th><Th>Author</Th><Th>Reviewed by</Th><Th>Reason</Th></tr></thead>
          <tbody>
            {CHANGE_LOG.map((c) => {
              const m = METRICS.find((x) => x.id === c.metricId);
              return (
                <tr key={`${c.metricId}-${c.to}`}>
                  <Td className="text-2xs text-ink2 whitespace-nowrap">{fmtDate(c.at)}</Td>
                  <Td className="text-ink">{m?.label ?? c.metricId}</Td>
                  <Td align="center" className="num text-xs">{c.from} → {c.to}</Td>
                  <Td className="text-2xs text-ink2">{c.author}</Td>
                  <Td className="text-2xs text-ink2">
                    {c.reviewer === "pending" ? (
                      <Chip tone="warn" icon={<StatusDot tone="warn" />}>Pending</Chip>
                    ) : (
                      c.reviewer
                    )}
                  </Td>
                  <Td className="text-2xs text-ink2 max-w-[360px]">{c.reason}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {/* ── Adoption gate ── */}
      <Card>
        <SectionTitle
          title="The adoption gate"
          sub="A metric cannot be marked verified until it has an owner, a definition, a formula and a freshness contract — and until every input it depends on has a signed-off source."
        />
        {unverified.map((m) => (
          <div key={m.id} className="rounded-lg border border-line p-3">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <div>
                <div className="text-sm font-semibold text-ink">{m.label}</div>
                <div className="text-2xs text-muted num">{m.id} · {m.version} · owner {m.owner}</div>
              </div>
              <Chip tone="warn" icon={<StatusDot tone="warn" />}>Unverified — not for review packs</Chip>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
              {gateChecks(m).map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-xs">
                  <span className="mt-1"><StatusDot tone={c.pass ? "good" : "critical"} /></span>
                  <span>
                    <span className={c.pass ? "text-ink2" : "text-ink font-semibold"}>{c.pass ? "Has" : "Missing"}: {c.label}</span>
                    <span className="block text-2xs text-muted leading-snug">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <button
              className="btn mt-3"
              onClick={() => {
                app.dispatch({
                  type: "audit",
                  entry: { at: NOW, actor: app.actorName, action: `Requested verification review for ${m.label}`, object: `${m.id} ${m.version}`, system: "Arvind One" },
                });
                app.toastNow(`Verification review requested for ${m.label} — routed to ${m.owner}. It stays unverified on every screen until the two open items close.`, "warn");
              }}
            >
              Request verification review
            </button>
          </div>
        ))}
        <p className="text-2xs text-muted mt-3">
          Until then, {unverified.map((m) => m.label).join(", ")} appears everywhere with an unverified badge — including in Ask One,
          which refuses to present it as a governed answer. That is the gate doing its job, not a defect.
        </p>
      </Card>

      {/* ── Definition modal ── */}
      <Modal
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        wide
        title={open?.label ?? ""}
        sub={open ? `${open.id} · ${open.version} · owner ${open.owner} · grain ${open.grain}` : undefined}
        footer={
          open && (
            <>
              <span className="text-2xs text-muted mr-auto">
                {open.replaces > 0 ? `Supersedes ${open.replaces} earlier definition${open.replaces === 1 ? "" : "s"}.` : "New definition."}
              </span>
              <button
                className="btn"
                onClick={() => {
                  app.toastNow(`Definition for ${open.label} ${open.version} copied to your review pack notes`, "good");
                  setOpen(null);
                }}
              >
                Add to review pack
              </button>
            </>
          )
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {open.verified ? (
                <Chip tone="good" icon={<StatusDot tone="good" />}>Verified</Chip>
              ) : (
                <Chip tone="warn" icon={<StatusDot tone="warn" />}>Unverified</Chip>
              )}
              <Chip>{FRESHNESS_PROMISE[open.freshness]}</Chip>
              <Freshness minutes={open.ageMinutes} />
            </div>

            <div>
              <div className="label mb-1">Definition</div>
              <p className="text-sm text-ink2 leading-relaxed">{open.definition}</p>
            </div>

            <div>
              <div className="label mb-1">Formula</div>
              <div className="rounded-lg border border-line bg-[color:var(--plane)] p-3 text-xs font-mono text-ink">{open.formula}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="label mb-1">Source systems</div>
                <div className="flex flex-wrap gap-1">{open.sources.map((s) => <Chip key={s}>{s}</Chip>)}</div>
              </div>
              <div>
                <div className="label mb-1">Prior definitions retired</div>
                <p className="text-xs text-ink2 leading-relaxed">
                  {open.replaces > 0
                    ? `${open.replaces} earlier definition${open.replaces === 1 ? "" : "s"} superseded by this entry.`
                    : "None — this is a new metric."}
                </p>
              </div>
            </div>

            <div>
              <div className="label mb-1.5">Who reads this</div>
              <Table>
                <thead><tr><Th>Role</Th><Th>What they do with it</Th></tr></thead>
                <tbody>
                  {(READERS[open.id] ?? []).map((r) => (
                    <tr key={r.role}>
                      <Td className="text-ink font-medium whitespace-nowrap">{r.role}</Td>
                      <Td className="text-ink2 text-xs">{r.use}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            {!open.verified && (
              <Callout tone="warn" title="Adoption gate — open items">
                {gateChecks(open).filter((c) => !c.pass).map((c) => `${c.label}: ${c.detail}`).join(" · ")}
              </Callout>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
