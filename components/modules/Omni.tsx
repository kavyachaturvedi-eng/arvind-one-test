"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Omni Orders — fulfilment from the store floor, with a cancellation
// root-cause ledger.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { DAY, NOW, STORES, storeById, styleById } from "@/lib/seed";
import { findDonors, sellable, skuRow } from "@/lib/engine";
import { classifyCancellation, type RootCause } from "@/lib/rules";
import { useApp } from "@/lib/state";
import {
  BarChart,
  BeforeAfter,
  Callout,
  Card,
  Chip,
  Empty,
  Modal,
  SectionTitle,
  SlaBar,
  Stat,
  StatusDot,
  Swatch,
  Table,
  Td,
  Th,
  inr,
  relTime,
} from "@/components/ui";
import type { OmniOrder, OmniStatus } from "@/lib/types";

const FIND_SLA_MINUTES = 10;

const STATUS_META: Record<OmniStatus, { label: string; tone: "neutral" | "good" | "warn" | "serious" | "critical" | "brand" }> = {
  new: { label: "New", tone: "brand" },
  locating: { label: "Locating", tone: "warn" },
  packed: { label: "Packed", tone: "brand" },
  handed_over: { label: "Handed over", tone: "good" },
  delivered: { label: "Delivered", tone: "good" },
  cancelled: { label: "Cancelled", tone: "critical" },
  reassigned: { label: "Reassigned", tone: "serious" },
  return_pending: { label: "Return pending", tone: "warn" },
  reconciled: { label: "Reconciled", tone: "good" },
};

const CAUSE_ORDER: RootCause[] = [
  "phantom_stock",
  "unfindable",
  "sla_breach",
  "reserved_conflict",
  "damaged",
  "customer_cancelled",
];

/** Label, series colour (fixed order, never cycled) and the one-line insight per cause. */
const CAUSE: Record<RootCause, { label: string; colour: string; insight: string }> = {
  phantom_stock: {
    label: "Phantom stock",
    colour: "var(--series-1)",
    insight:
      "This SKU also disagreed on the last 3 counts; it is now on the store's accuracy watch-list and gets a targeted bay count, not a full stock take.",
  },
  unfindable: {
    label: "Unfindable in time",
    colour: "var(--series-2)",
    insight: "The stock file was right but the location was not. Bay capture at inward pins the pick location.",
  },
  sla_breach: {
    label: "Search SLA breach",
    colour: "var(--series-3)",
    insight: "Each had a saleable unit at another node inside the radius, so the order should be reassigned rather than cancelled.",
  },
  reserved_conflict: {
    label: "Double reservation",
    colour: "var(--series-4)",
    insight: "Two orders held the same physical unit. Reservation now sits at unit level, so the second order re-routes instead of failing at the shelf.",
  },
  damaged: {
    label: "Damaged unit",
    colour: "var(--series-5)",
    insight: "Found but unsaleable. The write-off is posted at the moment of discovery so the next order never routes to this unit again.",
  },
  customer_cancelled: {
    label: "Customer cancelled",
    colour: "var(--series-6)",
    insight: "No inventory fault. The store carries no accuracy penalty, and the unit re-enters sellable stock only when it is scanned back in.",
  },
};

/** Deterministic rider per channel — no clock, no randomness. */
const RIDER: Record<OmniOrder["channel"], string> = {
  "Tommy.com": "Ekart — Rider 4471",
  Myntra: "Delhivery — Rider 2210",
  Amazon: "Amazon Logistics — Rider 8802",
  Flipkart: "Ekart — Rider 3319",
  AJIO: "Blue Dart — Rider 5541",
};

/** Re-derive the corrective action for a cause by feeding the rule inputs that produce it. */
function correctiveFor(cause: RootCause, findMinutes: number) {
  const base = {
    systemStock: 0,
    physicallyFound: false,
    findMinutes: Math.min(findMinutes, FIND_SLA_MINUTES - 1),
    findSlaMinutes: FIND_SLA_MINUTES,
    damaged: false,
    reservedElsewhere: false,
    customerInitiated: false,
  };
  switch (cause) {
    case "phantom_stock":
      return classifyCancellation({ ...base, systemStock: Math.max(1, findMinutes > 0 ? 2 : 1) });
    case "sla_breach":
      return classifyCancellation({ ...base, findMinutes: Math.max(FIND_SLA_MINUTES + 1, findMinutes) });
    case "damaged":
      return classifyCancellation({ ...base, damaged: true });
    case "reserved_conflict":
      return classifyCancellation({ ...base, reservedElsewhere: true });
    case "customer_cancelled":
      return classifyCancellation({ ...base, customerInitiated: true });
    default:
      return classifyCancellation(base);
  }
}

