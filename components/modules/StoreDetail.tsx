"use client";

// One store, in full. Reached from the Store 360 list, and addressable on its
// own URL so the back button returns to the list rather than leaving the app.
//
// This is where a planner goes deep: what the door actually holds by SKU, what
// is selling, what is broken, and the two things planning can do about it —
// send units, or change the norm.

import React, { useEffect, useMemo, useState } from "react";
import { Card, Chip, Meter, Modal, SectionTitle, SortTh, Stat, StatusDot, Swatch, Table, Tabs, Td, Th, relTime, useSort } from "@/components/ui";
import {
  PERIOD_LABEL,
  dcAvailable,
  estateSummary,
  estateTrend,
  gradedStyles,
  mixForStore,
  planningStores,
  applyMove,
  sizeSetExceptions,
  skuRow,
  unitsAt,
  vitalsFor,
} from "@/lib/engine";
import { NOW, clusterById, storeById } from "@/lib/seed";
import { REQUEST_LABEL, useApp } from "@/lib/state";
import { coreShareTarget, fillBand, inr, normRecommendation, pct } from "@/lib/rules";
import type { StyleGrade } from "@/lib/rules";
import type { Size, StockMove } from "@/lib/types";

const GRADE_TONE: Record<StyleGrade, "good" | "warn" | "critical"> = { stud: "good", bud: "warn", dud: "critical" };
type Cut = "all" | "stud" | "bud" | "dud" | "broken";
type StyleSort = "code" | "name" | "colour" | "type" | "grade" | "floor" | "ros" | "region" | "cover" | "st" | "set" | "risk";

