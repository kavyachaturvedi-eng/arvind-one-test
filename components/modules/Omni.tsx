"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Online Orders — only what the floor needs: what's pending, what's dispatched,
// what's breaching. One status dropdown per order; cancelling always records
// a reason. Closed orders live in the past-orders table.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { NOW, STYLES, rng, storeById, styleById } from "@/lib/seed";
import { findDonors, sellable, skuRow } from "@/lib/engine";
import { classifyCancellation, type RootCause } from "@/lib/rules";
import { useApp } from "@/lib/state";
import {
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

/** Floor-friendly status names. */
const STATUS_META: Record<OmniStatus, { label: string; tone: "neutral" | "good" | "warn" | "serious" | "critical" | "brand" }> = {
  new: { label: "Open", tone: "brand" },
  locating: { label: "In progress", tone: "warn" },
  packed: { label: "Packed", tone: "brand" },
  handed_over: { label: "Handed to rider", tone: "good" },
  delivered: { label: "Dispatched", tone: "good" },
  cancelled: { label: "Cancelled", tone: "critical" },
  reassigned: { label: "Sent to another store", tone: "serious" },
  return_pending: { label: "Return to shelve", tone: "warn" },
  reconciled: { label: "Returned to stock", tone: "good" },
};

const CAUSE: Record<RootCause, string> = {
  phantom_stock: "Stock was wrong in the system",
  unfindable: "Could not find it in time",
  sla_breach: "Search time ran out",
  reserved_conflict: "Held by another order",
  damaged: "Found damaged",
  customer_cancelled: "Customer cancelled",
};

/** Deterministic rider per channel, no clock, no randomness. */
const RIDER: Record<OmniOrder["channel"], string> = {
  "Tommy.com": "Ekart, rider 4471",
  Myntra: "Delhivery, rider 2210",
  Amazon: "Amazon Logistics, rider 8802",
  Flipkart: "Ekart, rider 3319",
  AJIO: "Blue Dart, rider 5541",
};

const QUEUE_STATUSES: OmniStatus[] = ["new", "locating", "packed", "handed_over", "return_pending"];

const hashN = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const FIRST = ["Ananya", "Vikram", "Priya", "Rahul", "Sneha", "Arjun", "Divya", "Karan"];
const LAST = ["Mehta", "Iyer", "Kapoor", "Desai", "Nair", "Malhotra", "Reddy", "Bose"];

interface BopisOrder {
  id: string;
  phone: string;
  customer: string;
  item: string;
  size: string;
  qty: number;
  value: number;
  placedLabel: string;
  ready: boolean;
}

/** Website orders waiting for the customer to walk in and collect. */
function buildBopis(storeId: string): BopisOrder[] {
  const r = rng(hashN("bopis" + storeId));
  return Array.from({ length: 5 }, (_, i) => {
    const s = STYLES[Math.floor(r() * STYLES.length)];
    const qty = 1 + Math.floor(r() * 2);
    return {
      id: `WEB-${72100 + i * 7 + Math.floor(r() * 5)}`,
      phone: `98${String(10000000 + Math.floor(r() * 89999999)).slice(0, 8)}`,
      customer: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
      item: s.name,
      size: s.sizes[Math.floor(r() * s.sizes.length)],
      qty,
      value: s.mrp * qty,
      placedLabel: ["2 h ago", "Yesterday", "Yesterday", "2 days ago", "3 days ago"][i],
      ready: i !== 2,
    };
  });
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

  // Website orders the customer collects in person. Deterministic per store.
  const bopis = useMemo(() => buildBopis(app.storeId), [app.storeId]);
  const [pickedUp, setPickedUp] = useState<Record<string, string>>({});
  const [bopisQuery, setBopisQuery] = useState("");
  const bopisRows = useMemo(() => {
    const q = bopisQuery.trim().toLowerCase();
    if (!q) return bopis;
    return bopis.filter((b) => b.phone.includes(q) || b.id.toLowerCase().includes(q) || b.customer.toLowerCase().includes(q));
  }, [bopis, bopisQuery]);

  const [search, setSearch] = useState("");
  const queue = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...scope].filter((o) => QUEUE_STATUSES.includes(o.status)).sort((a, b) => b.placedAt - a.placedAt);
    if (!q) return list;
    return list.filter((o) => o.id.toLowerCase().includes(q) || styleById(o.styleId).name.toLowerCase().includes(q) || o.channel.toLowerCase().includes(q));
  }, [scope, search]);
  const past = useMemo(
    () => [...scope].filter((o) => !QUEUE_STATUSES.includes(o.status)).sort((a, b) => b.placedAt - a.placedAt),
    [scope]
  );

  const pending = scope.filter((o) => o.status === "new" || o.status === "locating" || o.status === "packed").length;
  const dispatched = scope.filter((o) => o.status === "handed_over" || o.status === "delivered").length;
  const breached = scope.filter(
    (o) => (o.status === "locating" && o.findMinutes > FIND_SLA_MINUTES) || (o.status === "cancelled" && o.findMinutes > FIND_SLA_MINUTES)
  ).length;

  const openOrder = (id: string | null) => scope.find((o) => o.id === id) ?? null;
  const cantFindOrder = openOrder(cantFind);
  const podOrder = openOrder(pod);

  // ── Actions ────────────────────────────────────────────────────────────────

  function act(o: OmniOrder, action: string) {
    switch (action) {
      case "start":
        app.dispatch({ type: "omni:update", id: o.id, patch: { status: "locating" }, label: "Picking started", actor: app.actorName });
        app.toastNow(`${o.id}, picking started, ${FIND_SLA_MINUTES} minutes on the clock`, "info");
        break;
      case "packed":
        app.dispatch({ type: "omni:update", id: o.id, patch: { status: "packed" }, label: "Located and packed", actor: app.actorName });
        app.toastNow(`${o.id} packed, found in ${o.findMinutes} min`, "good");
        break;
      case "cantfind":
        setCantFind(o.id);
        break;
      case "handover":
        setRider(RIDER[o.channel]);
        setSigCaptured(false);
        setPhotoCaptured(false);
        setPod(o.id);
        break;
      case "dispatched":
        app.dispatch({ type: "omni:update", id: o.id, patch: { status: "delivered" }, label: "Dispatched, channel notified", actor: app.actorName });
        app.toastNow(`${o.id} dispatched`, "good");
        break;
      case "scanback":
        app.dispatch({
          type: "omni:update",
          id: o.id,
          patch: { status: "reconciled" },
          label: "Returned unit scanned back, stock corrected",
          actor: app.actorName,
        });
        app.toastNow(`${o.id} returned to stock`, "good");
        break;
    }
  }

  function reassign(o: OmniOrder, toStoreId: string, toName: string) {
    app.dispatch({
      type: "omni:update",
      id: o.id,
      patch: { status: "reassigned", reassignedTo: toStoreId },
      label: `Sent to ${toName}, customer keeps the order`,
      actor: app.actorName,
    });
    app.toastNow(`${o.id} sent to ${toName}. The customer keeps the order.`, "good");
    setCantFind(null);
  }

  function cancel(o: OmniOrder, cause: RootCause) {
    app.dispatch({
      type: "omni:update",
      id: o.id,
      patch: { status: "cancelled", rootCause: cause },
      label: `Cancelled: ${CAUSE[cause]}`,
      actor: app.actorName,
    });
    app.toastNow(`${o.id} cancelled, reason recorded: ${CAUSE[cause]}`, "warn");
    setCantFind(null);
  }

  function confirmPod(o: OmniOrder) {
    app.dispatch({
      type: "omni:update",
      id: o.id,
      patch: { status: "handed_over", podSignedBy: rider, podAt: NOW },
      label: `Handed to rider, signature and parcel photo against ${rider}`,
      actor: app.actorName,
    });
    app.toastNow(`${o.id} handed to ${rider}`, "good");
    setPod(null);
  }

  /** Which actions a status allows, rendered as one dropdown. */
  function optionsFor(o: OmniOrder): { value: string; label: string }[] {
    switch (o.status) {
      case "new":
        return [{ value: "start", label: "Start picking" }];
      case "locating":
        return [
          { value: "packed", label: "Mark packed" },
          { value: "cantfind", label: "Can't find it" },
        ];
      case "packed":
        return [{ value: "handover", label: "Hand over to rider" }];
      case "handed_over":
        return [{ value: "dispatched", label: "Mark dispatched" }];
      case "return_pending":
        return [{ value: "scanback", label: "Scan back into stock" }];
      default:
        return [];
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-ink">Online Orders</h1>
        <Chip tone="neutral">{scopeLabel}</Chip>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Stat label="Pending" value={String(pending)} tone={pending ? "warn" : "good"} emphasis />
        <Stat label="Dispatched" value={String(dispatched)} tone="good" />
        <Stat label="SLA breached" value={String(breached)} tone={breached ? "critical" : "good"} />
      </div>

      {/* ── Pick-up orders: the customer is standing at the counter ──────── */}
      <Card>
        <SectionTitle
          title="Store pick-up (website orders)"
          right={<Chip tone={bopisRows.filter((b) => !pickedUp[b.id]).length ? "warn" : "good"}>{bopisRows.filter((b) => !pickedUp[b.id]).length} waiting</Chip>}
        />
        <div className="flex gap-2 max-w-xl mb-3">
          <span className="grid place-items-center w-11 border border-line bg-[color:var(--plane)] text-lg shrink-0" aria-hidden>⌸</span>
          <input
            data-bopis-search
            value={bopisQuery}
            onChange={(e) => setBopisQuery(e.target.value)}
            placeholder="Mobile number or order id"
            className="flex-1 rounded-lg border border-line bg-raised px-3 py-3 text-base text-ink placeholder:text-muted"
          />
        </div>
        {bopisRows.length === 0 ? (
          <Empty title="No pick-up order matches" />
        ) : (
          <Table>
            <thead>
              <tr><Th>Order</Th><Th>Customer</Th><Th>Item</Th><Th align="right">Value</Th><Th>Status</Th><Th align="right">Action</Th></tr>
            </thead>
            <tbody>
              {bopisRows.map((b) => (
                <tr key={b.id}>
                  <Td>
                    <div className="num text-sm font-semibold text-ink">{b.id}</div>
                    <div className="text-2xs text-muted">{b.placedLabel}</div>
                  </Td>
                  <Td>
                    <div className="text-sm text-ink">{b.customer}</div>
                    <div className="text-2xs text-muted num">{b.phone}</div>
                  </Td>
                  <Td className="text-xs text-ink2">{b.qty} × {b.item} ({b.size})</Td>
                  <Td align="right" className="num text-sm font-semibold text-ink">{inr(b.value)}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink">
                      <StatusDot tone={pickedUp[b.id] ? "good" : b.ready ? "warn" : "neutral"} />
                      {pickedUp[b.id] ? "Collected" : b.ready ? "Ready at the counter" : "Being packed"}
                    </span>
                  </Td>
                  <Td align="right">
                    {pickedUp[b.id] ? (
                      <span className="text-2xs text-muted">Done</span>
                    ) : b.ready ? (
                      <button
                        data-bopis-handover
                        className="btn-primary !py-1.5 !text-xs"
                        onClick={() => {
                          setPickedUp((p) => ({ ...p, [b.id]: "done" }));
                          app.dispatch({
                            type: "audit",
                            entry: { at: NOW, actor: app.actorName, action: `${b.id} handed to ${b.customer} at the counter`, object: b.id, system: "Arvind One" },
                          });
                          app.toastNow(`${b.id} handed over. Ask for the OTP on their phone if it is a prepaid order.`, "good");
                        }}
                      >
                        Hand to customer
                      </button>
                    ) : (
                      <span className="text-2xs text-muted">Not ready</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <SectionTitle title="Live order queue" right={<Chip tone="neutral">{queue.length} open</Chip>} />
        <div className="flex gap-2 max-w-xl mb-3">
          <input
            data-omni-search
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order id, item or channel"
            className="flex-1 rounded-lg border border-line bg-raised px-3 py-2.5 text-sm text-ink placeholder:text-muted"
          />
        </div>
        {queue.length === 0 ? (
          <Empty title="No open orders" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Item</Th>
                <Th align="right">Value</Th>
                <Th align="right">Age</Th>
                <Th>Status</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {queue.map((o) => {
                const style = styleById(o.styleId);
                const meta = STATUS_META[o.status];
                const opts = optionsFor(o);
                return (
                  <tr key={o.id}>
                    <Td>
                      <div className="text-sm font-medium text-ink num">{o.id}</div>
                      <div className="mt-1"><Chip tone="neutral">{o.channel}</Chip></div>
                      {app.role !== "store" && app.role !== "staff" && <div className="text-2xs text-muted mt-1">{storeById(o.storeId).name}</div>}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Swatch hex={style.colourHex} />
                        <div>
                          <div className="text-sm text-ink leading-tight">{style.name}</div>
                          <div className="text-2xs text-muted mt-0.5">Size {o.size} · {o.qty} unit{o.qty > 1 ? "s" : ""}</div>
                        </div>
                      </div>
                    </Td>
                    <Td align="right"><span className="num text-sm font-semibold text-ink">{inr(o.value)}</span></Td>
                    <Td align="right"><span className="num text-sm text-ink2">{relTime(o.placedAt, NOW)}</span></Td>
                    <Td>
                      <div className="flex items-center gap-1.5 mb-1">
                        <StatusDot tone={meta.tone === "brand" ? "neutral" : meta.tone} />
                        <span className="text-xs font-medium text-ink">{meta.label}</span>
                      </div>
                      {o.status === "locating" && (
                        <div className="max-w-[190px]">
                          <SlaBar
                            pctConsumed={o.findMinutes / FIND_SLA_MINUTES}
                            label={
                              o.findMinutes > FIND_SLA_MINUTES
                                ? `${o.findMinutes - FIND_SLA_MINUTES} min over the ${FIND_SLA_MINUTES}-min limit`
                                : `${o.findMinutes} of ${FIND_SLA_MINUTES} min used`
                            }
                          />
                        </div>
                      )}
                    </Td>
                    <Td align="right">
                      {opts.length === 0 ? (
                        <span className="text-2xs text-muted">Nothing to do</span>
                      ) : (
                        <select
                          data-omni-action
                          value=""
                          onChange={(e) => {
                            if (e.target.value) act(o, e.target.value);
                          }}
                          className="text-xs border border-line bg-raised px-2 py-2 text-ink max-w-[220px]"
                        >
                          <option value="" disabled>Choose action…</option>
                          {opts.map((op) => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                          ))}
                        </select>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <SectionTitle title="Past orders" right={<Chip>{past.length}</Chip>} />
        {past.length === 0 ? (
          <Empty title="Nothing closed yet today" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Item</Th>
                <Th align="right">Value</Th>
                <Th>Status</Th>
                <Th>Note</Th>
                <Th align="right">When</Th>
              </tr>
            </thead>
            <tbody>
              {past.map((o) => {
                const style = styleById(o.styleId);
                const meta = STATUS_META[o.status];
                const note =
                  o.status === "cancelled"
                    ? CAUSE[o.rootCause ?? "unfindable"]
                    : o.status === "reassigned"
                    ? `Now with ${o.reassignedTo ? storeById(o.reassignedTo).name : "another store"}`
                    : o.podSignedBy
                    ? `POD: ${o.podSignedBy}`
                    : "—";
                return (
                  <tr key={o.id}>
                    <Td>
                      <div className="text-sm font-medium text-ink num">{o.id}</div>
                      <div className="text-2xs text-muted mt-0.5">{o.channel}</div>
                    </Td>
                    <Td className="text-xs text-ink2">{style.name} · {o.size}</Td>
                    <Td align="right" className="num text-xs">{inr(o.value)}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5 text-xs text-ink">
                        <StatusDot tone={meta.tone === "brand" ? "neutral" : meta.tone} />
                        {meta.label}
                      </span>
                    </Td>
                    <Td className="text-xs text-ink2">{note}</Td>
                    <Td align="right" className="num text-xs text-ink2">{relTime(o.placedAt, NOW)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {cantFindOrder && (
        <CantFindModal order={cantFindOrder} onClose={() => setCantFind(null)} onReassign={reassign} onCancel={cancel} />
      )}

      {podOrder && (
        <Modal
          open
          onClose={() => setPod(null)}
          title={`Hand over to rider. ${podOrder.id}`}
          footer={
            <>
              <button className="btn" onClick={() => setPod(null)}>Cancel</button>
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
            </label>
            <label className="flex items-start gap-2.5 rounded-lg border border-line p-3 cursor-pointer">
              <input type="checkbox" checked={sigCaptured} onChange={(e) => setSigCaptured(e.target.checked)} className="mt-0.5" />
              <span className="text-xs text-ink2 leading-relaxed"><strong className="text-ink">Rider signed</strong> in the app.</span>
            </label>
            <label className="flex items-start gap-2.5 rounded-lg border border-line p-3 cursor-pointer">
              <input type="checkbox" checked={photoCaptured} onChange={(e) => setPhotoCaptured(e.target.checked)} className="mt-0.5" />
              <span className="text-xs text-ink2 leading-relaxed"><strong className="text-ink">Parcel photo taken</strong>, sealed carton, label visible.</span>
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── "Can't find it" — cancel always carries a reason; re-route first ─────────

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
  const [cause, setCause] = useState<RootCause>(result.cause);

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Can't find it. ${order.id}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>Keep searching</button>
          <button className="btn" onClick={() => onCancel(order, cause)} disabled={!!best}>
            Cancel with this reason
          </button>
          <button className="btn-primary" disabled={!best} onClick={() => best && onReassign(order, best.store.id, best.store.name)}>
            {best ? `Send to ${best.store.name}` : "No other store has it"}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        {best ? (
          <Callout tone="brand" title="Another store has it, the customer keeps the order">
            {best.store.name} holds {best.sellable} sellable units {best.distanceKm.toFixed(0)} km away. Cancelling stays
            disabled while a real alternative exists.
          </Callout>
        ) : (
          <>
            <Callout tone="critical" title="No other store has this unit">
              Cancelling is the only option. Pick the reason, it is recorded on the order.
            </Callout>
            <div>
              <div className="label mb-1.5">Reason for cancelling</div>
              <select
                value={cause}
                onChange={(e) => setCause(e.target.value as RootCause)}
                className="w-full border border-line bg-raised px-3 py-2.5 text-sm text-ink"
              >
                {(Object.keys(CAUSE) as RootCause[]).map((c) => (
                  <option key={c} value={c}>{CAUSE[c]}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {donors.length > 0 && (
          <div>
            <div className="label mb-2">Stores that have it</div>
            <div className="space-y-2">
              {donors.slice(0, 4).map((d, i) => (
                <div key={d.store.id} className="flex items-center gap-3 flex-wrap rounded-lg border border-line p-2.5">
                  <div className="min-w-[170px]">
                    <div className="text-sm text-ink">{d.store.name}</div>
                    <div className="text-2xs text-muted mt-0.5">{d.store.city}</div>
                  </div>
                  <span className="text-xs text-ink2 num">{d.sellable} sellable</span>
                  <span className="text-xs text-ink2 num">{d.distanceKm.toFixed(0)} km away</span>
                  <span className="ml-auto"><Chip tone={i === 0 ? "good" : "neutral"}>{i === 0 ? "Best option" : "Backup"}</Chip></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