function causeOf(o: OmniOrder): RootCause {
  if (o.rootCause) return o.rootCause;
  return o.findMinutes > FIND_SLA_MINUTES ? "sla_breach" : "unfindable";
}

export default function Omni() {
  const app = useApp();
  const [cantFind, setCantFind] = useState<string | null>(null);
  const [pod, setPod] = useState<string | null>(null);
  const [rider, setRider] = useState("");
  const [sigCaptured, setSigCaptured] = useState(false);
  const [photoCaptured, setPhotoCaptured] = useState(false);

  const scope = useMemo(() => {
    if (app.role === "store" || app.role === "staff") return app.omni.filter((o) => o.storeId === app.storeId);
    return app.omni;
  }, [app.omni, app.role, app.storeId]);

  const scopeLabel = app.role === "store" || app.role === "staff" ? storeById(app.storeId).name : "All stores";

  const queue = useMemo(
    () => [...scope].filter((o) => o.status !== "cancelled" && o.status !== "reassigned").sort((a, b) => b.placedAt - a.placedAt),
    [scope]
  );
  const ledgerOrders = useMemo(() => scope.filter((o) => o.status === "cancelled" || o.status === "reassigned"), [scope]);

  const ordersToday = scope.filter((o) => o.placedAt >= NOW - DAY).length;
  const locatedStatuses: OmniStatus[] = ["packed", "handed_over", "delivered", "return_pending", "reconciled"];
  const locatedInSla = scope
    .filter((o) => locatedStatuses.includes(o.status) && o.findMinutes <= FIND_SLA_MINUTES)
    .reduce((a, o) => a + o.qty, 0);
  const routedUnits = scope.reduce((a, o) => a + o.qty, 0);
  const cancelledWeek = scope.filter((o) => o.status === "cancelled" && o.placedAt >= NOW - 7 * DAY);
  const leaked = cancelledWeek.reduce((a, o) => a + o.value, 0);
  const finds = scope.filter((o) => o.findMinutes > 0);
  const avgFind = finds.length ? finds.reduce((a, o) => a + o.findMinutes, 0) / finds.length : 0;

  const openOrder = (id: string | null) => scope.find((o) => o.id === id) ?? null;
  const cantFindOrder = openOrder(cantFind);
  const podOrder = openOrder(pod);

  // ── Actions ────────────────────────────────────────────────────────────────

  function markPacked(o: OmniOrder) {
    app.dispatch({
      type: "omni:update",
      id: o.id,
      patch: { status: "packed" },
      label: "Located and packed; mis-pick check passed",
      actor: app.actorName,
    });
    app.toastNow(`${o.id} located in ${o.findMinutes} min and packed — inside the ${FIND_SLA_MINUTES}-minute service level.`, "good");
  }

  function reassign(o: OmniOrder, toStoreId: string, toName: string) {
    app.dispatch({
      type: "omni:update",
      id: o.id,
      patch: { status: "reassigned", reassignedTo: toStoreId },
      label: `Not located within the ${FIND_SLA_MINUTES}-minute service level — auto-reassigned to ${toName} instead of cancelling on the customer`,
      actor: app.actorName,
    });
    app.toastNow(`${o.id} reassigned to ${toName}. The customer keeps the order; only the fulfilling node changed.`, "good");
    setCantFind(null);
  }

  function cancel(o: OmniOrder, cause: RootCause) {
    const c = correctiveFor(cause, o.findMinutes);
    app.dispatch({
      type: "omni:update",
      id: o.id,
      patch: { status: "cancelled", rootCause: cause },
      label: `Cancelled — root cause ${CAUSE[cause].label}. ${c.correctiveAction}`,
      actor: app.actorName,
    });
    app.toastNow(`${o.id} cancelled with root cause "${CAUSE[cause].label}" recorded, and the corrective action raised.`, "warn");
    setCantFind(null);
  }

  function confirmPod(o: OmniOrder) {
    app.dispatch({
      type: "omni:update",
      id: o.id,
      patch: { status: "handed_over", podSignedBy: rider, podAt: NOW },
      label: `Digital POD captured at handover — signature and parcel photo against ${rider}`,
      actor: app.actorName,
    });
    app.toastNow(`${o.id} handed over to ${rider} with a digital POD. The return leg is now tracked against it.`, "good");
    setPod(null);
  }

  function scanBack(o: OmniOrder) {
    app.dispatch({
      type: "omni:update",
      id: o.id,
      patch: { status: "reconciled" },
      label: "Returned unit scanned back in — sellable stock incremented against the original POD",
      actor: app.actorName,
    });
    app.toastNow(`${o.id} reconciled. The unit re-enters sellable stock only now, on scan-in, against POD ${o.podSignedBy ?? "on file"}.`, "good");
  }

  function openPod(o: OmniOrder) {
    setRider(RIDER[o.channel]);
    setSigCaptured(false);
    setPhotoCaptured(false);
    setPod(o.id);
  }

  // ── Ledger ────────────────────────────────────────────────────────────────

  const ledger = useMemo(() => {
    const groups = new Map<RootCause, { count: number; value: number; findMinutes: number }>();
    for (const o of ledgerOrders) {
      const c = causeOf(o);
      const g = groups.get(c) ?? { count: 0, value: 0, findMinutes: 0 };
      groups.set(c, { count: g.count + 1, value: g.value + o.value, findMinutes: Math.max(g.findMinutes, o.findMinutes) });
    }
    return CAUSE_ORDER.filter((c) => groups.has(c)).map((c) => ({ cause: c, ...groups.get(c)! }));
  }, [ledgerOrders]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Omni Orders</h1>
          <p className="text-sm text-ink2 mt-1 max-w-2xl">
            Online orders fulfilled from this floor, with a find timer, a digital proof of delivery at handover and a
            root-cause ledger for every cancellation.
          </p>
        </div>
        <Chip tone="neutral">{scopeLabel}</Chip>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Stat label="Orders today" value={String(ordersToday)} sub={`${scope.length} live in this scope`} freshness={2} />
        <Stat
          label="Units located in SLA"
          value={`${locatedInSla}/${routedUnits}`}
          tone={locatedInSla / Math.max(1, routedUnits) < 0.7 ? "warn" : "good"}
          sub={`found inside ${FIND_SLA_MINUTES} minutes`}
        />
        <Stat label="Cancellations this week" value={String(cancelledWeek.length)} tone={cancelledWeek.length ? "critical" : "good"} sub="each one with a recorded cause" />
        <Stat label="Value leaked" value={inr(leaked, { compact: true })} tone="critical" sub="cancelled after routing to a store" />
        <Stat label="Average find time" value={`${avgFind.toFixed(1)} min`} tone={avgFind > FIND_SLA_MINUTES ? "critical" : "good"} sub={`against a ${FIND_SLA_MINUTES}-minute service level`} />
      </div>

      <Card>
        <SectionTitle
          title="Live order queue"
          sub="Every order routed to the floor, oldest risk first. When the 10-minute find timer runs out, the order is reassigned to another store."
          right={<Chip tone="neutral">{queue.length} open</Chip>}
        />
        {queue.length === 0 ? (
          <Empty title="No open omni orders in this scope" body="Nothing is waiting on the floor. Cancelled and reassigned orders stay in the ledger below." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Style / size</Th>
                <Th align="right">Value</Th>
                <Th align="right">Age</Th>
                <Th>Status / find timer</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {queue.map((o) => {
                const style = styleById(o.styleId);
                const meta = STATUS_META[o.status];
                return (
                  <tr key={o.id}>
                    <Td>
                      <div className="text-sm font-medium text-ink num">{o.id}</div>
                      <div className="mt-1">
                        <Chip tone="neutral">{o.channel}</Chip>
                      </div>
                      {app.role !== "store" && app.role !== "staff" && <div className="text-2xs text-muted mt-1">{storeById(o.storeId).name}</div>}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Swatch hex={style.colourHex} />
                        <div>
                          <div className="text-sm text-ink leading-tight">{style.name}</div>
                          <div className="text-2xs text-muted mt-0.5">
                            Size {o.size} · {o.qty} unit{o.qty > 1 ? "s" : ""} · {style.brand}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td align="right">
                      <span className="num text-sm font-semibold text-ink">{inr(o.value)}</span>
                    </Td>
                    <Td align="right">
                      <span className="num text-sm text-ink2">{relTime(o.placedAt, NOW)}</span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5 mb-1">
                        <StatusDot tone={meta.tone === "brand" ? "neutral" : meta.tone} />
                        <span className="text-xs font-medium text-ink">{meta.label}</span>
                      </div>
                      {o.status === "locating" ? (
                        <div className="max-w-[190px]">
                          <SlaBar
                            pctConsumed={o.findMinutes / FIND_SLA_MINUTES}
                            label={
                              o.findMinutes > FIND_SLA_MINUTES
                                ? `${o.findMinutes} min — ${o.findMinutes - FIND_SLA_MINUTES} min over the ${FIND_SLA_MINUTES}-min SLA`
                                : `${o.findMinutes} of ${FIND_SLA_MINUTES} min used`
                            }
                          />
                        </div>
                      ) : (
                        <div className="text-2xs text-muted">
                          {o.podSignedBy ? `POD: ${o.podSignedBy}` : `Located in ${o.findMinutes} min`}
                        </div>
                      )}
                    </Td>
                    <Td align="right">
                      <div className="flex items-center gap-2 justify-end flex-wrap">
                        {o.status === "locating" && (
                          <>
                            <button className="btn-primary" onClick={() => markPacked(o)}>
                              Found it — pack
                            </button>
                            <button className="btn" onClick={() => setCantFind(o.id)}>
                              Can&apos;t find it
                            </button>
                          </>
                        )}
                        {o.status === "packed" && (
                          <button className="btn-primary" onClick={() => openPod(o)}>
                            Hand over to rider
                          </button>
                        )}
                        {o.status === "return_pending" && (
                          <button className="btn-primary" onClick={() => scanBack(o)}>
                            Scan unit back into stock
                          </button>
                        )}
                        {(o.status === "handed_over" || o.status === "delivered" || o.status === "reconciled") && (
                          <span className="text-2xs text-muted">Closed — nothing to do</span>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {cantFindOrder && (
        <CantFindModal
          order={cantFindOrder}
          onClose={() => setCantFind(null)}
          onReassign={reassign}
          onCancel={cancel}
        />
      )}

      {podOrder && (
        <Modal
          open
          onClose={() => setPod(null)}
          title={`Digital proof of delivery — ${podOrder.id}`}
          sub="Capture the rider signature and a parcel photo at handover. Both are required."
          footer={
            <>
              <button className="btn" onClick={() => setPod(null)}>
                Cancel
              </button>
              <button className="btn-primary" disabled={!sigCaptured || !photoCaptured || rider.trim() === ""} onClick={() => confirmPod(podOrder)}>
                Confirm handover
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <label className="block">
              <div className="label mb-1">Rider / carrier</div>
              <input
                value={rider}
                onChange={(e) => setRider(e.target.value)}
                className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink"
                placeholder="Rider name and ID"
              />
              <div className="text-2xs text-muted mt-1">Pre-filled from the carrier assigned by the channel. Editable if a different rider turns up.</div>
            </label>

            <label className="flex items-start gap-2.5 rounded-lg border border-line p-3 cursor-pointer">
              <input type="checkbox" checked={sigCaptured} onChange={(e) => setSigCaptured(e.target.checked)} className="mt-0.5" />
              <span className="text-xs text-ink2 leading-relaxed">
                <strong className="text-ink">Signature captured</strong> — rider signs in the app. This is the timestamp the
                return leg is measured against.
              </span>
            </label>

            <label className="flex items-start gap-2.5 rounded-lg border border-line p-3 cursor-pointer">
              <input type="checkbox" checked={photoCaptured} onChange={(e) => setPhotoCaptured(e.target.checked)} className="mt-0.5" />
              <span className="text-xs text-ink2 leading-relaxed">
                <strong className="text-ink">Photo of the parcel</strong> — sealed carton with the order label visible, so a
                shortage claim has evidence attached.
              </span>
            </label>

            {(!sigCaptured || !photoCaptured) && (
              <Callout tone="warn" title="Confirm is disabled until both proofs exist">
                Capture both the rider signature and a parcel photo to enable handover.
              </Callout>
            )}
          </div>
        </Modal>
      )}

      <Card>
        <SectionTitle
          title="Cancellation root-cause ledger"
          sub="Every cancellation carries a cause, a corrective action, and an owner."
        />
        {ledger.length === 0 ? (
          <Empty title="No cancellations or reassignments in this scope" body="When one happens it lands here with its root cause." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Root cause</Th>
                  <Th align="right">Orders</Th>
                  <Th align="right">Value</Th>
                  <Th>Corrective action (from the rule engine)</Th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((g) => {
                  const c = correctiveFor(g.cause, g.findMinutes);
                  return (
                    <tr key={g.cause}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CAUSE[g.cause].colour }} />
                          <span className="text-sm font-medium text-ink">{CAUSE[g.cause].label}</span>
                        </div>
                        <div className="text-2xs text-muted mt-1 max-w-md leading-snug">{c.narrative}</div>
                      </Td>
                      <Td align="right">
                        <span className="num text-sm font-semibold text-ink">{g.count}</span>
                      </Td>
                      <Td align="right">
                        <span className="num text-sm text-ink">{inr(g.value, { compact: true })}</span>
                      </Td>
                      <Td>
                        <div className="text-xs text-ink2 leading-relaxed">{c.correctiveAction}</div>
                        <div className="text-2xs text-muted mt-1.5 leading-snug">
                          <strong>Insight:</strong> {CAUSE[g.cause].insight}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>

            <div className="mt-4">
              <div className="label mb-2">Cancellations and reassignments by cause — orders</div>
              <BarChart
                data={ledger.map((g) => ({ label: CAUSE[g.cause].label, value: g.count, tone: CAUSE[g.cause].colour }))}
                format={(n) => `${n.toFixed(0)}`}
              />
            </div>
          </>
        )}
      </Card>

    </div>
  );
}

// ── "Can't find it" — classify, then re-route before cancelling ──────────────

function CantFindModal({
  order,
  onClose,
  onReassign,
  onCancel,
}: {
  order: OmniOrder;
  onClose: () => void;
  onReassign: (o: OmniOrder, toStoreId: string, toName: string) => void;
  onCancel: (o: OmniOrder, cause: RootCause) => void;
}) {
  const style = styleById(order.styleId);
  const row = skuRow(order.storeId, order.styleId, order.size);
  const systemStock = row ? sellable(row) : 0;

  const result = classifyCancellation({
    systemStock,
    physicallyFound: false,
    findMinutes: order.findMinutes,
    findSlaMinutes: FIND_SLA_MINUTES,
    damaged: false,
    reservedElsewhere: false,
    customerInitiated: false,
  });

  const donors = findDonors(order.storeId, order.styleId, order.size, order.qty).filter((d) => d.saleable);
  const best = donors[0];

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Unit not located — ${order.id}`}
      sub={`${style.name} · size ${order.size} · ${inr(order.value)} · searched ${order.findMinutes} min against a ${FIND_SLA_MINUTES}-minute service level`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Keep searching
          </button>
          <button className="btn" onClick={() => onCancel(order, result.cause)} disabled={!!best}>
            Cancel with root cause
          </button>
          <button
            className="btn-primary"
            disabled={!best}
            onClick={() => best && onReassign(order, best.store.id, best.store.name)}
          >
            {best ? `Reassign to ${best.store.name}` : "No alternative node"}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Callout tone="critical" title={`Root cause: ${CAUSE[result.cause].label}`}>
          {result.narrative}
          <div className="mt-1.5">
            <strong>Corrective action:</strong> {result.correctiveAction}
          </div>
          <div className="mt-1.5 text-2xs text-muted">
            System showed {systemStock} sellable at this store when the order routed here. The cause is written to the
            order and to the store&apos;s accuracy record.
          </div>
        </Callout>

        <div>
          <div className="label mb-2">Alternative nodes inside the network</div>
          {donors.length === 0 ? (
            <Empty
              title="No saleable unit anywhere else in the network"
              body="Every other store shows zero sellable, or its units are flagged defective. This is the only case where cancelling is the correct answer — and it is recorded with a cause so the buy is corrected."
            />
          ) : (
            <div className="space-y-2">
              {donors.slice(0, 4).map((d, i) => (
                <div key={d.store.id} className="flex items-center gap-3 flex-wrap rounded-lg border border-line p-2.5">
                  <div className="min-w-[170px]">
                    <div className="text-sm text-ink">{d.store.name}</div>
                    <div className="text-2xs text-muted mt-0.5">
                      {d.store.city} · {d.store.format}
                    </div>
                  </div>
                  <span className="text-xs text-ink2 num">{d.sellable} sellable</span>
                  <span className="text-xs text-ink2 num">{d.distanceKm.toFixed(0)} km away</span>
                  <span className="text-xs text-ink2 num">their ROS {d.ros.toFixed(2)}/day</span>
                  <span className="ml-auto">
                    <Chip tone={i === 0 ? "good" : "neutral"}>{i === 0 ? "Best node" : "Fallback"}</Chip>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <Callout tone={best ? "brand" : "warn"} title={best ? "Cancelling is the last resort, not the default" : "Cancellation is genuinely the only option here"}>
          {best
            ? `The customer keeps the order — only the fulfilling node changes. ${best.store.name} holds ${best.sellable} saleable units ${best.distanceKm.toFixed(0)} km away, so the cancel button stays disabled while a real alternative exists.`
            : "There is no saleable unit at any other node, so the order cannot be re-routed. The cancellation is recorded against its root cause and the corrective action is raised automatically."}
        </Callout>
      </div>
    </Modal>
  );
}
