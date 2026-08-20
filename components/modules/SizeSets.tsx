"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Size Sets — exception queue for broken core size sets, ranked by value at risk.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useRef, useState } from "react";
import { HOUR, NOW } from "@/lib/seed";
import {
  sellable,
  sizeSetExceptions,
  stockForStyleAtStore,
  stylesAtStore,
  vitalsFor,
  type StyleSignal,
} from "@/lib/engine";
import { useApp } from "@/lib/state";
import {
  BeforeAfter,
  Callout,
  Card,
  Chip,
  Empty,
  Modal,
  SectionTitle,
  SizeGrid,
  Stat,
  StatusDot,
  Swatch,
  Table,
  Tabs,
  Td,
  Th,
  inr,
  pct,
} from "@/components/ui";
import type { ReplenishAction } from "@/lib/rules";
import type { Size } from "@/lib/types";

type FilterId = "all" | "broken" | "at_risk";
type SortId = "value" | "cover" | "ros";

const ACTION_LABEL: Record<ReplenishAction, string> = {
  replenish_from_dc: "Replenish from DC",
  transfer_in: "Transfer in",
  stop_sell: "Stop featuring",
  pull_back: "Pull back",
  hold: "Hold",
};

const ACTION_TONE: Record<ReplenishAction, "good" | "brand" | "critical" | "warn" | "neutral"> = {
  replenish_from_dc: "good",
  transfer_in: "brand",
  stop_sell: "critical",
  pull_back: "warn",
  hold: "neutral",
};

const HEALTH_TONE = { broken: "critical", at_risk: "warn", healthy: "good" } as const;

function unitsBySize(storeId: string, styleId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of stockForStyleAtStore(storeId, styleId)) out[r.size] = sellable(r);
  return out;
}

function coverLabel(cover: number): string {
  if (cover >= 999) return "no sale";
  return `${cover.toFixed(0)} d`;
}

