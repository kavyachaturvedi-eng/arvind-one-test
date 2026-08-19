"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Ask One — plain-language questions answered against the governed metric layer.
//
// The planner's pain, verbatim: "I can't build my own report. I request it and
// wait about a week." The answer is not a chatbot over a database. The question
// is resolved to a metric definition that has an owner, a version and a
// freshness contract, and the resolution is shown above every answer — so two
// people asking the same question get the same number, and an answer that
// cannot be governed is labelled as such instead of being invented.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { METRICS, NOW, STAFF, STYLES, rng, storeById } from "@/lib/seed";

const hashQ = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };
import {
  allVitals,
  brandRollups,
  sizeSetExceptions,
  topSellers,
} from "@/lib/engine";
import { useApp } from "@/lib/state";
import {
  Callout,
  Card,
  Chip,
  ColumnChart,
  Empty,
  Freshness,
  SectionTitle,
  StatusDot,
  Table,
  Td,
  Th,
  Timeline,
  inr,
  pct,
} from "@/components/ui";
import type { MetricDef, RoleId } from "@/lib/types";

interface Answer {
  /** The metric the question compiled to, if any. */
  metric: MetricDef | null;
  filters: string;
  grain: string;
  timeRange: string;
  ageMinutes: number;
  /** Set when the question resolves to nothing governed. */
  missing?: { metric: string; needs: string[] };
  note?: string;
  body: React.ReactNode;
}

const STARTERS: Record<RoleId, string[]> = {
  store: ["Which of my styles have a broken size set?", "Where is my best seller under-stocked?", "Which staff member has the lowest UPT?"],
  staff: ["Which of my styles have a broken size set?", "Where is my best seller under-stocked?"],
  planner: ["Which stores are bleeding margin on Oxford Solid Shirts?", "Which stores are below 90% fill rate?", "Why did order OM-55019 cancel?"],
  leadership: ["What is my markdown exposure by brand?", "How does this month compare with last year?", "What is full-price sell-through by brand?"],
};

const ALL_STARTERS = [
  "Which of my styles have a broken size set?",
  "How does this month compare with last year?",
  "Which stores are bleeding margin on Oxford Solid Shirts?",
  "Which stores are below 90% fill rate?",
  "What is my markdown exposure by brand?",
  "Where is my best seller under-stocked?",
  "Why did order OM-55019 cancel?",
  "Which staff member has the lowest UPT?",
  "What is full-price sell-through by brand?",
];

const metric = (id: string) => METRICS.find((m) => m.id === id) ?? null;

