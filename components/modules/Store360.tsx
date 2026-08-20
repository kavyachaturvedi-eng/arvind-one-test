"use client";

// Store 360 — the planning team's way into the estate.
//
// Brand → Region → Cluster → Store. One payload shape (`scopeSummary`) renders
// every level, so a cluster and a store read the same way and a planner can act
// wherever they are standing rather than having to drill to a store first.

import React, { useMemo, useState } from "react";
import { Card, Chip, Meter, Modal, SectionTitle, Stat, StatusDot, Table, Td, Th } from "@/components/ui";
import { BRAND_SCOPE, brandScopes, childScopes, dcAvailable, gradedStyles, scopeSummary, sizeSetExceptions, storesInScope } from "@/lib/engine";
import { CLUSTERS, NOW, STORES, clusterById, storeById } from "@/lib/seed";
import { REQUEST_LABEL, useApp } from "@/lib/state";
import { fillBand, inr, nextRunAt, normRecommendation, pct } from "@/lib/rules";
import type { Scope } from "@/lib/types";
import type { StyleGrade } from "@/lib/rules";

const GRADE_TONE: Record<StyleGrade, "good" | "warn" | "critical"> = {
  stud: "good",
  bud: "warn",
  dud: "critical",
};

export default function Store360() {
  const app = useApp();
  const scope = app.scope;
  const summary = useMemo(() => scopeSummary(scope), [scope]);
  const [assign, setAssign] = useState(false);
  const [normOpen, setNormOpen] = useState(false);

  const store = scope.level === "store" ? storeById(scope.id) : null;
  const asks = app.requests.filter(
    (r) => r.status === "open" && storesInScope(scope).some((s) => s.id === r.storeId),
  );

  const bandTone = summary.band === "healthy" ? "good" : summary.band === "thin" ? "critical" : "warn";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Store 360</h1>
          <Trail scope={scope} onGo={app.setScope} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Chip tone="brand">Next run {fmtRunDay(nextRunAt(NOW))}</Chip>
          <button className="btn" data-open-run onClick={() => app.go("run")}>
            Open the run
          </button>
        </div>
      </div>

      <BrandBar scope={scope} onGo={app.setScope} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Fill rate"
          value={pct(summary.fillRate)}
          sub={`${summary.sellableUnits.toLocaleString("en-IN")} of ${summary.norm.toLocaleString("en-IN")} norm · band 97–105%`}
          tone={bandTone}
          emphasis
        />
        <Stat
          label="MTD vs target"
          value={pct(summary.achievement)}
          sub={`${inr(summary.mtdSales, { compact: true })} of ${inr(summary.mtdTarget, { compact: true })}`}
          tone={summary.achievement >= 1 ? "good" : summary.achievement >= 0.92 ? "warn" : "critical"}
        />
        <Stat
          label="Full-price sell-through"
          value={pct(summary.sellThrough)}
          sub="Season to date · benchmark 85–90%"
          tone={summary.sellThrough >= 0.85 ? "good" : summary.sellThrough >= 0.7 ? "warn" : "critical"}
        />
        <Stat
          label="At risk this week"
          value={inr(summary.valueAtRisk, { compact: true })}
          sub={`${summary.brokenStyles} broken · ${summary.atRiskStyles} at risk`}
          tone={summary.valueAtRisk > 0 ? "critical" : "good"}
        />
      </div>

      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-3 items-start">
        <Card>
          <SectionTitle title="Daily KPIs" right={<Chip>{summary.storeCount} {summary.storeCount === 1 ? "store" : "stores"}</Chip>} />
          <Table>
            <thead>
              <tr>
                <Th>Period</Th>
                <Th align="right">Sales</Th>
                <Th align="right">Bills</Th>
                <Th align="right">Qty</Th>
                <Th align="right">ATV</Th>
                <Th align="right">UPT</Th>
                <Th align="right">ASP</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>Today</Td>
                <Td align="right" className="num">{inr(summary.todaySales, { compact: true })}</Td>
                <Td align="right" className="num">{summary.bills.toLocaleString("en-IN")}</Td>
                <Td align="right" className="num">{Math.round(summary.qty).toLocaleString("en-IN")}</Td>
                <Td align="right" className="num">{inr(summary.atv)}</Td>
                <Td align="right" className="num">{summary.upt.toFixed(2)}</Td>
                <Td align="right" className="num">{inr(summary.asp)}</Td>
              </tr>
              <tr>
                <Td>Same day LY</Td>
                <Td align="right" className="num text-ink2">{inr(summary.lySameDay, { compact: true })}</Td>
                <Td align="right" className="num text-ink2" colSpan={5}>
                  MTD {inr(summary.lyMtd, { compact: true })}
                </Td>
              </tr>
              <tr>
                <Td>Growth</Td>
                <Td align="right" colSpan={6}>
                  <span className="num" style={{ color: summary.salesGrowth >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                    {summary.salesGrowth >= 0 ? "+" : ""}
                    {pct(summary.salesGrowth)} today · {summary.mtdSales >= summary.lyMtd ? "+" : ""}
                    {pct((summary.mtdSales - summary.lyMtd) / Math.max(1, summary.lyMtd))} MTD
                  </span>
                </Td>
              </tr>
            </tbody>
          </Table>
        </Card>

        <Card>
          <SectionTitle title="Core and fashion" right={<Chip tone={summary.mix === "on_plan" ? "good" : "warn"}>{MIX_LABEL[summary.mix]}</Chip>} />
          <div className="space-y-3">
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-ink2">Core</span>
                <span className="num text-ink">{pct(summary.corePct)}</span>
              </div>
              <Meter value={summary.corePct} target={summary.coreTarget} tone={summary.mix === "on_plan" ? "var(--status-good)" : "var(--status-warning)"} />
              <div className="text-2xs text-muted mt-1">
                Target {pct(summary.coreTarget)} · {summary.coreUnits.toLocaleString("en-IN")} units
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-ink2">Fashion</span>
                <span className="num text-ink">{pct(1 - summary.corePct)}</span>
              </div>
              <Meter value={1 - summary.corePct} target={1 - summary.coreTarget} tone="var(--series-2)" />
              <div className="text-2xs text-muted mt-1">{summary.fashionUnits.toLocaleString("en-IN")} units</div>
            </div>
            <div className="pt-2 border-t border-line flex items-center gap-2 flex-wrap">
              <button className="btn-primary !py-1.5 !text-xs" data-assign onClick={() => setAssign(true)}>
                Assign units
              </button>
              {store && (
                <button className="btn !py-1.5 !text-xs" data-set-norm onClick={() => setNormOpen(true)}>
                  Change norm
                </button>
              )}
            </div>
          </div>
        </Card>
      </div>

      {summary.children.length > 0 ? (
        <Card>
          <SectionTitle title={CHILD_LABEL[scope.level]} right={<Chip>{summary.children.length}</Chip>} />
          <Table>
            <thead>
              <tr>
                <Th>{CHILD_LABEL[scope.level]}</Th>
                <Th align="right">Fill rate</Th>
                <Th align="right">Sell-through</Th>
                <Th align="right">MTD vs target</Th>
                <Th align="right">Core</Th>
                <Th align="right">At risk</Th>
              </tr>
            </thead>
            <tbody>
              {summary.children.map((child) => (
                <ChildRow key={`${child.level}-${child.id}`} scope={child} onGo={app.setScope} />
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {store && <StudsBudsDuds storeId={store.id} />}

      <Card>
        <SectionTitle
          title="Open asks in this scope"
          right={
            <button className="btn !py-1 !text-2xs" data-go-asks onClick={() => app.go("asks")}>
              Decide these
            </button>
          }
        />
        {asks.length === 0 ? (
          <div className="text-sm text-ink2">Nothing waiting.</div>
        ) : (
          <div className="space-y-1.5">
            {asks.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 text-sm flex-wrap">
                <StatusDot tone={r.evidence.sizeSetStatus === "broken" ? "critical" : "warn"} />
                <span className="text-ink">{REQUEST_LABEL[r.kind]}</span>
                <span className="text-ink2">{storeById(r.storeId).name}</span>
                {r.units ? <span className="num text-ink2">{r.units} units</span> : null}
                <span className="text-2xs text-muted">{r.raisedBy}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <AssignModal open={assign} onClose={() => setAssign(false)} scope={scope} />
      {store && <NormModal open={normOpen} onClose={() => setNormOpen(false)} storeId={store.id} />}
    </div>
  );
}

const MIX_LABEL: Record<string, string> = {
  on_plan: "On plan",
  core_heavy: "Core heavy",
  fashion_heavy: "Fashion heavy",
};

const CHILD_LABEL: Record<Scope["level"], string> = {
  brand: "Regions",
  region: "Clusters",
  cluster: "Stores",
  store: "Stores",
};

function fmtRunDay(ms: number): string {
  const days = Math.round((ms - NOW) / 86_400_000);
  return days <= 1 ? "tomorrow" : `in ${days} days`;
}

// ── The path back up, and the brand filter ───────────────────────────────────

function Trail({ scope, onGo }: { scope: Scope; onGo: (s: Scope) => void }) {
  const crumbs: Scope[] = [BRAND_SCOPE];
  if (scope.level === "store") {
    const store = storeById(scope.id);
    const cluster = clusterById(store.clusterId);
    crumbs.push({ level: "region", id: store.region, label: store.region });
    crumbs.push({ level: "cluster", id: cluster.id, label: cluster.name });
    crumbs.push(scope);
  } else if (scope.level === "cluster") {
    const cluster = clusterById(scope.id);
    crumbs.push({ level: "region", id: cluster.region, label: cluster.region });
    crumbs.push(scope);
  } else if (scope.level === "region") {
    crumbs.push(scope);
  } else if (scope.id !== "all") {
    crumbs.push(scope);
  }

  return (
    <div className="flex items-center gap-1.5 mt-1 flex-wrap text-xs">
      {crumbs.map((c, i) => (
        <React.Fragment key={`${c.level}-${c.id}`}>
          {i > 0 && <span className="text-muted">·</span>}
          {i === crumbs.length - 1 ? (
            <span className="text-ink font-medium">{c.label}</span>
          ) : (
            <button className="text-ink2 hover:text-ink underline decoration-dotted" data-trail onClick={() => onGo(c)}>
              {c.label}
            </button>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function BrandBar({ scope, onGo }: { scope: Scope; onGo: (s: Scope) => void }) {
  const active = scope.level === "brand" ? scope.id : "";
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {brandScopes().map((b) => (
        <button
          key={b.id}
          data-brand={b.id}
          onClick={() => onGo(b)}
          className={`px-2.5 py-1.5 text-xs font-medium border ${
            active === b.id ? "border-[color:var(--brand)] text-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-line text-ink2 hover:text-ink"
          }`}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}

function ChildRow({ scope, onGo }: { scope: Scope; onGo: (s: Scope) => void }) {
  const s = useMemo(() => scopeSummary(scope), [scope]);
  const band = fillBand(s.fillRate);
  return (
    <tr className="hover:bg-[color:var(--plane)] cursor-pointer" data-child={scope.id} onClick={() => onGo(scope)}>
      <Td>
        <div className="flex items-center gap-2">
          <StatusDot tone={band === "healthy" ? "good" : band === "thin" ? "critical" : "warn"} />
          <span className="text-ink">{scope.label}</span>
          {scope.level === "cluster" && <span className="text-2xs text-muted">{clusterById(scope.id).managerName}</span>}
          {scope.level === "store" && <span className="text-2xs text-muted">{storeById(scope.id).grade}</span>}
        </div>
      </Td>
      <Td align="right" className="num">{pct(s.fillRate)}</Td>
      <Td align="right" className="num">{pct(s.sellThrough)}</Td>
      <Td align="right" className="num">{pct(s.achievement)}</Td>
      <Td align="right" className="num">{pct(s.corePct)}</Td>
      <Td align="right" className="num">{s.valueAtRisk > 0 ? inr(s.valueAtRisk, { compact: true }) : "—"}</Td>
    </tr>
  );
}

// ── Style-level performance, in Tarun's vocabulary ───────────────────────────

function StudsBudsDuds({ storeId }: { storeId: string }) {
  const graded = useMemo(() => gradedStyles(storeId, 40), [storeId]);
  const counts = graded.reduce(
    (a, g) => ({ ...a, [g.grade]: (a[g.grade] ?? 0) + 1 }),
    {} as Record<StyleGrade, number>,
  );

  return (
    <Card>
      <SectionTitle
        title="Studs, buds and duds"
        right={
          <div className="flex items-center gap-1.5">
            <Chip tone="good">{counts.stud ?? 0} studs</Chip>
            <Chip tone="warn">{counts.bud ?? 0} buds</Chip>
            <Chip tone="critical">{counts.dud ?? 0} duds</Chip>
          </div>
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>Style</Th>
            <Th>Type</Th>
            <Th align="right">True ROS</Th>
            <Th align="right">Region ROS</Th>
            <Th align="right">Cover</Th>
            <Th>Size set</Th>
            <Th align="right">At risk</Th>
          </tr>
        </thead>
        <tbody>
          {graded.slice(0, 12).map((g) => (
            <tr key={g.signal.style.id} data-graded={g.grade}>
              <Td>
                <div className="flex items-center gap-2">
                  <Chip tone={GRADE_TONE[g.grade]}>{g.grade}</Chip>
                  <span className="text-ink">{g.signal.style.name}</span>
                </div>
              </Td>
              <Td>{g.productType === "core" ? "Core" : "Fashion"}</Td>
              <Td align="right" className="num">{g.signal.ros.toFixed(2)}</Td>
              <Td align="right" className="num text-ink2">{g.signal.regionalRos.toFixed(2)}</Td>
              <Td align="right" className="num">{g.signal.cover > 900 ? "—" : `${Math.round(g.signal.cover)}d`}</Td>
              <Td>{g.signal.health.status === "healthy" ? "Healthy" : g.signal.health.status === "at_risk" ? "At risk" : "Broken"}</Td>
              <Td align="right" className="num">{g.signal.valueAtRisk > 0 ? inr(g.signal.valueAtRisk, { compact: true }) : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

// ── Actions ──────────────────────────────────────────────────────────────────

function AssignModal({ open, onClose, scope }: { open: boolean; onClose: () => void; scope: Scope }) {
  const app = useApp();
  const stores = storesInScope(scope);
  const [storeId, setStoreId] = useState(stores[0]?.id ?? STORES[0].id);
  const candidates = useMemo(() => sizeSetExceptions(storeId, 6), [storeId]);
  const [picked, setPicked] = useState<Record<string, number>>({});

  const total = Object.values(picked).reduce((a, n) => a + n, 0);

  function confirm() {
    const pushes = Object.entries(picked)
      .filter(([, units]) => units > 0)
      .map(([styleId, units], i) => ({
        id: `AP-${storeId}-${i}`,
        at: NOW,
        by: app.actorName,
        storeId,
        styleId,
        units,
        origin: "manual" as const,
      }));
    if (pushes.length === 0) return;
    app.dispatch({
      type: "alloc:push",
      pushes,
      by: app.actorName,
      label: `${total} units → ${storeById(storeId).name}`,
    });
    app.toastNow(`${total} units assigned to ${storeById(storeId).name}`, "good");
    setPicked({});
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign units from the warehouse"
      sub={`${storesInScope(scope).length} stores in ${scope.label}`}
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <span className="text-xs text-ink2 num">{total} units</span>
          <button className="btn-primary" data-assign-confirm disabled={total === 0} onClick={confirm}>
            Assign {total > 0 ? `${total} units` : ""}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <select
          value={storeId}
          data-assign-store
          onChange={(e) => {
            setStoreId(e.target.value);
            setPicked({});
          }}
          className="w-full border border-line bg-raised px-3 py-2 text-sm text-ink"
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {pct(app.normFor(s.id) > 0 ? scopeSummary({ level: "store", id: s.id, label: s.name }).sellableUnits / app.normFor(s.id) : 0)} of norm
            </option>
          ))}
        </select>

        <Table>
          <thead>
            <tr>
              <Th>Style</Th>
              <Th align="right">Warehouse</Th>
              <Th align="right">At risk</Th>
              <Th align="right">Units</Th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((sig) => {
              const size = sig.health.missingCore[0] ?? sig.style.coreSizes[0];
              const wh = dcAvailable(sig.style.id, size);
              return (
                <tr key={sig.style.id}>
                  <Td>
                    {sig.style.name}
                    <span className="text-2xs text-muted ml-1.5">{size}</span>
                  </Td>
                  <Td align="right" className="num">{wh}</Td>
                  <Td align="right" className="num">{inr(sig.valueAtRisk, { compact: true })}</Td>
                  <Td align="right">
                    <input
                      type="number"
                      min={0}
                      max={wh}
                      value={picked[sig.style.id] ?? 0}
                      data-assign-units
                      onChange={(e) =>
                        setPicked({ ...picked, [sig.style.id]: Math.max(0, Math.min(wh, Number(e.target.value) || 0)) })
                      }
                      className="w-16 border border-line bg-raised px-2 py-1 text-sm text-ink text-right num"
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </Modal>
  );
}

function NormModal({ open, onClose, storeId }: { open: boolean; onClose: () => void; storeId: string }) {
  const app = useApp();
  const store = storeById(storeId);
  const current = app.normFor(storeId);
  const summary = useMemo(() => scopeSummary({ level: "store", id: storeId, label: store.name }), [storeId, store.name]);
  const rec = normRecommendation({
    norm: current,
    fillRate: summary.fillRate,
    sellThrough: summary.sellThrough,
    sizeSetScore: summary.sizeSetScore,
  });
  const [to, setTo] = useState(rec.to);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Norm · ${store.name}`}
      sub={`Grade ${store.grade} · ${summary.sellableUnits.toLocaleString("en-IN")} units on floor`}
      footer={
        <button
          className="btn-primary"
          data-norm-confirm
          disabled={to === current}
          onClick={() => {
            app.dispatch({ type: "norm:set", storeId, to, by: app.actorName, reason: rec.reason });
            app.toastNow(`Norm set to ${to.toLocaleString("en-IN")} units`, "good");
            onClose();
          }}
        >
          Set norm to {to.toLocaleString("en-IN")}
        </button>
      }
    >
      <div className="space-y-3">
        <div className="text-sm text-ink">{rec.reason}</div>
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <div className="label">Current</div>
            <div className="num text-lg text-ink">{current.toLocaleString("en-IN")}</div>
          </div>
          <div className="text-muted">→</div>
          <div>
            <div className="label">New</div>
            <input
              type="number"
              value={to}
              data-norm-units
              onChange={(e) => setTo(Math.max(200, Number(e.target.value) || 0))}
              className="w-28 border border-line bg-raised px-2 py-1.5 text-lg text-ink num"
            />
          </div>
          <Chip tone={rec.delta > 0 ? "good" : rec.delta < 0 ? "warn" : "neutral"}>
            Recommended {rec.to.toLocaleString("en-IN")}
          </Chip>
        </div>
        {app.normLog.filter((n) => n.storeId === storeId).length > 0 && (
          <div className="pt-2 border-t border-line space-y-1">
            {app.normLog
              .filter((n) => n.storeId === storeId)
              .map((n) => (
                <div key={n.id} className="text-2xs text-muted">
                  {n.from.toLocaleString("en-IN")} → {n.to.toLocaleString("en-IN")} · {n.by}
                </div>
              ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
