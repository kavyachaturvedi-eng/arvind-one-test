"use client";

// Inward & GRN — receive stock against advice notes, flag variance, put away.

import React, { useMemo, useState } from "react";
import { NOW, STYLES, rng } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { Card, Chip, Empty, SectionTitle, Stat, StatusDot, Table, Td, Th, relTime } from "@/components/ui";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

interface Asn {
  id: string;
  from: string;
  kind: "Warehouse" | "IST in" | "Vendor";
  cartons: number;
  units: number;
  styles: number;
  eta: number;
  status: "in_transit" | "arrived" | "received";
  varianceUnits: number;
}

function buildAsns(storeId: string): Asn[] {
  const r = rng(hash("grn" + storeId));
  const sources = ["RPC Bhiwandi", "RPC Bengaluru", "Linking Road", "Vendor — Arvind Mills", "Phoenix Marketcity"];
  const kinds: Asn["kind"][] = ["Warehouse", "Warehouse", "IST in", "Vendor", "IST in"];
  const out: Asn[] = [];
  for (let i = 0; i < 5; i++) {
    const units = 40 + Math.floor(r() * 480);
    out.push({
      id: `ASN-${5100 + i * 7 + Math.floor(r() * 5)}`,
      from: sources[i],
      kind: kinds[i],
      cartons: Math.max(1, Math.round(units / 24)),
      units,
      styles: 1 + Math.floor(r() * 9),
      eta: NOW + (i - 1.4) * 3 * 3600_000 + Math.floor(r() * 90) * 60_000,
      status: i === 0 ? "arrived" : i === 1 ? "arrived" : "in_transit",
      varianceUnits: r() < 0.3 ? 1 + Math.floor(r() * 4) : 0,
    });
  }
  return out;
}

export default function Grn() {
  const app = useApp();
  const base = useMemo(() => buildAsns(app.storeId), [app.storeId]);
  const [received, setReceived] = useState<Record<string, number>>({});
  const r7 = rng(hash("grn7" + app.storeId));
  const last7Units = 900 + Math.floor(r7() * 1400);
  const last7Var = Math.floor(r7() * 9);

  const rows = base.map((a) => (received[a.id] !== undefined ? { ...a, status: "received" as const } : a));
  const arrived = rows.filter((a) => a.status === "arrived");
  const pendingUnits = rows.filter((a) => a.status !== "received").reduce((s, a) => s + a.units, 0);

  function receive(a: Asn) {
    setReceived((m) => ({ ...m, [a.id]: a.units - a.varianceUnits }));
    app.dispatch({
      type: "audit",
      entry: {
        at: NOW,
        actor: app.actorName,
        action: `GRN ${a.id} received — ${a.units - a.varianceUnits} units${a.varianceUnits ? `, ${a.varianceUnits} short (variance logged)` : ""}`,
        object: a.id,
        system: "Arvind One",
      },
    });
    if (a.varianceUnits > 0) {
      app.dispatch({
        type: "task:create",
        task: {
          id: `T-GRN-${a.id}`,
          storeId: app.storeId,
          title: `Variance on ${a.id}: ${a.varianceUnits} units short vs advice`,
          detail: `${a.from} · ${a.cartons} cartons. Photo of carton seals attached at receipt.`,
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
    }
    app.toastNow(
      a.varianceUnits > 0
        ? `${a.id} received with ${a.varianceUnits} short — variance task raised`
        : `${a.id} received clean — stock is sellable now`,
      a.varianceUnits > 0 ? "warn" : "good"
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Inward &amp; GRN</h1>
        <p className="text-sm text-ink2 mt-1">Receive against the advice note. Variance is logged at the door, not discovered later.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="To receive now" value={String(arrived.length)} tone={arrived.length ? "warn" : "good"} sub="Vehicles at the door" emphasis />
        <Stat label="Units inbound" value={pendingUnits.toLocaleString("en-IN")} sub="Across open advice notes" />
        <Stat label="Received, last 7 days" value={last7Units.toLocaleString("en-IN")} sub="units" />
        <Stat label="Variance, last 7 days" value={String(last7Var)} tone={last7Var > 5 ? "critical" : "good"} sub="units short vs advice" />
      </div>

      <Card>
        <SectionTitle title="Advice notes" right={<Chip>{rows.filter((a) => a.status !== "received").length} open</Chip>} />
        <Table>
          <thead>
            <tr>
              <Th>ASN</Th><Th>From</Th><Th>Type</Th>
              <Th align="right">Cartons</Th><Th align="right">Units</Th><Th align="right">Styles</Th>
              <Th>ETA</Th><Th>Status</Th><Th align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <Td className="num font-semibold text-ink">{a.id}</Td>
                <Td className="text-xs text-ink2">{a.from}</Td>
                <Td><Chip tone={a.kind === "IST in" ? "brand" : "neutral"}>{a.kind}</Chip></Td>
                <Td align="right" className="num">{a.cartons}</Td>
                <Td align="right" className="num">{a.units}</Td>
                <Td align="right" className="num">{a.styles}</Td>
                <Td className="text-xs text-ink2 whitespace-nowrap">{a.eta <= NOW ? "at door" : relTime(a.eta, NOW).replace("in ", "in ")}</Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink2">
                    <StatusDot tone={a.status === "received" ? "good" : a.status === "arrived" ? "warn" : "neutral"} />
                    {a.status === "received" ? `Received${received[a.id] !== undefined && a.varianceUnits ? ` · ${a.varianceUnits} short` : ""}` : a.status === "arrived" ? "Arrived" : "In transit"}
                  </span>
                </Td>
                <Td align="right">
                  {a.status === "arrived" && (
                    <button className="btn-primary !py-1.5 !text-xs" onClick={() => receive(a)}>Scan &amp; receive</button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {rows.length === 0 && <Empty title="Nothing inbound" />}
      </Card>

      <Card>
        <SectionTitle title="Put-away queue" sub="Received units, sizes ascending, stockroom to floor." />
        <Table>
          <thead>
            <tr><Th>Style</Th><Th align="right">Units</Th><Th>Bay</Th><Th>Owner</Th><Th>Status</Th></tr>
          </thead>
          <tbody>
            {STYLES.slice(0, 4).map((s, i) => {
              const rr = rng(hash(app.storeId + s.id + "put"));
              const done = i < 2;
              return (
                <tr key={s.id}>
                  <Td className="text-sm text-ink">{s.name}</Td>
                  <Td align="right" className="num">{4 + Math.floor(rr() * 28)}</Td>
                  <Td className="text-xs text-ink2">Bay {1 + Math.floor(rr() * 6)}</Td>
                  <Td className="text-xs text-ink2">{["Aditya Rane", "Devansh Patil", "Kiran Joshi", "Sana Qureshi"][i]}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink2">
                      <StatusDot tone={done ? "good" : "warn"} />{done ? "On floor" : "In stockroom"}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