export default function SizeSets() {
  const app = useApp();
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("value");
  const [openId, setOpenId] = useState<string | null>(null);
  const seq = useRef(1);

  const vitals = vitalsFor(app.storeId);
  const carried = stylesAtStore(app.storeId).length;
  const exceptions = useMemo(() => sizeSetExceptions(app.storeId, 40), [app.storeId]);

  const rows = useMemo(() => {
    const filtered = exceptions.filter((e) =>
      filter === "all" ? true : filter === "broken" ? e.health.status === "broken" : e.health.status === "at_risk"
    );
    const sorted = [...filtered];
    if (sort === "value") sorted.sort((a, b) => b.valueAtRisk - a.valueAtRisk);
    if (sort === "cover") sorted.sort((a, b) => a.cover - b.cover);
    if (sort === "ros") sorted.sort((a, b) => b.ros - a.ros);
    return sorted;
  }, [exceptions, filter, sort]);

  const selected = exceptions.find((e) => e.style.id === openId) ?? null;
  const top = exceptions[0] ?? null;

  // ── Actions ────────────────────────────────────────────────────────────────

  function replenish(sig: StyleSignal) {
    const missing = sig.health.missingCore[0];
    const units = Math.max(1, Math.min(sig.dcUnits, sig.decision.units || Math.ceil(sig.ros * 7)));
    app.dispatch({
      type: "task:create",
      task: {
        id: `T-SS-${seq.current++}`,
        storeId: app.storeId,
        title: `Replenish ${units} × ${sig.style.name}${missing ? ` (size ${missing})` : ""} from the warehouse`,
        detail: `${sig.decision.reason} Raised from the size-set queue. Warehouse shows ${sig.dcUnits} units.`,
        origin: "replenishment",
        assignedTo: app.actorName,
        dueAt: NOW + 24 * HOUR,
        priority: 1,
        status: "todo",
        requiresPhoto: false,
        photoAttached: false,
        valueAtRisk: Math.round(sig.valueAtRisk),
        slaHours: 24,
      },
    });
    app.toastNow(`Replenishment raised: ${units} units of ${sig.style.name} from the warehouse.`, "good");
    setOpenId(null);
  }

  function findDonor(sig: StyleSignal) {
    const missing = sig.health.missingCore[0];
    app.go("savesale");
    app.toastNow(
      `Save the Sale opened with ${sig.style.name}${missing ? ` · size ${missing}` : ""} pre-loaded. ${sig.donorUnits} donor units inside the transfer radius.`,
      "info"
    );
    setOpenId(null);
  }

  function stopFeaturing(sig: StyleSignal) {
    app.dispatch({
      type: "task:create",
      task: {
        id: `T-VM-${seq.current++}`,
        storeId: app.storeId,
        title: `Stop featuring ${sig.style.name}, re-space the fixture`,
        detail: `Core sizes ${sig.health.missingCore.join(", ") || "—"} unavailable with ${sig.dcUnits} at the warehouse and ${sig.donorUnits} donor units. Move to the wall, give the faceout to a healthy set, submit a photo.`,
        origin: "vm",
        assignedTo: app.actorName,
        dueAt: NOW + 6 * HOUR,
        priority: 2,
        status: "todo",
        requiresPhoto: true,
        photoAttached: false,
        valueAtRisk: Math.round(sig.valueAtRisk),
        slaHours: 6,
      },
    });
    app.toastNow(`VM task created. ${sig.style.name} comes off the faceout and the fixture is re-spaced today.`, "warn");
    setOpenId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Size Sets</h1>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Stat label="Styles carried" value={String(carried)} sub="assortment live at this store" />
        <Stat
          label="Size-set health"
          value={pct(vitals.sizeSetScore)}
          tone={vitals.sizeSetScore < 0.7 ? "critical" : vitals.sizeSetScore < 0.85 ? "warn" : "good"}
          freshness={4}
        />
        <Stat label="Broken sets" value={String(vitals.brokenStyles)} tone="critical" sub="two or more core sizes gone" />
        <Stat label="At risk" value={String(vitals.atRiskStyles)} tone="warn" sub="one core size gone" />
        <Stat
          label="Value at risk"
          value={inr(vitals.valueAtRisk, { compact: true })}
          tone="critical"
          emphasis
        />
      </div>

      {top && <RosExplainer sig={top} storeId={app.storeId} />}

      <Card>
        <SectionTitle
          title="Exception queue"
          right={
            <div className="flex items-center gap-2 flex-wrap">
              <Tabs
                value={filter}
                onChange={setFilter}
                options={[
                  { id: "all", label: "All", count: exceptions.length },
                  { id: "broken", label: "Broken", count: exceptions.filter((e) => e.health.status === "broken").length },
                  { id: "at_risk", label: "At risk", count: exceptions.filter((e) => e.health.status === "at_risk").length },
                ]}
              />
              <Tabs
                value={sort}
                onChange={setSort}
                options={[
                  { id: "value", label: "₹ at risk" },
                  { id: "cover", label: "Cover" },
                  { id: "ros", label: "True ROS" },
                ]}
              />
            </div>
          }
        />

        {rows.length === 0 ? (
          <Empty
            title="No exceptions in this filter"
            body="Every core size on this filter is on the floor."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Style</Th>
                <Th>Size grid, sellable units (★ core)</Th>
                <Th align="right">True ROS</Th>
                <Th align="right">Cover</Th>
                <Th align="right">Window left</Th>
                <Th>Recommended action</Th>
                <Th align="right">Value at risk</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr
                  key={e.style.id}
                  onClick={() => setOpenId(e.style.id)}
                  className="cursor-pointer hover:bg-[color:var(--plane)] transition-colors"
                >
                  <Td>
                    <div className="flex items-center gap-2">
                      <Swatch hex={e.style.colourHex} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink leading-tight truncate">{e.style.name}</div>
                        <div className="text-2xs text-muted mt-0.5 flex items-center gap-1.5">
                          <StatusDot tone={HEALTH_TONE[e.health.status]} />
                          {e.style.category} · {e.health.status === "broken" ? "broken" : "at risk"}
                          {e.style.isNOS && " · NOS"}
                        </div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <SizeGrid sizes={e.style.sizes} units={unitsBySize(app.storeId, e.style.id)} core={e.style.coreSizes} />
                  </Td>
                  <Td align="right">
                    <span className="num text-sm font-semibold text-ink">{e.ros.toFixed(2)}</span>
                    <div className="text-2xs text-muted">units/day</div>
                  </Td>
                  <Td align="right">
                    <span className="num text-sm text-ink">{coverLabel(e.cover)}</span>
                  </Td>
                  <Td align="right">
                    <span className="num text-sm text-ink">{e.daysLeftInWindow} d</span>
                    <div className="text-2xs text-muted">full price</div>
                  </Td>
                  <Td>
                    <Chip tone={ACTION_TONE[e.decision.action]}>{ACTION_LABEL[e.decision.action]}</Chip>
                  </Td>
                  <Td align="right">
                    <span className="num text-sm font-semibold text-ink">{inr(e.valueAtRisk, { compact: true })}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {selected && (
        <DecisionModal
          sig={selected}
          storeId={app.storeId}
          onClose={() => setOpenId(null)}
          onReplenish={() => replenish(selected)}
          onDonor={() => findDonor(selected)}
          onStop={() => stopFeaturing(selected)}
        />
      )}
    </div>
  );
}

// ── True ROS vs naive ROS ────────────────────────────────────────────────────

function RosExplainer({ sig, storeId }: { sig: StyleSignal; storeId: string }) {
  const rows = stockForStyleAtStore(storeId, sig.style.id);
  const avgInStock = rows.length ? rows.reduce((a, r) => a + r.inStockDays, 0) / rows.length : 28;
  const stockoutDays = Math.max(0, 28 - avgInStock);
  const multiple = sig.naiveRos > 0 ? sig.ros / sig.naiveRos : 1;
  const weekGap = Math.max(0, (sig.ros - sig.naiveRos) * 7);

  return (
    <Card>
      <SectionTitle
        title="True ROS vs naive ROS"
        sub={`Top exception: ${sig.style.name}.`}
      />
      <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr] items-start">
        <BeforeAfter
          beforeLabel="Naive ROS, units ÷ 28 days"
          afterLabel="True ROS, units ÷ days genuinely in stock"
          before={`${sig.naiveRos.toFixed(2)} units/day`}
          after={`${sig.ros.toFixed(2)} units/day`}
        />
        <Callout tone="warn" title={`Demand understated ${multiple.toFixed(1)}×`}>
          This style was in stock <strong>{avgInStock.toFixed(0)} of the last 28 days</strong>, so{" "}
          <strong>{stockoutDays.toFixed(0)} stockout days</strong> sit in the naive denominator and suppress its ROS. At
          True ROS this style needs <strong>{weekGap.toFixed(0)} more units a week</strong> than the naive figure.
        </Callout>
      </div>
    </Card>
  );
}

// ── Decision modal ───────────────────────────────────────────────────────────

function DecisionModal({
  sig,
  storeId,
  onClose,
  onReplenish,
  onDonor,
  onStop,
}: {
  sig: StyleSignal;
  storeId: string;
  onClose: () => void;
  onReplenish: () => void;
  onDonor: () => void;
  onStop: () => void;
}) {
  const missing: Size[] = sig.health.missingCore;
  const noSupply = sig.dcUnits <= 0 && sig.donorUnits <= 0;
  const belowRegion = sig.regionalRos > 0 && sig.ros < sig.regionalRos * 0.85;
  const nosNearEnd = sig.style.isNOS && sig.daysLeftInWindow <= 21;
  const replenUnits = Math.max(1, Math.min(sig.dcUnits, sig.decision.units || Math.ceil(sig.ros * 7)));

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={sig.style.name}
      footer={
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn" disabled={sig.donorUnits <= 0} onClick={onDonor}>
            Find a donor store
          </button>
          <button className="btn" onClick={onStop}>
            Stop featuring + re-space fixture
          </button>
          <button className="btn-primary" disabled={sig.dcUnits <= 0} onClick={onReplenish}>
            Replenish {replenUnits} from warehouse
          </button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Callout tone={sig.decision.action === "stop_sell" ? "critical" : "brand"} title={ACTION_LABEL[sig.decision.action]}>
          {sig.decision.reason}
          <div className="mt-1.5 text-2xs text-muted">
            Confidence {pct(sig.decision.confidence)} · recommended quantity {sig.decision.units} units · decision rule in
            the metric registry.
          </div>
        </Callout>

        <div>
          <div className="label mb-2">Sellable units by size (★ core)</div>
          <SizeGrid sizes={sig.style.sizes} units={unitsBySize(storeId, sig.style.id)} core={sig.style.coreSizes} />
          <div className="text-2xs text-muted mt-2">
            Missing core sizes: {missing.length ? missing.join(", ") : "none"} · core coverage {pct(sig.health.coverage)}
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat label="Warehouse (RPC)" value={`${sig.dcUnits} units`} note={sig.dcUnits > 0 ? "available to pull today" : "exhausted for this size"} />
          <MiniStat label="Donor units nearby" value={`${sig.donorUnits} units`} note={sig.donorUnits > 0 ? "above a week's cover at peer stores" : "no peer store holds spare units"} />
          <MiniStat label="Regional rank" value={`#${sig.regionalRank}`} note={`of same-brand stores in region · regional avg ${sig.regionalRos.toFixed(2)}/day`} />
          <MiniStat label="This store's True ROS" value={`${sig.ros.toFixed(2)}/day`} note={`${sig.cover >= 999 ? "no sale recorded" : `${sig.cover.toFixed(0)} days cover`} · ${sig.daysLeftInWindow} days of full-price window left`} />
        </div>

        {noSupply && (
          <Callout tone="critical" title="Zero donors and zero warehouse stock">
            Nothing is available to replenish {missing.join(", ") || "the missing sizes"} anywhere in the network, so both
            supply buttons are disabled. Stop featuring it, re-space the fixture, and flag the SKU to planning for the next
            buy.
          </Callout>
        )}

        {nosNearEnd && (
          <Callout tone="warn" title="NOS core style near the end of its window">
            {sig.style.name} is a never-out-of-stock carry-forward line with {sig.daysLeftInWindow} days left in the
            window. The pull-back rule is suppressed for NOS styles, this stock carries into the next season at full
            price.
          </Callout>
        )}

        {belowRegion && (
          <Callout tone="warn" title="This is a display problem, not a stock problem">
            This store sells {sig.style.name} at {sig.ros.toFixed(2)} units/day against a regional average of{" "}
            {sig.regionalRos.toFixed(2)}, rank #{sig.regionalRank} among same-brand peers. More stock will not fix a
            style that is not being seen. Raise the VM task below: move it to a faceout, re-space the fixture and check
            the size run on the floor before pulling more units into the store.
          </Callout>
        )}

        <div className="rounded-lg border border-line p-3">
          <div className="label mb-1.5">Supply check</div>
          <ul className="text-xs text-ink2 space-y-1 leading-relaxed">
            <li>
              {sig.dcUnits > 0
                ? `Warehouse replenishment enabled. ${sig.dcUnits} units held back at the RPC for this size.`
                : "Warehouse replenishment disabled: the RPC shows zero units for the missing core size."}
            </li>
            <li>
              {sig.donorUnits > 0
                ? `Donor transfer enabled. ${sig.donorUnits} units sit above a week's cover at peer stores inside the radius.`
                : "Donor transfer disabled: no peer store holds units above its own week of cover."}
            </li>
            <li>
              Value at risk {inr(sig.valueAtRisk)}. {Math.min(7, sig.daysLeftInWindow)} days of True ROS demand at full
              price that this set cannot currently serve.
            </li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}

function MiniStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="label">{label}</div>
      <div className="text-lg font-semibold text-ink num mt-1 leading-none">{value}</div>
      <div className="text-2xs text-muted mt-1.5 leading-snug">{note}</div>
    </div>
  );
}