export default function StoreView() {
  const app = useApp();
  const storeId = app.estate.storeId ?? planningStores()[0].id;
  const store = storeById(storeId);
  const cluster = clusterById(store.clusterId);
  const period = app.estate.period;

  const summary = useMemo(() => estateSummary([store], period), [store, period]);
  const graded = useMemo(() => gradedStyles(storeId, 60), [storeId]);
  const mix = useMemo(() => mixForStore(storeId), [storeId]);
  const spark = useMemo(() => estateTrend([store]), [store]);

  // A brief "opening" beat so arriving at a store reads as going somewhere,
  // rather than the whole page swapping under you. Client-only, so it never
  // affects what the server rendered.
  const [opening, setOpening] = useState(true);
  useEffect(() => {
    setOpening(true);
    const t = setTimeout(() => setOpening(false), 1100);
    return () => clearTimeout(t);
  }, [storeId]);

  const [cut, setCut] = useState<Cut>("all");
  const [assign, setAssign] = useState(false);
  const [normOpen, setNormOpen] = useState(false);
  const [openStyle, setOpenStyle] = useState<string | null>(null);

  const norm = app.normFor(storeId);
  const fill = norm > 0 ? summary.sellableUnits / norm : 0;
  const band = fillBand(fill);
  const mixTotal = mix.core + mix.fashion;
  const corePct = mixTotal > 0 ? mix.core / mixTotal : 0;
  const coreTarget = coreShareTarget(store.grade);

  const asks = app.requests.filter((r) => r.storeId === storeId);
  const shown =
    cut === "all"
      ? graded
      : cut === "broken"
      ? graded.filter((g) => g.signal.health.status !== "healthy")
      : graded.filter((g) => g.grade === cut);

  const counts = graded.reduce((a, g) => ({ ...a, [g.grade]: (a[g.grade] ?? 0) + 1 }), {} as Record<StyleGrade, number>);

  const sorter = useSort<StyleSort>("risk");
  const sorted = sorter.sort(shown, (g, key) => {
    switch (key) {
      case "code": return g.signal.style.id;
      case "name": return g.signal.style.name;
      case "colour": return g.signal.style.colour;
      case "type": return g.productType;
      case "grade": return g.grade;
      case "floor": return g.signal.sellable;
      case "ros": return g.signal.ros;
      case "region": return g.signal.regionalRos;
      case "cover": return Math.min(g.signal.cover, 999);
      case "st": return g.sellThrough;
      case "set": return g.signal.health.status;
      case "risk": return g.signal.valueAtRisk;
    }
  });

  return (
    <div className="space-y-4">
      {opening && (
        /* Opacity-only page transition, so a fixed overlay is safe here — a
           transform on an ancestor would have made this its containing block. */
        <div
          className="fixed inset-0 z-[60] grid place-items-center no-print"
          style={{ background: "var(--text-primary)", animation: "storeOpen 1100ms ease-out forwards" }}
          data-store-opening
          aria-live="polite"
        >
          <div className="text-center px-6" style={{ animation: "storeOpenRise 380ms ease-out both" }}>
            <div className="label" style={{ color: "#8A8F96" }}>
              Opening Store 360
            </div>
            <div className="text-[40px] leading-tight font-medium text-white mt-3" style={{ letterSpacing: "-0.02em" }}>
              {store.name}
            </div>
            <div className="text-sm mt-2" style={{ color: "#8A8F96" }}>
              {cluster.name} · {store.city} · Grade {store.grade}
            </div>
            <div className="mx-auto mt-6 h-[3px] w-48 overflow-hidden" style={{ background: "#2A2A2A" }}>
              <div className="h-full" style={{ background: "#fff", animation: "storeOpenBar 1000ms ease-out forwards" }} />
            </div>
          </div>
        </div>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {/* Where you are, and every level of it is a way back. */}
          <div className="flex items-center gap-1.5 text-xs mb-1.5 flex-wrap">
            <button className="text-ink2 hover:text-ink" data-back-to-estate onClick={() => app.openStore(null)}>
              All stores
            </button>
            <span className="text-muted">/</span>
            <button
              className="text-ink2 hover:text-ink"
              data-hier-region
              onClick={() => {
                app.setFilter({ region: store.region, cluster: "all" });
              }}
            >
              {store.region}
            </button>
            <span className="text-muted">/</span>
            <button
              className="text-ink2 hover:text-ink"
              data-hier-cluster
              onClick={() => {
                app.setFilter({ region: "all", cluster: store.clusterId });
              }}
            >
              {cluster.name}
            </button>
            <span className="text-muted">/</span>
            <span className="text-ink font-medium">{store.name}</span>
          </div>
          <h1 className="text-xl font-semibold text-ink">{store.name}</h1>
          <p className="text-xs text-ink2 mt-1">
            {store.code} · {store.city} · Grade {store.grade} · {store.model} · {store.managerName}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn-primary" data-assign onClick={() => setAssign(true)}>
            Send units
          </button>
          <button className="btn" data-set-norm onClick={() => setNormOpen(true)}>
            Change norm
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat
          label="Fill rate"
          value={pct(fill)}
          sub={`${summary.sellableUnits.toLocaleString("en-IN")} of ${norm.toLocaleString("en-IN")} norm`}
          tone={band === "healthy" ? "good" : band === "thin" ? "critical" : "warn"}
          emphasis
        />
        <Stat
          label={`Sales · ${PERIOD_LABEL[period].toLowerCase()}`}
          value={inr(summary.sales, { compact: true })}
          sub={`${pct(summary.achievement)} of target`}
          tone={summary.achievement >= 1 ? "good" : summary.achievement >= 0.92 ? "warn" : "critical"}
          spark={spark}
        />
        <Stat
          label="Full-price sell-through"
          value={pct(summary.sellThrough)}
          tone={summary.sellThrough >= 0.85 ? "good" : summary.sellThrough >= 0.7 ? "warn" : "critical"}
        />
        <Stat
          label="At risk this week"
          value={inr(summary.valueAtRisk, { compact: true })}
          sub={`${summary.brokenStyles} broken · ${summary.atRiskStyles} at risk`}
          tone={summary.valueAtRisk > 0 ? "critical" : "good"}
        />
        <Stat
          label="Broken studs"
          value={String(summary.brokenStuds)}
          sub={summary.brokenStuds > 0 ? inr(summary.brokenStudValue, { compact: true }) : undefined}
          tone={summary.brokenStuds > 0 ? "critical" : "good"}
        />
      </div>

      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-3 items-start">
        <Card>
          <SectionTitle title={`KPIs · ${PERIOD_LABEL[period].toLowerCase()}`} />
          <Table>
            <thead>
              <tr>
                <Th align="right">Sales</Th>
                <Th align="right">Bills</Th>
                <Th align="right">Qty</Th>
                <Th align="right">ATV</Th>
                <Th align="right">UPT</Th>
                <Th align="right">ASP</Th>
                <Th align="right">Conversion</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td align="right" className="num">{inr(summary.sales, { compact: true })}</Td>
                <Td align="right" className="num">{Math.round(summary.bills).toLocaleString("en-IN")}</Td>
                <Td align="right" className="num">{Math.round(summary.qty).toLocaleString("en-IN")}</Td>
                <Td align="right" className="num">{inr(summary.atv)}</Td>
                <Td align="right" className="num">{summary.upt.toFixed(2)}</Td>
                <Td align="right" className="num">{inr(summary.asp)}</Td>
                <Td align="right" className="num">{pct(summary.conversion)}</Td>
              </tr>
            </tbody>
          </Table>
        </Card>

        <Card>
          <SectionTitle title="Core and fashion" />
          <div className="space-y-3">
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-ink2">Core</span>
                <span className="num text-ink">{pct(corePct)}</span>
              </div>
              <Meter value={corePct} target={coreTarget} tone="var(--status-good)" />
              <div className="text-2xs text-muted mt-1">Target {pct(coreTarget)} · {mix.core.toLocaleString("en-IN")} units</div>
            </div>
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-ink2">Fashion</span>
                <span className="num text-ink">{pct(1 - corePct)}</span>
              </div>
              <Meter value={1 - corePct} target={1 - coreTarget} tone="var(--series-2)" />
              <div className="text-2xs text-muted mt-1">{mix.fashion.toLocaleString("en-IN")} units</div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle
          title="What this store carries"
          right={
            <Tabs
              value={cut}
              onChange={setCut}
              options={[
                { id: "all", label: "All", count: graded.length },
                { id: "stud", label: "Studs", count: counts.stud ?? 0 },
                { id: "bud", label: "Buds", count: counts.bud ?? 0 },
                { id: "dud", label: "Duds", count: counts.dud ?? 0 },
                { id: "broken", label: "Size set", count: graded.filter((g) => g.signal.health.status !== "healthy").length },
              ]}
            />
          }
        />
        <Table>
          <thead>
            <tr>
              <SortTh sortKey="code" sorter={sorter}>SKU</SortTh>
              <SortTh sortKey="name" sorter={sorter}>Style</SortTh>
              <SortTh sortKey="colour" sorter={sorter}>Colour</SortTh>
              <SortTh sortKey="type" sorter={sorter}>Type</SortTh>
              <SortTh sortKey="grade" sorter={sorter}>Grade</SortTh>
              <SortTh sortKey="floor" sorter={sorter} align="right">On floor</SortTh>
              <SortTh sortKey="ros" sorter={sorter} align="right">True ROS</SortTh>
              <SortTh sortKey="region" sorter={sorter} align="right">Region ROS</SortTh>
              <SortTh sortKey="cover" sorter={sorter} align="right">Cover</SortTh>
              <SortTh sortKey="st" sorter={sorter} align="right">Sell-through</SortTh>
              <SortTh sortKey="set" sorter={sorter}>Size set</SortTh>
              <SortTh sortKey="risk" sorter={sorter} align="right">At risk</SortTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map((g) => (
              <tr
                key={g.signal.style.id}
                className="hover:bg-[color:var(--plane)] cursor-pointer"
                data-style-row={g.grade}
                onClick={() => setOpenStyle(g.signal.style.id)}
              >
                <Td className="num text-xs text-ink2">{g.signal.style.id}</Td>
                <Td className="text-ink">{g.signal.style.name}</Td>
                <Td>
                  <Swatch hex={g.signal.style.colourHex} label={g.signal.style.colour} />
                </Td>
                <Td>{g.productType === "core" ? "Core" : "Fashion"}</Td>
                <Td>
                  <Chip tone={GRADE_TONE[g.grade]}>{g.grade}</Chip>
                </Td>
                <Td align="right" className="num">{g.signal.sellable}</Td>
                <Td align="right" className="num">{g.signal.ros.toFixed(2)}</Td>
                <Td align="right" className="num text-ink2">{g.signal.regionalRos.toFixed(2)}</Td>
                <Td align="right" className="num">{g.signal.cover > 900 ? "—" : `${Math.round(g.signal.cover)}d`}</Td>
                <Td align="right" className="num">{pct(g.sellThrough)}</Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot tone={g.signal.health.status === "healthy" ? "good" : g.signal.health.status === "broken" ? "critical" : "warn"} />
                    <span className="text-xs text-ink2">
                      {g.signal.health.status === "healthy" ? "Healthy" : g.signal.health.missingCore.join(", ") || "At risk"}
                    </span>
                  </span>
                </Td>
                <Td align="right" className="num">{g.signal.valueAtRisk > 0 ? inr(g.signal.valueAtRisk, { compact: true }) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <SectionTitle title="Asks from this store" right={<Chip tone={asks.some((a) => a.status === "open") ? "warn" : "good"}>{asks.filter((a) => a.status === "open").length} open</Chip>} />
        {asks.length === 0 ? (
          <div className="text-sm text-ink2">Nothing raised.</div>
        ) : (
          <Table>
            <thead>
              <tr><Th>Ask</Th><Th align="right">Units</Th><Th>Raised</Th><Th>Status</Th></tr>
            </thead>
            <tbody>
              {asks.map((r) => (
                <tr key={r.id} data-store-ask={r.status}>
                  <Td>{REQUEST_LABEL[r.kind]}</Td>
                  <Td align="right" className="num">{r.units ?? "—"}</Td>
                  <Td className="text-xs text-ink2">{r.raisedBy} · {relTime(r.raisedAt, NOW)}</Td>
                  <Td>
                    <Chip tone={r.status === "approved" ? "good" : r.status === "rejected" ? "neutral" : "warn"}>
                      {r.status === "open" ? "Waiting" : r.status === "approved" ? "Approved" : "Rejected"}
                    </Chip>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <SkuModal storeId={storeId} styleId={openStyle} onClose={() => setOpenStyle(null)} />
      <AssignModal open={assign} onClose={() => setAssign(false)} storeId={storeId} />
      <NormModal open={normOpen} onClose={() => setNormOpen(false)} storeId={storeId} />
    </div>
  );
}

// ── SKU level ────────────────────────────────────────────────────────────────

function SkuModal({ storeId, styleId, onClose }: { storeId: string; styleId: string | null; onClose: () => void }) {
  if (!styleId) return null;
  const sig = gradedStyles(storeId, 60).find((g) => g.signal.style.id === styleId);
  if (!sig) return null;
  const s = sig.signal.style;

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={s.name}
      sub={`${s.id} · ${s.category} · ${s.productType === "core" ? "Core" : "Fashion"} · MRP ${inr(s.mrp)} · colour ${s.colour}`}
    >
      <Table>
        <thead>
          <tr>
            <Th>Size</Th>
            <Th align="right">On floor</Th>
            <Th align="right">Reserved</Th>
            <Th align="right">In transit</Th>
            <Th align="right">Sold 28d</Th>
            <Th align="right">Warehouse</Th>
            <Th>Pivotal</Th>
          </tr>
        </thead>
        <tbody>
          {s.sizes.map((size) => {
            const row = skuRow(storeId, styleId, size);
            const sellableUnits = row ? Math.max(0, row.onHand - row.reserved) : 0;
            const isPivotal = s.coreSizes.includes(size);
            const gone = isPivotal && sellableUnits === 0;
            return (
              <tr key={size} data-sku-row={gone ? "gone" : "held"}>
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    {gone && <StatusDot tone="critical" />}
                    <span className="num text-ink">{size}</span>
                  </span>
                </Td>
                <Td align="right" className="num" style={gone ? { color: "var(--status-critical)" } : undefined}>{sellableUnits}</Td>
                <Td align="right" className="num text-ink2">{row?.reserved ?? 0}</Td>
                <Td align="right" className="num text-ink2">{row?.inTransit ?? 0}</Td>
                <Td align="right" className="num">{row?.sold28 ?? 0}</Td>
                <Td align="right" className="num">{dcAvailable(styleId, size)}</Td>
                <Td>{isPivotal ? "Pivotal" : "—"}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <div className="mt-3 text-xs text-ink2">{sig.signal.decision.reason}</div>
    </Modal>
  );
}

// ── Actions ──────────────────────────────────────────────────────────────────

function AssignModal({ open, onClose, storeId }: { open: boolean; onClose: () => void; storeId: string }) {
  const app = useApp();
  const candidates = useMemo(() => sizeSetExceptions(storeId, 8), [storeId]);
  // Size is chosen explicitly, per line. Sending units without naming the size
  // is how a broken set gets "replenished" with the size that was already there.
  const [picked, setPicked] = useState<Record<string, { size: Size; units: number }>>({});

  const total = Object.values(picked).reduce((a, p) => a + p.units, 0);

  function lineFor(styleId: string, fallback: Size) {
    return picked[styleId] ?? { size: fallback, units: 0 };
  }

  function confirm() {
    const moves: StockMove[] = [];
    Object.entries(picked)
      .filter(([, p]) => p.units > 0)
      .forEach(([styleId, p], i) => {
        const ok = applyMove({ from: "warehouse", toStoreId: storeId, styleId, size: p.size, units: p.units });
        if (ok) {
          moves.push({
            id: `MV-SD-${storeId}-${i}`,
            at: NOW,
            by: app.actorName,
            from: "warehouse",
            toStoreId: storeId,
            styleId,
            size: p.size,
            units: p.units,
            reason: "Sent by planning from Store 360",
          });
        }
      });
    if (moves.length === 0) return;
    app.dispatch({ type: "cycle:apply", id: `SEND-${storeId}-${app.moves.length}`, moves, by: app.actorName });
    app.toastNow(`${moves.reduce((a, m) => a + m.units, 0)} units sent to ${storeById(storeId).name}`, "good");
    setPicked({});
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Send units from the warehouse"
      sub={storeById(storeId).name}
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <span className="text-xs text-ink2 num">{total} units</span>
          <button className="btn-primary" data-assign-confirm disabled={total === 0} onClick={confirm}>
            Send {total > 0 ? `${total} units` : ""}
          </button>
        </div>
      }
    >
      <Table>
        <thead>
          <tr>
            <Th>SKU</Th>
            <Th>Style</Th>
            <Th>Colour</Th>
            <Th>Set</Th>
            <Th align="right">Here now</Th>
            <Th>Size</Th>
            <Th align="right">Warehouse</Th>
            <Th align="right">Send</Th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((sig) => {
            const fallback = (sig.health.missingCore[0] ?? sig.style.coreSizes[0]) as Size;
            const line = lineFor(sig.style.id, fallback);
            const wh = dcAvailable(sig.style.id, line.size);
            const here = unitsAt(storeId, sig.style.id, line.size);
            return (
              <tr key={sig.style.id}>
                <Td className="num text-xs text-ink2">{sig.style.id}</Td>
                <Td className="text-ink">{sig.style.name}</Td>
                <Td>
                  <Swatch hex={sig.style.colourHex} label={sig.style.colour} />
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot tone={sig.health.status === "broken" ? "critical" : "warn"} />
                    <span className="text-xs text-ink2">{sig.health.status === "broken" ? "Broken" : "At risk"}</span>
                  </span>
                </Td>
                <Td align="right" className="num" style={here === 0 ? { color: "var(--status-critical)" } : undefined}>
                  {here}
                </Td>
                <Td>
                  <select
                    value={line.size}
                    data-assign-size
                    onChange={(e) => setPicked({ ...picked, [sig.style.id]: { size: e.target.value as Size, units: 0 } })}
                    className="border border-line bg-raised px-2 py-1 text-xs text-ink num"
                  >
                    {sig.style.sizes.map((sz) => (
                      <option key={sz} value={sz}>
                        {sz}
                        {sig.style.coreSizes.includes(sz) ? " · pivotal" : ""} — {dcAvailable(sig.style.id, sz)} in warehouse
                      </option>
                    ))}
                  </select>
                </Td>
                <Td align="right" className="num">{wh}</Td>
                <Td align="right">
                  <input
                    type="number"
                    min={0}
                    max={wh}
                    value={line.units}
                    data-assign-units
                    onChange={(e) =>
                      setPicked({
                        ...picked,
                        [sig.style.id]: { size: line.size, units: Math.max(0, Math.min(wh, Number(e.target.value) || 0)) },
                      })
                    }
                    className="w-16 border border-line bg-raised px-2 py-1 text-sm text-ink text-right num"
                  />
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Modal>
  );
}

function NormModal({ open, onClose, storeId }: { open: boolean; onClose: () => void; storeId: string }) {
  const app = useApp();
  const store = storeById(storeId);
  const current = app.normFor(storeId);
  const v = useMemo(() => vitalsFor(storeId), [storeId]);
  const rec = normRecommendation({ norm: current, fillRate: v.fillRate, sellThrough: v.sellThrough, sizeSetScore: v.sizeSetScore });
  const [to, setTo] = useState(rec.to);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Norm · ${store.name}`}
      sub={`Grade ${store.grade} · ${v.sellableUnits.toLocaleString("en-IN")} units on floor`}
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
          <Chip tone={rec.delta > 0 ? "good" : rec.delta < 0 ? "warn" : "neutral"}>Recommended {rec.to.toLocaleString("en-IN")}</Chip>
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
