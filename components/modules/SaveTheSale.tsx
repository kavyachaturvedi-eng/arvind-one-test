"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Save the Sale — inter-store transfer raised at the till, checked by a policy
// engine, posted straight to the inventory ledger.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { NOW, STYLES, storeById, styleById } from "@/lib/seed";
import { evaluateIstPolicy, type IstPolicyInput } from "@/lib/rules";
import { findDonors, sellable, skuRow, stockForStyleAtStore, styleTrueRos } from "@/lib/engine";
import { useApp } from "@/lib/state";
import {
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
  Td,
  Th,
  Timeline,
  fmtTime,
  inr,
  pct,
} from "@/components/ui";
import type { ISTRequest, Size } from "@/lib/types";

/** Store's own auto-approval ceiling. Deliberately small — this is a save-the-sale lane, not a rebalance. */
const AUTO_APPROVE_MAX_QTY = 3;
/** Local hour at the demo clock — 11:42 IST, so the 11:00 cut-off has just passed. */
const HOUR_OF_DAY = 11;

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const RIDERS = ["Imran S.", "Vikas P.", "Sagar M.", "Farhan A."];

/** Rider ETA in minutes: 35 for pick/pack + city travel at ~22 km/h. */
const riderEtaMin = (km: number) => 35 + Math.round((km / 22) * 60);
const fmtEta = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} m` : `${min} m`);

interface RiderDispatch {
  taskId: string;
  rider: string;
  distanceKm: number;
  fromName: string;
  pickupBy: number;
  arriveBy: number;
}

function buildDispatch(reqId: string, fromName: string, distanceKm: number): RiderDispatch {
  const eta = riderEtaMin(distanceKm);
  return {
    taskId: `RD-${1200 + (hash(reqId) % 800)}`,
    rider: RIDERS[hash(reqId) % RIDERS.length],
    distanceKm,
    fromName,
    pickupBy: 35,
    arriveBy: eta,
  };
}

export default function SaveTheSale() {
  const app = useApp();
  const [styleId, setStyleId] = useState<string>("");
  const [size, setSize] = useState<Size | "">("");
  const [qty, setQty] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [donorId, setDonorId] = useState<string>("");
  const [confirm, setConfirm] = useState(false);
  const [created, setCreated] = useState<ISTRequest | null>(null);
  const [rider, setRider] = useState<RiderDispatch | null>(null);
  const [waNotified, setWaNotified] = useState(false);
  const [query, setQuery] = useState("");

  const store = storeById(app.storeId);

  // Styles this store actually carries, filtered by the search box.
  const options = useMemo(() => {
    const carried = STYLES.filter((s) => stockForStyleAtStore(app.storeId, s.id).length > 0);
    if (!query.trim()) return carried.slice(0, 40);
    const q = query.toLowerCase();
    return carried.filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
  }, [app.storeId, query]);

  const style = styleId ? styleById(styleId) : null;

  const units: Record<string, number> = useMemo(() => {
    if (!style) return {};
    const out: Record<string, number> = {};
    for (const r of stockForStyleAtStore(app.storeId, style.id)) out[r.size] = sellable(r);
    return out;
  }, [app.storeId, style]);

  const donors = useMemo(() => {
    if (!style || !size) return [];
    return findDonors(app.storeId, style.id, size as Size, qty);
  }, [app.storeId, style, size, qty]);

  const donor = donors.find((d) => d.store.id === donorId) ?? donors[0] ?? null;

  const policyInput: IstPolicyInput | null = useMemo(() => {
    if (!style || !size || !donor) return null;
    const myRow = skuRow(app.storeId, style.id, size as Size);
    const duplicate = app.ist.some(
      (r) =>
        r.styleId === style.id &&
        r.size === size &&
        r.fromStoreId === donor.store.id &&
        r.toStoreId === app.storeId &&
        ["pending_approval", "approved", "picking", "in_transit"].includes(r.status)
    );
    return {
      qty,
      donorSellable: donor.sellable,
      donorFillRate: donor.fillRate,
      donorRos: donor.ros,
      requesterRos: myRow ? styleTrueRos(app.storeId, style.id) / Math.max(1, style.sizes.length) : 0.2,
      distanceKm: donor.distanceKm,
      donorSaleable: donor.saleable,
      hourOfDay: HOUR_OF_DAY,
      customerWaiting: true,
      autoApproveMaxQty: AUTO_APPROVE_MAX_QTY,
      duplicateOpen: duplicate,
    };
  }, [app.ist, app.storeId, donor, qty, size, style]);

  const policy = policyInput ? evaluateIstPolicy(policyInput) : null;

  function reset() {
    setStyleId("");
    setSize("");
    setQty(1);
    setDonorId("");
    setCustomerName("");
    setCustomerPhone("");
    setConfirm(false);
    setRider(null);
    setWaNotified(false);
  }

  function submit() {
    if (!style || !size || !donor || !policyInput) return;
    const req = app.createIst({
      styleId: style.id,
      size: size as Size,
      qty,
      fromStoreId: donor.store.id,
      toStoreId: app.storeId,
      reason: "customer_waiting",
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      raisedBy: app.actorName,
      policy: policyInput,
    });
    setCreated(req);
    // Inside the 40 km same-day lane, an approved transfer dispatches a rider
    // on its own — pickup task, ETA, customer message, no phone calls.
    setRider(donor.distanceKm <= 40 && donor.saleable ? buildDispatch(req.id, donor.store.name, donor.distanceKm) : null);
    setWaNotified(false);
    setConfirm(false);
    app.toastNow(
      req.status === "approved"
        ? `${req.id} approved — pick task created at ${donor.store.name}`
        : req.status === "pending_approval"
        ? `${req.id} sent for planner approval`
        : `${req.id} blocked by policy — see the trail`,
      req.status === "approved" ? "good" : req.status === "pending_approval" ? "info" : "warn"
    );
  }

  const openRequests = app.ist.length;
  const autoApproved = app.ist.filter((r) => r.status === "approved").length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Save the Sale</h1>
          <p className="text-sm text-ink2 mt-1 max-w-2xl">Bring a size in from another store for a customer at the till.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat label="Raised today" value={String(openRequests)} sub={`${autoApproved} auto-approved inside policy`} />
        <Stat label="Auto-approval ceiling" value={`${AUTO_APPROVE_MAX_QTY} units`} sub="Above this, planner approval is needed" />
        <Stat label="Same-day lane" value="40 km" sub="Inside the radius, pickup is raised automatically" />
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* ── Left: the flow ────────────────────────────────────────────── */}
        <Card className="lg:col-span-3">
          <SectionTitle title="1 · Style" sub={`Styles carried at ${store.name}.`} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, category or style code — try “polo”"
            className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-muted"
          />
          <div className="mt-2.5 max-h-[168px] overflow-y-auto space-y-1 pr-1">
            {options.map((s) => {
              const rows = stockForStyleAtStore(app.storeId, s.id);
              const total = rows.reduce((a, r) => a + sellable(r), 0);
              const active = styleId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setStyleId(s.id);
                    setSize("");
                    setDonorId("");
                    setCreated(null);
                  }}
                  className={`w-full text-left rounded-lg border px-2.5 py-2 flex items-center gap-2.5 transition-colors ${
                    active ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-line hover:bg-[color:var(--plane)]"
                  }`}
                >
                  <Swatch hex={s.colourHex} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink truncate">{s.name}</div>
                    <div className="text-2xs text-muted">
                      {s.brand} · {s.category} · {s.id} · MRP {inr(s.mrp)}
                    </div>
                  </div>
                  <div className="text-xs num text-ink2 shrink-0">{total} here</div>
                </button>
              );
            })}
            {options.length === 0 && <Empty title="No carried style matches that search" body="Try a category like “denim” or clear the box." />}
          </div>

          {style && (
            <>
              <div className="mt-5 pt-4 border-t border-line">
                <SectionTitle title="2 · Size" sub="Sellable units on the floor right now. ★ marks a core size." />
                <SizeGrid
                  sizes={style.sizes}
                  units={units}
                  core={style.coreSizes}
                  selected={size || undefined}
                  onPick={(s) => {
                    setSize(s as Size);
                    setDonorId("");
                    setCreated(null);
                  }}
                />
                {size && (units[size] ?? 0) > 0 && (
                  <Callout tone="good" title={`${units[size]} of size ${size} in stock here`}>
                    No transfer needed.
                  </Callout>
                )}
              </div>

              {size && (units[size] ?? 0) === 0 && (
                <div className="mt-5 pt-4 border-t border-line">
                  <SectionTitle
                    title="3 · Source store"
                    sub="Ranked by proximity, surplus above a week's cover, and relative demand."
                    right={
                      <div className="flex items-center gap-2">
                        <span className="label">Qty</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={qty}
                          onChange={(e) => setQty(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                          className="w-16 rounded-md border border-line bg-raised px-2 py-1 text-sm num"
                        />
                      </div>
                    }
                  />
                  {donors.length === 0 ? (
                    <Callout tone="critical" title="Nothing in the network has this size">
                      No store holds size {size} in sellable condition. Offer the online channel; the SKU is added to the
                      planner&apos;s exception list.
                    </Callout>
                  ) : (
                    <div className="space-y-2">
                      <DistanceLane
                        donors={donors.slice(0, 5)}
                        activeId={donorId || donors[0].store.id}
                        onPick={(id) => {
                          setDonorId(id);
                          setCreated(null);
                        }}
                      />
                      {donors.slice(0, 5).map((d) => {
                        const active = (donorId || donors[0].store.id) === d.store.id;
                        return (
                          <button
                            key={d.store.id}
                            onClick={() => {
                              setDonorId(d.store.id);
                              setCreated(null);
                            }}
                            className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                              active ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-line hover:bg-[color:var(--plane)]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-ink flex items-center gap-2">
                                  {d.store.name}
                                  {!d.saleable && <Chip tone="critical">flagged defective</Chip>}
                                  {d.distanceKm <= 40 && d.saleable && <Chip tone="good">same-day lane</Chip>}
                                </div>
                                <div className="text-2xs text-muted mt-0.5">
                                  {d.store.city} · {d.distanceKm} km · {d.sellable} sellable · {d.excess} above a week's cover ·
                                  fill {pct(d.fillRate)}
                                  {d.distanceKm <= 40 && d.saleable && (
                                    <span style={{ color: "var(--status-good)" }}> · rider ETA ≈ {fmtEta(riderEtaMin(d.distanceKm))}</span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-2xs label">match</div>
                                <div className="text-sm font-semibold num text-ink">{(d.score * 100).toFixed(0)}</div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {policy && donor && (
                <div className="mt-5 pt-4 border-t border-line">
                  <SectionTitle title="4 · Policy checks" sub="Every rule is shown, passed or failed." />
                  <PolicyTrail policy={policy} />

                  <div className="grid sm:grid-cols-2 gap-3 mt-4">
                    <div>
                      <label className="label block mb-1">Customer name (optional)</label>
                      <input
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Customer name"
                        className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="label block mb-1">Mobile (optional)</label>
                      <input
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
                        placeholder="10 digits — used for pickup updates"
                        className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm num"
                      />
                      {customerPhone.length > 0 && customerPhone.length < 10 && (
                        <div className="text-2xs mt-1" style={{ color: "var(--status-critical)" }}>
                          Needs 10 digits, or leave it blank.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4 flex-wrap">
                    <button
                      className="btn-primary"
                      disabled={policy.outcome === "blocked" || (customerPhone.length > 0 && customerPhone.length < 10)}
                      onClick={() => setConfirm(true)}
                    >
                      {policy.outcome === "auto_approved"
                        ? `Transfer ${qty} unit${qty > 1 ? "s" : ""} now`
                        : policy.outcome === "needs_approval"
                        ? "Send for one-tap approval"
                        : "Blocked"}
                    </button>
                    <button className="btn" onClick={reset}>
                      Start over
                    </button>
                    {policy.outcome === "blocked" && (
                      <span className="text-xs" style={{ color: "var(--status-critical)" }}>
                        A blocking rule failed. Pick another donor above.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        {/* ── Right: outcome + before/after ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {created ? (
            <Card>
              <SectionTitle
                title={`${created.id} · ${STATUS_LABEL[created.status]}`}
                sub={`${created.qty} × ${styleById(created.styleId).name} size ${created.size}`}
                right={
                  <Chip tone={created.status === "approved" ? "good" : created.status === "rejected" ? "critical" : "warn"}>
                    {STATUS_LABEL[created.status]}
                  </Chip>
                }
              />
              <Timeline events={created.events} />

              {/* ── Instant hyperlocal dispatch — the same-day lane in motion ── */}
              {created.status === "approved" && rider && (
                <div className="mt-3 border border-line" data-rider-dispatch>
                  <div className="flex items-center justify-between px-3 py-2 border-b border-line" style={{ background: "var(--brand-soft)" }}>
                    <span className="label" style={{ color: "var(--brand)" }}>Instant dispatch · same-day lane</span>
                    <Chip tone="brand">{rider.taskId}</Chip>
                  </div>
                  <div className="p-3 space-y-3">
                    <div className="text-xs text-ink2 leading-relaxed">
                      Inside the 40 km lane the run books itself: pick task live at {rider.fromName}, rider{" "}
                      <span className="font-medium text-ink">{rider.rider}</span> assigned, pickup by{" "}
                      {fmtTime(NOW + rider.pickupBy * 60_000)}.
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { label: "Pick", time: "now", done: true },
                        { label: "Rider pickup", time: fmtTime(NOW + rider.pickupBy * 60_000), done: false },
                        { label: "In transit", time: `${rider.distanceKm} km`, done: false },
                        { label: "Handover", time: fmtTime(NOW + rider.arriveBy * 60_000), done: false },
                      ].map((s, i) => (
                        <div key={s.label} className="border border-line px-2 py-1.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <StatusDot tone={s.done ? "good" : i === 1 ? "warn" : "neutral"} />
                            <span className="text-2xs font-medium text-ink">{s.label}</span>
                          </div>
                          <div className="text-2xs text-muted num mt-0.5">{s.time}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="label">Arriving by</div>
                        <div className="text-lg font-semibold text-ink num leading-tight">
                          {fmtTime(NOW + rider.arriveBy * 60_000)}
                        </div>
                      </div>
                      <button
                        data-wa-notify
                        className="btn-primary !py-2 !text-xs"
                        disabled={waNotified}
                        onClick={() => {
                          setWaNotified(true);
                          app.dispatch({
                            type: "audit",
                            entry: {
                              at: NOW,
                              actor: app.actorName,
                              action: `WhatsApp sent to ${created.customerName || "the customer"} — ${styleById(created.styleId).name} (${created.size}) arriving by ${fmtTime(NOW + rider.arriveBy * 60_000)}`,
                              object: created.id,
                              system: "Arvi",
                            },
                          });
                          app.toastNow(
                            `WhatsApp sent${created.customerName ? ` to ${created.customerName}` : ""}: "Your size is on its way — arriving by ${fmtTime(NOW + rider.arriveBy * 60_000)}."`,
                            "good"
                          );
                        }}
                      >
                        {waNotified ? "✓ Customer notified" : "WhatsApp the customer"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {created.customerName && (
                <div className="mt-3 text-xs text-ink2">
                  {created.customerName} will get the pickup date by SMS, and an update if it changes.
                </div>
              )}
              {created.status === "pending_approval" && app.role !== "store" && app.role !== "staff" && (
                <div className="mt-3 flex gap-2">
                  <button
                    className="btn-primary !py-1.5 !text-xs"
                    onClick={() => {
                      app.dispatch({
                        type: "ist:status",
                        id: created.id,
                        status: "approved",
                        actor: app.actorName,
                        label: `Approved by ${app.actorName} — gate cleared`,
                        by: app.actorName,
                      });
                      setCreated({ ...created, status: "approved" });
                      app.toastNow(`${created.id} approved. Pick task created at the donor store.`);
                    }}
                  >
                    Approve
                  </button>
                  <button
                    className="btn !py-1.5 !text-xs"
                    onClick={() => {
                      app.dispatch({
                        type: "ist:status",
                        id: created.id,
                        status: "rejected",
                        actor: app.actorName,
                        label: "Rejected — donor needs the stock",
                        reason: "Donor needs the stock",
                      });
                      setCreated({ ...created, status: "rejected", rejectionReason: "Donor needs the stock" });
                      app.toastNow("Rejected, with the reason recorded against the lane.", "warn");
                    }}
                  >
                    Reject
                  </button>
                </div>
              )}
            </Card>
          ) : null}

          <Card>
            <SectionTitle title="Requests raised" sub="With their policy outcome." />
            {app.ist.length === 0 ? (
              <Empty title="Nothing raised yet" body="Pick a style and a size showing zero to raise a transfer." />
            ) : (
              <div className="space-y-2">
                {app.ist.map((r) => (
                  <div key={r.id} className="rounded-lg border border-line p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-ink">{r.id}</span>
                      <Chip tone={r.status === "approved" ? "good" : r.status === "rejected" ? "critical" : "warn"}>
                        {STATUS_LABEL[r.status]}
                      </Chip>
                    </div>
                    <div className="text-2xs text-muted mt-1">
                      {r.qty} × {styleById(r.styleId).name} ({r.size}) · {storeById(r.fromStoreId).name} →{" "}
                      {storeById(r.toStoreId).name} · raised {fmtTime(r.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Confirm the transfer"
        sub="Posts to the inventory ledger and raises the pickup advice."
        footer={
          <>
            <button className="btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={submit}>
              {policy?.outcome === "auto_approved" ? "Confirm and transfer" : "Send for approval"}
            </button>
          </>
        }
      >
        {style && donor && policy && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-line p-3">
                <div className="label mb-1">From</div>
                <div className="text-sm font-medium text-ink">{donor.store.name}</div>
                <div className="text-2xs text-muted">{donor.store.city} · {donor.distanceKm} km away</div>
              </div>
              <div className="rounded-lg border border-line p-3">
                <div className="label mb-1">To</div>
                <div className="text-sm font-medium text-ink">{store.name}</div>
                <div className="text-2xs text-muted">{store.city} · customer waiting</div>
              </div>
            </div>
            <div className="rounded-lg border border-line p-3 flex items-center gap-3">
              <Swatch hex={style.colourHex} />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink">{style.name}</div>
                <div className="text-2xs text-muted">
                  Size {size} · {qty} unit{qty > 1 ? "s" : ""} · {inr(style.mrp * qty)} at MRP
                </div>
              </div>
            </div>
            <Callout tone={policy.outcome === "auto_approved" ? "good" : "warn"}>
              {policy.outcome === "auto_approved"
                ? `Inside policy. The pick task appears at ${donor.store.name} immediately; expected here within ${policy.slaHours} hours. Raised after 11:00, so pickup is tomorrow's first slot.`
                : `One gate needs approval. It goes to the planner as a single approve-or-reject with a ${policy.slaHours}-hour service level.`}
            </Callout>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function PolicyTrail({ policy }: { policy: ReturnType<typeof evaluateIstPolicy> }) {
  const tone = policy.outcome === "auto_approved" ? "good" : policy.outcome === "needs_approval" ? "warn" : "critical";
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Chip tone={tone}>
          {policy.outcome === "auto_approved" ? "Auto-approved" : policy.outcome === "needs_approval" ? "One approval needed" : "Blocked"}
        </Chip>
        <span className="text-2xs text-muted">Service level {policy.slaHours}h</span>
      </div>
      <Table>
        <thead>
          <tr>
            <Th />
            <Th>Rule</Th>
            <Th>What the data says</Th>
            <Th align="right">If it fails</Th>
          </tr>
        </thead>
        <tbody>
          {policy.checks.map((c) => (
            <tr key={c.rule}>
              <Td>
                <StatusDot tone={c.passed ? "good" : c.severity === "blocking" ? "critical" : c.severity === "gate" ? "warn" : "neutral"} />
              </Td>
              <Td className="text-xs font-medium text-ink">{c.rule}</Td>
              <Td className="text-xs text-ink2 leading-snug">{c.detail}</Td>
              <Td align="right">
                <span className="text-2xs text-muted">
                  {c.severity === "blocking" ? "Blocks" : c.severity === "gate" ? "Needs approval" : "Advisory"}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

// ── Distance lane — where each donor sits against the 40 km same-day radius ──

function DistanceLane({
  donors,
  activeId,
  onPick,
}: {
  donors: ReturnType<typeof findDonors>;
  activeId: string;
  onPick: (id: string) => void;
}) {
  const max = Math.max(60, ...donors.map((d) => d.distanceKm + 8));
  const pos = (km: number) => `${Math.min(97, (km / max) * 100)}%`;
  return (
    <div className="border border-line bg-[color:var(--plane)] px-3 pt-2 pb-5" data-distance-lane>
      <div className="flex items-center justify-between mb-3">
        <span className="label">Distance from you</span>
        <span className="text-2xs text-muted">inside 40 km, a rider runs it today</span>
      </div>
      <div className="relative h-9">
        {/* Track */}
        <div className="absolute left-0 right-0 top-[13px] h-px" style={{ background: "var(--baseline)" }} />
        {/* Same-day shading + boundary */}
        <div className="absolute top-[9px] h-[9px] left-0" style={{ width: pos(40), background: "var(--ok-soft)" }} />
        <div className="absolute top-0 bottom-3 w-px" style={{ left: pos(40), background: "var(--status-warning)" }} />
        <span className="absolute text-2xs num" style={{ left: pos(40), transform: "translateX(-50%)", bottom: -8, color: "var(--status-warning)" }}>
          40 km
        </span>
        {/* You */}
        <span className="absolute w-3 h-3 rounded-full border-2 border-[color:var(--surface-2)]" style={{ left: 0, top: "8px", background: "var(--text-primary)" }} />
        <span className="absolute text-2xs font-semibold text-ink" style={{ left: 0, top: -4 }}>You</span>
        {/* Donors */}
        {donors.map((d, i) => {
          const active = d.store.id === activeId;
          return (
            <button
              key={d.store.id}
              onClick={() => onPick(d.store.id)}
              title={`${d.store.name} · ${d.distanceKm} km`}
              className="absolute -translate-x-1/2 group"
              style={{ left: pos(d.distanceKm), top: i % 2 === 0 ? "4px" : "10px" }}
              aria-label={`${d.store.name}, ${d.distanceKm} km`}
            >
              <span
                className="block w-3 h-3 rounded-full border-2 border-[color:var(--surface-2)] transition-transform group-hover:scale-125"
                style={{ background: active ? "var(--brand)" : d.distanceKm <= 40 ? "var(--status-good)" : "var(--text-muted)" }}
              />
              <span
                className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-2xs num ${active ? "font-semibold" : ""}`}
                style={{ top: i % 2 === 0 ? "-14px" : "14px", color: active ? "var(--brand)" : "var(--text-muted)" }}
              >
                {d.distanceKm} km
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Awaiting approval",
  approved: "Approved",
  picking: "Being picked",
  in_transit: "In transit",
  received: "Received",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired",
};
