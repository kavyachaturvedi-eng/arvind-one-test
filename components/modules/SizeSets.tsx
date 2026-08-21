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

  /** The floor asks for a transfer; which store it comes from is planning's call. */
  function askTransfer(sig: StyleSignal) {
    app.raiseRequest({
      kind: "replenish",
      storeId: app.storeId,
      styleId: sig.style.id,
      size: sig.health.missingCore[0] ?? sig.style.coreSizes[0],
      units: Math.max(1, sig.decision.units || Math.ceil(sig.ros * 7)),
      note: sig.decision.reason,
      evidence: {
        fillRate: vitals.fillRate,
        sellable: sig.sellable,
        ros: sig.ros,
        coverDays: sig.cover,
        sizeSetStatus: sig.health.status,
        valueAtRisk: Math.round(sig.valueAtRisk),
      },
    });
    app.toastNow(`Asked planning for ${sig.style.name}`, "good");
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
        <Stat label="Styles carried" value={String(carried)} />
        <Stat
          label="Size-set health"
          value={pct(vitals.sizeSetScore)}
          tone={vitals.sizeSetScore < 0.7 ? "critical" : vitals.sizeSetScore < 0.85 ? "warn" : "good"}
        />
        <Stat label="Broken sets" value={String(vitals.brokenStyles)} tone="critical" />
        <Stat label="At risk" value={String(vitals.atRiskStyles)} tone="warn" />
        <Stat label="Value at risk" value={inr(vitals.valueAtRisk, { compact: true })} tone="critical" emphasis />
      </div>

      <Card>
        <SectionTitle
          title="Needs fixing"
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
                <Th align="right">At risk · 7 days</Th>
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
          onTransfer={() => askTransfer(selected)}
          onStop={() => stopFeaturing(selected)}
        />
      )}
    </div>
  );
}


// ── Decision modal ───────────────────────────────────────────────────────────

function DecisionModal({
  sig,
  storeId,
  onClose,
  onReplenish,
  onTransfer,
  onStop,
}: {
  sig: StyleSignal;
  storeId: string;
  onClose: () => void;
  onReplenish: () => void;
  onTransfer: () => void;
  onStop: () => void;
}) {
  const missing: Size[] = sig.health.missingCore;
  const needed = Math.max(1, sig.decision.units || Math.ceil(sig.ros * 7));

  // Where the ask goes is decided by what can actually cover it, not by the
  // floor hunting for a donor store. That is planning's call.
  const route = sig.dcUnits >= needed ? "warehouse" : sig.donorUnits > 0 ? "transfer" : "none";

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={sig.style.name}
      sub={`${sig.style.id} · ${sig.style.colour} · ${missing.length ? `${missing.join(", ")} gone` : "set healthy"}`}
      footer={
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn" data-stop-featuring onClick={onStop}>
            Stop featuring
          </button>
          {route === "warehouse" && (
            <button className="btn-primary" data-ask-warehouse onClick={onReplenish}>
              Ask warehouse for {needed}
            </button>
          )}
          {route === "transfer" && (
            <button className="btn-primary" data-ask-transfer onClick={onTransfer}>
              Ask for a transfer of {needed}
            </button>
          )}
          {route === "none" && (
            <button className="btn-primary" data-ask-planning onClick={onTransfer}>
              Flag to planning
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-3.5">
        <div>
          <div className="label mb-2">Units by size (★ pivotal)</div>
          <SizeGrid sizes={sig.style.sizes} units={unitsBySize(storeId, sig.style.id)} core={sig.style.coreSizes} />
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat label="Warehouse" value={`${sig.dcUnits}`} />
          <MiniStat label="Cover" value={sig.cover >= 999 ? "—" : `${sig.cover.toFixed(0)}d`} />
          <MiniStat label="Window left" value={`${sig.daysLeftInWindow}d`} />
          <MiniStat label="At risk" value={inr(sig.valueAtRisk, { compact: true })} />
        </div>
      </div>
    </Modal>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line p-2.5">
      <div className="label">{label}</div>
      <div className="text-lg font-semibold text-ink num mt-1">{value}</div>
    </div>
  );
}