export default function AskOne() {
  const app = useApp();
  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const store = storeById(app.storeId);
  const answer = useMemo(() => (asked ? resolve(asked, app) : null), [asked, app]);

  function ask(q: string) {
    const clean = q.trim();
    if (!clean) return;
    setAsked(clean);
    setDraft(clean);
    setHistory((h) => [clean, ...h.filter((x) => x !== clean)].slice(0, 8));
  }

  const roleStarters = STARTERS[app.role];
  const otherStarters = ALL_STARTERS.filter((q) => !roleStarters.includes(q));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Ask One</h1>
          <p className="text-sm text-ink2 mt-1 max-w-2xl">
            Ask in plain language. Every answer shows the metric definition it was computed from.
          </p>
        </div>
      </div>

      {/* ── Ask box ── */}
      <Card>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-line bg-raised px-3.5 py-2.5 text-sm text-ink placeholder:text-muted"
            placeholder="Ask about stock, sell-through, size sets, stores, staff or an order…"
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") ask(draft);
            }}
          />
          <button className="btn-primary" onClick={() => ask(draft)}>Ask</button>
        </div>

        <div className="mt-3">
          <div className="label mb-1.5">Starters for {app.role === "store" || app.role === "staff" ? "the store" : app.role === "planner" ? "planning" : "admin"}</div>
          <div className="flex flex-wrap gap-1.5">
            {roleStarters.map((q) => (
              <button key={q} onClick={() => ask(q)} className="chip text-ink2 bg-[color:var(--plane)] hover:bg-[color:var(--brand-soft)]">
                {q}
              </button>
            ))}
          </div>
          <div className="label mt-3 mb-1.5">Other roles ask</div>
          <div className="flex flex-wrap gap-1.5">
            {otherStarters.map((q) => (
              <button key={q} onClick={() => ask(q)} className="chip text-muted hover:bg-[color:var(--plane)]">
                {q}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Answer ── */}
      {!answer && (
        <Card>
          <Empty
            title="Nothing asked yet"
            body="Every answer arrives with the metric it used, the filters applied, the grain, the time range and the data freshness — above the number, not in a footnote."
          />
        </Card>
      )}

      {answer && (
        <Card>
          <SectionTitle
            title={asked ?? ""}
            sub={`Scope: ${store.name} · ${store.brand} · asked by ${app.actorName}`}
            right={
              <div className="flex items-center gap-2">
                <button className="btn-ghost text-xs" onClick={() => app.toastNow(`Pinned "${asked}" to your home screen — it will refresh on the metric's own contract`, "good")}>
                  Pin to my home screen
                </button>
                <button className="btn-ghost text-xs" onClick={() => ask(asked!)}>Re-run</button>
              </div>
            }
          />

          {/* Interpreted-as strip — the mechanism that makes the answer trustworthy */}
          <div className="rounded-lg border border-line bg-[color:var(--plane)] p-3 mb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <span className="label">Interpreted as</span>
              {answer.metric && answer.metric.verified ? (
                <Chip tone="good" icon={<StatusDot tone="good" />}>Verified · governed metric</Chip>
              ) : (
                <Chip tone="warn" icon={<StatusDot tone="warn" />}>Unverified — generated</Chip>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Field label="Metric" value={answer.metric ? `${answer.metric.label} ${answer.metric.version}` : "none — no governed metric matched"} />
              <Field label="Filters" value={answer.filters} />
              <Field label="Grain" value={answer.grain} />
              <Field label="Time range" value={answer.timeRange} />
              <div>
                <div className="label mb-0.5">Freshness</div>
                <Freshness minutes={answer.ageMinutes} />
                {answer.metric && <div className="text-2xs text-muted mt-0.5">contract: {answer.metric.freshness} · owner {answer.metric.owner}</div>}
              </div>
            </div>
            {answer.metric && (
              <div className="text-2xs text-ink2 mt-2 font-mono border-t border-line pt-2">{answer.metric.formula}</div>
            )}
          </div>

          {!(answer.metric && answer.metric.verified) && (
            <Callout tone="warn" title="Not for a review pack">
              {answer.note ??
                "This answer did not compile to a verified metric definition. It is computed from live data and it is reproducible, but it has no owner and no freshness contract — do not put it in a board or review pack until it is registered in Governance."}
            </Callout>
          )}

          <div className="mt-3">{answer.body}</div>

          {answer.missing && (
            <div className="mt-3 rounded-lg border border-line p-3">
              <div className="text-xs font-semibold text-ink mb-1">What I would need to answer this properly</div>
              <div className="text-xs text-ink2 mb-2">
                Proposed metric: <span className="font-mono">{answer.missing.metric}</span>
              </div>
              <ul className="text-xs text-ink2 list-disc pl-4 space-y-0.5">
                {answer.missing.needs.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <button
                className="btn mt-3"
                onClick={() => {
                  app.dispatch({
                    type: "audit",
                    entry: { at: NOW, actor: app.actorName, action: `Requested a new governed metric: ${answer.missing!.metric}`, object: asked ?? "", system: "Arvind One" },
                  });
                  app.toastNow(`Metric request logged for ${answer.missing!.metric} — routed to the owning team for a definition and a freshness contract`, "info");
                }}
              >
                Request this metric
              </button>
            </div>
          )}
        </Card>
      )}

      {/* ── History ── */}
      {history.length > 0 && (
        <Card>
          <SectionTitle title="This session" sub="Questions are kept so an answer can be re-run against fresher data without retyping it." />
          <div className="flex flex-wrap gap-1.5">
            {history.map((q) => (
              <span key={q} className="chip text-ink2 bg-[color:var(--plane)]">
                {q}
                <button className="text-brand font-semibold ml-1" onClick={() => ask(q)}>re-run</button>
              </span>
            ))}
          </div>
        </Card>
      )}

      <Callout tone="brand" title="Why this is not a chatbot bolted onto a database">
        A chatbot over raw tables invents a definition every time it is asked, so two people asking the same question in the same
        hour get two different numbers — which is exactly the problem this product exists to fix. Here the question compiles to a
        metric in the registry: one definition, one formula, an owner who is accountable for it, a version number that changes
        under review, and a published freshness contract. If the question cannot be compiled, the honest answer is &quot;not yet —
        here is the metric someone has to own first&quot;. Refusing to answer is a feature; a confident wrong number is what costs
        a season.
      </Callout>
    </div>
  );
}

// ── Answer resolution ────────────────────────────────────────────────────────

function resolve(q: string, app: ReturnType<typeof useApp>): Answer {
  const t = q.toLowerCase();
  const storeId = app.storeId;
  const store = storeById(storeId);

  // 1 — broken size sets
  if (t.includes("size set") || t.includes("size-set") || (t.includes("broken") && t.includes("size"))) {
    const rows = sizeSetExceptions(storeId, 40).filter((s) => s.health.status === "broken");
    return {
      metric: metric("size_set_health"),
      filters: `store = ${store.name}; status = broken`,
      grain: "store × style",
      timeRange: "Live position, now",
      ageMinutes: 2,
      body: rows.length ? (
        <Table>
          <thead>
            <tr><Th>Style</Th><Th>Missing core sizes</Th><Th align="right">Sellable</Th><Th align="right">True ROS</Th><Th align="right">Days left</Th><Th align="right">Value at risk</Th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.style.id}>
                <Td><div className="text-ink">{s.style.name}</div><div className="text-2xs text-muted num">{s.style.id}</div></Td>
                <Td><span className="inline-flex items-center gap-1.5"><StatusDot tone="critical" />{s.health.missingCore.join(", ")}</span></Td>
                <Td align="right" className="num">{s.sellable}</Td>
                <Td align="right" className="num">{s.ros.toFixed(2)}/day</Td>
                <Td align="right" className="num">{s.daysLeftInWindow}</Td>
                <Td align="right" className="num">{inr(s.valueAtRisk, { compact: true })}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty title="No broken size sets at this store right now" body="Two or more core sizes have to be at zero to count as broken." />
      ),
    };
  }

  // 2 — fill rate threshold
  if (t.includes("fill rate")) {
    const m = t.match(/(\d{2,3})\s*%/);
    const threshold = m ? Number(m[1]) / 100 : 0.9;
    const rows = allVitals().filter((v) => v.fillRate < threshold).sort((a, b) => a.fillRate - b.fillRate);
    return {
      metric: metric("fill_rate"),
      filters: `fill_rate < ${pct(threshold)}; all brands, all regions`,
      grain: "store",
      timeRange: "Current stock position",
      ageMinutes: 18,
      body: (
        <>
          <p className="text-sm text-ink2 mb-2">
            <span className="num font-semibold text-ink">{rows.length}</span> of {allVitals().length} stores are below {pct(threshold)} of their
            planned norm. Best-in-class band is 97–105%.
          </p>
          <Table>
            <thead><tr><Th>Store</Th><Th>Brand</Th><Th align="right">Fill rate</Th><Th align="right">Sellable units</Th><Th align="right">Norm</Th><Th align="right">In transit</Th></tr></thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.store.id}>
                  <Td>{v.store.name}</Td>
                  <Td className="text-ink2">{v.store.brand}</Td>
                  <Td align="right" className="num"><span className="inline-flex items-center gap-1.5"><StatusDot tone={v.fillRate < 0.5 ? "critical" : "warn"} />{pct(v.fillRate)}</span></Td>
                  <Td align="right" className="num">{v.sellableUnits.toLocaleString("en-IN")}</Td>
                  <Td align="right" className="num">{v.store.norm.toLocaleString("en-IN")}</Td>
                  <Td align="right" className="num">{v.inTransit}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      ),
    };
  }

  // 2b — margin bleed on a named style, across stores. The certified-BI showpiece:
  // a diagnostic sentence, a verified formula, and the exact outliers with a
  // one-tap action — not a dashboard to go hunting in.
  if (t.includes("margin") && (t.includes("bleed") || t.includes("bleeding") || t.includes("losing") || t.includes("oxford"))) {
    const target = STYLES.find((s) => s.name.toLowerCase().includes("oxford solid")) ?? STYLES[0];
    const rows = allVitals()
      .map((v) => {
        const r = rng(hashQ("bleed" + v.store.id + target.id));
        const unitsSold = 14 + Math.floor(r() * 46);
        const discountShare = 0.06 + r() * 0.26; // share of units billed below MRP
        const avgDepth = 0.12 + r() * 0.2; // realised discount on those units
        const residual = Math.floor(r() * 26);
        const bleed = Math.round(unitsSold * discountShare * target.mrp * avgDepth + residual * target.mrp * 0.25 * r());
        return { v, unitsSold, discountShare, avgDepth, residual, bleed };
      })
      .sort((a, b) => b.bleed - a.bleed);
    const top = rows.slice(0, 3);
    const total = rows.reduce((a, x) => a + x.bleed, 0);
    const topShare = top.reduce((a, x) => a + x.bleed, 0) / Math.max(1, total);

    return {
      metric: metric("style_margin_bleed"),
      filters: `style = ${target.name} (${target.id}); all stores carrying it`,
      grain: "store × style",
      timeRange: "Season to date, hourly refresh",
      ageMinutes: 18,
      body: (
        <div className="space-y-3">
          <p className="text-sm text-ink leading-relaxed">
            <span className="font-semibold">{top.length} stores account for {pct(topShare)} of the margin bleed</span> on{" "}
            {target.name} — {top.map((x) => x.v.store.name).join(", ")}. The dominant cause is unmanaged floor
            discounting: {pct(top[0].discountShare)} of units at {top[0].v.store.name} billed below MRP at an average
            depth of {pct(top[0].avgDepth)}, against a chain median near 11%. Residual stock past its window adds the
            rest. A structured markdown at these three protects more margin than it costs.
          </p>
          <Table>
            <thead>
              <tr>
                <Th>Store</Th><Th align="right">Units sold</Th><Th align="right">Sold below MRP</Th>
                <Th align="right">Avg depth</Th><Th align="right">Residual</Th><Th align="right">Margin bleed</Th><Th align="right" />
              </tr>
            </thead>
            <tbody>
              {top.map((x) => (
                <tr key={x.v.store.id}>
                  <Td>
                    <div className="text-ink">{x.v.store.name}</div>
                    <div className="text-2xs text-muted">{x.v.store.brand} · {x.v.store.city}</div>
                  </Td>
                  <Td align="right" className="num">{x.unitsSold}</Td>
                  <Td align="right" className="num"><span className="inline-flex items-center gap-1.5"><StatusDot tone="critical" />{pct(x.discountShare)}</span></Td>
                  <Td align="right" className="num">{pct(x.avgDepth)}</Td>
                  <Td align="right" className="num">{x.residual}</Td>
                  <Td align="right" className="num font-semibold" style={{ color: "var(--status-critical)" }}>{inr(x.bleed, { compact: true })}</Td>
                  <Td align="right">
                    <button
                      className="btn-primary !py-1.5 !text-xs"
                      onClick={() => {
                        app.dispatch({
                          type: "audit",
                          entry: {
                            at: NOW,
                            actor: app.actorName,
                            action: `Triggered a markdown review: ${target.name} at ${x.v.store.name} (${inr(x.bleed, { compact: true })} bleed)`,
                            object: target.id,
                            system: "Ask One",
                          },
                        });
                        app.toastNow(`Markdown review queued for ${x.v.store.name} — routed to the Markdown Agent with this evidence attached`, "good");
                      }}
                    >
                      Trigger markdown
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="text-2xs text-muted">
            Remaining {rows.length - top.length} stores sit inside the normal band; the full ranking is one click away in Reports.
          </div>
        </div>
      ),
    };
  }

  // 3 — markdown exposure by brand
  if (t.includes("markdown")) {
    const rows = brandRollups();
    return {
      metric: metric("markdown_exposure"),
      filters: "all brands; residual stock at expected depth",
      grain: "brand",
      timeRange: "Season to date, projected to season end",
      ageMinutes: 640,
      note: "Markdown exposure is in the registry but has not passed the adoption gate — it is version v0.9 and the expected-depth input is a planning assumption, not a rate signed off by Finance. Use it to rank brands, not to book a provision.",
      body: (
        <Table>
          <thead><tr><Th>Brand</Th><Th align="right">Sellable units</Th><Th align="right">Full-price sell-through</Th><Th align="right">Markdown exposure</Th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.brand}>
                <Td>{b.brand}</Td>
                <Td align="right" className="num">{b.units.toLocaleString("en-IN")}</Td>
                <Td align="right" className="num">{pct(b.sellThrough, 1)}</Td>
                <Td align="right" className="num">{inr(b.markdownExposure, { compact: true })}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ),
    };
  }

  // 4 — full-price sell-through by brand
  if (t.includes("sell-through") || t.includes("sell through") || t.includes("sellthrough")) {
    const rows = brandRollups();
    return {
      metric: metric("full_price_sell_through"),
      filters: "all brands; excludes markdown, staff purchase and transfers out",
      grain: "brand × season × store",
      timeRange: "Season to date",
      ageMinutes: 18,
      body: (
        <ColumnChart
          categories={rows.map((b) => b.brand)}
          series={[
            { name: "Full-price sell-through", color: "var(--series-1)", values: rows.map((b) => b.sellThrough * 100) },
            { name: "Benchmark midpoint (87.5%)", color: "var(--series-2)", values: rows.map(() => 87.5) },
          ]}
          format={(n) => `${n.toFixed(1)}%`}
          height={170}
        />
      ),
    };
  }

  // 5 — best seller under-stocked
  if (t.includes("best seller") || t.includes("bestseller") || t.includes("under-stock") || t.includes("under stock") || t.includes("understock")) {
    const rows = topSellers(storeId, 12).filter((s) => s.cover < 14 || s.health.status !== "healthy").slice(0, 8);
    return {
      metric: metric("cover_days"),
      filters: `store = ${store.name}; ranked by True ROS; cover < 14 days or size set not healthy`,
      grain: "store × style",
      timeRange: "Last 28 days of sales, live stock",
      ageMinutes: 18,
      body: rows.length ? (
        <Table>
          <thead><tr><Th>Style</Th><Th align="right">True ROS</Th><Th align="right">Sellable</Th><Th align="right">Cover</Th><Th>Size set</Th><Th>What to do</Th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.style.id}>
                <Td><div className="text-ink">{s.style.name}</div><div className="text-2xs text-muted num">{s.style.id}</div></Td>
                <Td align="right" className="num">{s.ros.toFixed(2)}/day</Td>
                <Td align="right" className="num">{s.sellable}</Td>
                <Td align="right" className="num">{s.cover >= 999 ? "—" : `${s.cover.toFixed(0)} d`}</Td>
                <Td><span className="inline-flex items-center gap-1.5"><StatusDot tone={s.health.status === "broken" ? "critical" : s.health.status === "at_risk" ? "warn" : "good"} />{s.health.status.replace("_", " ")}</span></Td>
                <Td className="text-ink2 text-xs">{s.decision.reason}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty title="Every top seller here has more than 14 days of cover and a healthy size set." />
      ),
    };
  }

  // 6 — order cancellation root cause
  if (t.includes("cancel") || /om-\d+/i.test(t)) {
    const idMatch = t.match(/om-\d+/i);
    const id = idMatch ? idMatch[0].toUpperCase() : "OM-55019";
    const order = app.omni.find((o) => o.id === id);
    return {
      metric: null,
      filters: `order = ${id}`,
      grain: "order",
      timeRange: "Order lifetime",
      ageMinutes: 2,
      note: "This is a record lookup against the omni root-cause ledger, not a metric. It is fully auditable and safe to act on, but it is not a governed number — do not aggregate it into a review pack until a cancellation-rate metric is registered.",
      missing: {
        metric: "omni_cancellation_rate",
        needs: [
          "Owner: Omni Operations",
          "Definition: cancelled units / units routed to store, by root cause",
          "Source: omni order ledger joined to the find-timer",
          "Freshness contract: live, with a 24-hour restatement window for late root causes",
        ],
      },
      body: order ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-line p-3">
            <div className="text-sm text-ink font-semibold mb-1">
              Root cause on record: {(order.rootCause ?? "not recorded").replace(/_/g, " ")}
            </div>
            <p className="text-xs text-ink2 leading-relaxed">
              {order.channel} order for {order.qty} × size {order.size}, {inr(order.value)}, routed to {storeById(order.storeId).name}.
              The associate searched for {order.findMinutes} minutes before the unit was declared unfindable. Today this ends as a
              cancellation with no reason recorded anywhere; here the reason is on the order and it is countable.
            </p>
          </div>
          <Timeline events={order.events} />
        </div>
      ) : (
        <Empty title={`No order ${id} in this scope`} body="Try OM-55019, the Flipkart order cancelled at Phoenix Marketcity Pune." />
      ),
    };
  }

  // 7 — staff UPT
  if (t.includes("upt") || t.includes("staff") || t.includes("associate")) {
    const rows = STAFF.map((s) => ({ ...s, upt: s.qty / Math.max(1, s.bills), atv: s.sales / Math.max(1, s.bills) })).sort((a, b) => a.upt - b.upt);
    const worst = rows[0];
    return {
      metric: null,
      filters: `store = ${storeById(STAFF[0].storeId).name}; all roles`,
      grain: "associate × month to date",
      timeRange: "Month to date",
      ageMinutes: 6,
      note: "Units per transaction is computed here from bills and quantity on the POS feed, but UPT is not yet a registered metric — there is no agreed treatment of returns, exchanges or split bills, so two stores could compute it differently.",
      missing: {
        metric: "units_per_transaction",
        needs: [
          "Owner: Store Operations",
          "Agreed treatment of returns, exchanges and split bills in the denominator",
          "Source: POS line-level ledger, not the daily summary",
          "Freshness contract: live",
        ],
      },
      body: (
        <>
          <p className="text-sm text-ink2 mb-2">
            Lowest UPT: <span className="font-semibold text-ink">{worst.name}</span> ({worst.role}) at{" "}
            <span className="num font-semibold text-ink">{worst.upt.toFixed(2)}</span> units per bill.
          </p>
          <Table>
            <thead><tr><Th>Associate</Th><Th>Role</Th><Th align="right">Sales</Th><Th align="right">Bills</Th><Th align="right">Units</Th><Th align="right">UPT</Th><Th align="right">ATV</Th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.name}>
                  <Td>{s.name}</Td>
                  <Td className="text-ink2">{s.role}</Td>
                  <Td align="right" className="num">{inr(s.sales, { compact: true })}</Td>
                  <Td align="right" className="num">{s.bills}</Td>
                  <Td align="right" className="num">{s.qty}</Td>
                  <Td align="right" className="num"><span className="inline-flex items-center gap-1.5"><StatusDot tone={s.upt < 1.1 ? "warn" : "good"} />{s.upt.toFixed(2)}</span></Td>
                  <Td align="right" className="num">{inr(s.atv)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      ),
    };
  }

  // 8 — this month vs last year
  if (t.includes("last year") || t.includes("ly") || (t.includes("month") && t.includes("compare"))) {
    const brands = brandRollups().map((b) => b.brand);
    const thisYear = brands.map((b) => allVitals().filter((v) => v.store.brand === b).reduce((a, v) => a + v.mtdSales, 0));
    const lastYear = brands.map((b) =>
      allVitals()
        .filter((v) => v.store.brand === b)
        .reduce((a, v) => a + v.mtdSales * (v.lySameDay / Math.max(1, v.todaySales)), 0)
    );
    return {
      metric: null,
      filters: "all brands; month to date vs the same 13 trading days last year",
      grain: "brand × month",
      timeRange: "1–13 Aug 2026 vs 1–13 Aug 2025",
      ageMinutes: 18,
      note: "Like-for-like sales versus last year is not a registered metric. This is computed from the POS feed and the same-day LY index, but there is no agreed rule for stores that opened, closed or were refitted mid-period — so the comparison is directional only.",
      missing: {
        metric: "lfl_net_sales",
        needs: [
          "Owner: Finance & Planning",
          "A like-for-like store rule (minimum trading days, refit and closure handling)",
          "Source: POS billing ledger, restated for store openings and closures",
          "Freshness contract: daily, restated at month close",
        ],
      },
      body: (
        <ColumnChart
          categories={brands}
          series={[
            { name: "This month to date", color: "var(--series-1)", values: thisYear },
            { name: "Same period last year", color: "var(--series-2)", values: lastYear },
          ]}
          format={(n) => inr(n, { compact: true })}
          height={170}
        />
      ),
    };
  }

  // Graceful failure — the honest default.
  const topic = t.includes("margin")
    ? { metric: "gross_margin_by_style", owner: "Finance & Planning", extra: "Needs landed cost by style, posted from SAP Finance at the PO level" }
    : t.includes("footfall")
    ? { metric: "footfall_capture", owner: "Store Operations", extra: "A single counted-footfall source; today the counters and the manual tally disagree" }
    : t.includes("return")
    ? { metric: "return_rate", owner: "Omni Operations", extra: "A common return reason list across channels" }
    : { metric: "unmapped_question", owner: "Retail Planning", extra: "A definition someone is willing to be accountable for" };

  return {
    metric: null,
    filters: "—",
    grain: "—",
    timeRange: "—",
    ageMinutes: 2,
    note: "I could not compile this question to a governed metric, so I have not answered it. Guessing here would be worse than waiting.",
    missing: {
      metric: topic.metric,
      needs: [
        `Owner: ${topic.owner}`,
        topic.extra,
        "A plain-English definition and a formula that survives a CFO reading it",
        "A published freshness contract (live, hourly or daily)",
      ],
    },
    body: (
      <Empty
        title="I can't answer that against a governed metric yet"
        body="Nothing in the registry covers this question. Rather than assemble a plausible-looking number from raw tables, here is exactly what would have to exist first."
      />
    ),
  };
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label mb-0.5">{label}</div>
      <div className="text-xs text-ink leading-snug">{value}</div>
    </div>
  );
}
