"use client";

// Receive stock — what a floor person actually does at the back door:
// see what's coming and when, scan it in, and record a short receive
// honestly when the carton doesn't match the paper.

import React, { useMemo, useState } from "react";
import { NOW, rng } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { Card, Chip, Empty, Modal, SectionTitle, Stat, StatusDot, Table, Td, Th, fmtTime, relTime } from "@/components/ui";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

const SHORT_REASONS = ["Short shipped from source", "Carton missing", "Damaged in transit", "Wrong items in carton"];

interface Asn {
  id: string;
  po: string;
  from: string;
  kind: "Warehouse" | "Store transfer" | "Vendor";
  cartons: number;
  units: number;
  styles: number;
  eta: number;
  status: "in_transit" | "arrived" | "received";
}

function buildAsns(storeId: string): Asn[] {
  const r = rng(hash("grn" + storeId));
  const sources = ["RPC Bhiwandi", "RPC Bengaluru", "Linking Road", "Vendor: Arvind Mills", "Phoenix Marketcity"];
  const kinds: Asn["kind"][] = ["Warehouse", "Warehouse", "Store transfer", "Vendor", "Store transfer"];
  const out: Asn[] = [];
  for (let i = 0; i < 5; i++) {
    const units = 40 + Math.floor(r() * 480);
    out.push({
      id: `ASN-${5100 + i * 7 + Math.floor(r() * 5)}`,
      po: `PO-${88100 + i * 13 + Math.floor(r() * 9)}`,
      from: sources[i],
      kind: kinds[i],
      cartons: Math.max(1, Math.round(units / 24)),
      units,
      styles: 1 + Math.floor(r() * 9),
      eta: NOW + (i - 1.4) * 3 * 3600_000 + Math.floor(r() * 90) * 60_000,
      status: i <= 1 ? "arrived" : "in_transit",
    });
  }
  return out;
}

interface Receipt {
  asn: Asn;
  receivedUnits: number;
  reason?: string;
}

export default function Grn() {
  const app = useApp();
  const base = useMemo(() => buildAsns(app.storeId), [app.storeId]);
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});
  const [receiving, setReceiving] = useState<Asn | null>(null);
  const [qtyText, setQtyText] = useState("");
  const [reason, setReason] = useState(SHORT_REASONS[0]);

  const rows = base.map((a) => (receipts[a.id] ? { ...a, status: "received" as const } : a));
  const arrived = rows.filter((a) => a.status === "arrived");
  const inbound = rows.filter((a) => a.status === "in_transit").reduce((s, a) => s + a.units, 0);
  const shortToday = Object.values(receipts).reduce((s, x) => s + (x.asn.units - x.receivedUnits), 0);

  function openReceive(a: Asn) {
    setReceiving(a);
    setQtyText(String(a.units));
    setReason(SHORT_REASONS[0]);
  }

  function confirmReceive() {
    if (!receiving) return;
    const got = Math.max(0, Math.min(receiving.units, Math.floor(Number(qtyText) || 0)));
    const short = receiving.units - got;
    setReceipts((m) => ({ ...m, [receiving.id]: { asn: receiving, receivedUnits: got, reason: short > 0 ? reason : undefined } }));
    app.dispatch({
      type: "audit",
      entry: {
        at: NOW,
        actor: app.actorName,
        action: `${receiving.id} received against ${receiving.po}. ${got} of ${receiving.units} units${short ? ` (${short} short: ${reason})` : ""}`,
        object: receiving.po,
        system: "Arvind One",
      },
    });
    if (short > 0) {
      app.dispatch({
        type: "task:create",
        task: {
          id: `T-GRN-${receiving.id}`,
          storeId: app.storeId,
          title: `${short} units short on ${receiving.id}: ${reason}`,
          detail: `${receiving.from} · ${receiving.po}. Photo of carton seals attached at receipt.`,
          origin: "replenishment",
          assignedTo: app.actorName,
          dueAt: NOW + 24 * 3600_000,
          priority: 2,
          status: "todo",
          requiresPhoto: true,
          photoAttached: false,
          slaHours: 24,
        },
      });
      app.toastNow(`${receiving.id}: ${got} received, ${short} short, recorded against ${receiving.po}`, "warn");
    } else {
      app.toastNow(`${receiving.id} received in full, stock is sellable now`, "good");
    }
    setReceiving(null);
  }

  const shortOnModal = receiving ? receiving.units - Math.max(0, Math.min(receiving.units, Math.floor(Number(qtyText) || 0))) : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink">Receive stock</h1>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="At the door now" value={String(arrived.length)} tone={arrived.length ? "warn" : "good"} emphasis />
        <Stat label="Units on the way" value={inbound.toLocaleString("en-IN")} />
        <Stat label="Short today" value={String(shortToday)} tone={shortToday > 0 ? "critical" : "good"} />
      </div>

      <Card>
        <SectionTitle title="Coming in" right={<Chip>{rows.filter((a) => a.status !== "received").length} open</Chip>} />
        <Table>
          <thead>
            <tr>
              <Th>Shipment</Th><Th>PO no.</Th><Th>From</Th>
              <Th align="right">Cartons</Th><Th align="right">Units</Th>
              <Th>ETA</Th><Th>Status</Th><Th align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <Td>
                  <div className="num font-semibold text-ink text-sm">{a.id}</div>
                  <div className="text-2xs text-muted mt-0.5">{a.kind} · {a.styles} styles</div>
                </Td>
                <Td className="num text-xs text-ink">{a.po}</Td>
                <Td className="text-xs text-ink2">{a.from}</Td>
                <Td align="right" className="num">{a.cartons}</Td>
                <Td align="right" className="num">{a.units}</Td>
                <Td className="whitespace-nowrap">
                  <div className="text-xs text-ink num">{fmtTime(a.eta)}</div>
                  <div className="text-2xs text-muted">{a.eta <= NOW ? "at the door" : relTime(a.eta, NOW)}</div>
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink2">
                    <StatusDot tone={a.status === "received" ? "good" : a.status === "arrived" ? "warn" : "neutral"} />
                    {a.status === "received"
                      ? receipts[a.id] && receipts[a.id].receivedUnits < a.units
                        ? `Received · ${a.units - receipts[a.id].receivedUnits} short`
                        : "Received"
                      : a.status === "arrived"
                      ? "Arrived"
                      : "On the way"}
                  </span>
                </Td>
                <Td align="right">
                  {a.status === "arrived" && (
                    <button data-receive className="btn-primary !py-1.5 !text-xs" onClick={() => openReceive(a)}>
                      Scan &amp; receive
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {rows.length === 0 && <Empty title="Nothing coming in" />}
      </Card>

      {Object.keys(receipts).length > 0 && (
        <Card>
          <SectionTitle title="Received today" />
          <Table>
            <thead>
              <tr><Th>Shipment</Th><Th>PO no.</Th><Th align="right">Expected</Th><Th align="right">Received</Th><Th>Short reason</Th></tr>
            </thead>
            <tbody>
              {Object.values(receipts).map((x) => (
                <tr key={x.asn.id}>
                  <Td className="num text-sm text-ink">{x.asn.id}</Td>
                  <Td className="num text-xs text-ink2">{x.asn.po}</Td>
                  <Td align="right" className="num">{x.asn.units}</Td>
                  <Td align="right" className="num font-semibold" style={{ color: x.receivedUnits < x.asn.units ? "var(--status-critical)" : "var(--status-good)" }}>
                    {x.receivedUnits}
                  </Td>
                  <Td className="text-xs text-ink2">{x.reason ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {receiving && (
        <Modal
          open
          onClose={() => setReceiving(null)}
          title={`Receive ${receiving.id}`}
          sub={`${receiving.po} · ${receiving.from} · ${receiving.cartons} cartons`}
          footer={
            <>
              <button className="btn" onClick={() => setReceiving(null)}>Cancel</button>
              <button data-receive-confirm className="btn-primary" onClick={confirmReceive}>
                {shortOnModal > 0 ? `Receive ${Math.max(0, receiving.units - shortOnModal)} · record ${shortOnModal} short` : `Receive all ${receiving.units}`}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-line p-3">
                <div className="label mb-1">Paper says</div>
                <div className="text-2xl font-semibold text-ink num">{receiving.units}</div>
                <div className="text-2xs text-muted">units on {receiving.po}</div>
              </div>
              <div className="border border-line p-3">
                <div className="label mb-1">You counted</div>
                <input
                  data-receive-qty
                  value={qtyText}
                  onChange={(e) => setQtyText(e.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  className="w-full text-2xl font-semibold num border-b border-line bg-transparent outline-none text-ink"
                />
                <div className="text-2xs text-muted mt-0.5">change it if the count is short</div>
              </div>
            </div>
            {shortOnModal > 0 && (
              <div>
                <div className="label mb-1.5">Why is it short?</div>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border border-line bg-raised px-3 py-2.5 text-sm text-ink">
                  {SHORT_REASONS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <div className="text-2xs text-muted mt-1.5">
                  The short is recorded against {receiving.po} and a photo task is raised, you are never blamed for a
                  carton that arrived light.
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
