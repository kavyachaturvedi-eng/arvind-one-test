"use client";

// Stores — the estate register, and where a new door is opened.
//
// Opening a store here is not a form that files paperwork: the store is created
// with a cluster, a norm, a replenish share and a generated assortment, and it
// appears immediately in Store 360, the Tue/Fri run, the drop allocation and
// the OTB store counts. A new door opens with no trading history, so its rate
// of sale is honestly zero until it trades.

import React, { useMemo, useState } from "react";
import { Callout, Card, Chip, Modal, SectionTitle, SortTh, Stat, StatusDot, Table, Td, Th, useSort } from "@/components/ui";
import { BRANDS, CLUSTERS, STORES, createStore } from "@/lib/seed";
import { vitalsFor } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { inr, pct } from "@/lib/rules";
import type { Brand, Region, Store } from "@/lib/types";

type StoreSort = "name" | "code" | "brand" | "city" | "cluster" | "grade" | "norm" | "target" | "fill";

const FORMATS: Store["format"][] = ["Mall", "High Street", "Outlet", "Airport"];
const MODELS: Store["model"][] = ["COCO", "COFO", "FOCO", "FOCL", "FOFO"];

export default function Stores() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  // Bumped after each creation so the table recomputes off the mutated estate.
  const [version, setVersion] = useState(0);

  const rows = useMemo(
    () =>
      STORES.map((s) => ({
        store: s,
        cluster: CLUSTERS.find((c) => c.id === s.clusterId)!,
        fill: vitalsFor(s.id).fillRate,
        norm: app.normFor(s.id),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, app.norms],
  );

  const sorter = useSort<StoreSort>("code", "asc");
  const sorted = sorter.sort(rows, (r, key) => {
    switch (key) {
      case "name": return r.store.name;
      case "code": return r.store.code;
      case "brand": return r.store.brand;
      case "city": return r.store.city;
      case "cluster": return r.cluster.name;
      case "grade": return r.store.grade;
      case "norm": return r.norm;
      case "target": return r.store.targetMonth;
      case "fill": return r.fill;
    }
  });

  const openedThisSession = app.audit.filter((a) => a.action === "Store opened").length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Stores</h1>
          <p className="text-xs text-ink2 mt-1">{STORES.length} stores across {BRANDS.length} brands</p>
        </div>
        <button className="btn-primary" data-open-store onClick={() => setOpen(true)}>
          Open a store
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Stores" value={String(STORES.length)} emphasis />
        <Stat label="Clusters" value={String(CLUSTERS.length)} />
        <Stat label="Opened this session" value={String(openedThisSession)} tone={openedThisSession > 0 ? "good" : undefined} />
        <Stat label="Planned units" value={STORES.reduce((a, s) => a + app.normFor(s.id), 0).toLocaleString("en-IN")} />
      </div>


      <Card>
        <SectionTitle title="The estate" />
        <Table>
          <thead>
            <tr>
              <SortTh sortKey="code" sorter={sorter}>Code</SortTh>
              <SortTh sortKey="name" sorter={sorter}>Store</SortTh>
              <SortTh sortKey="brand" sorter={sorter}>Brand</SortTh>
              <SortTh sortKey="city" sorter={sorter}>City</SortTh>
              <SortTh sortKey="cluster" sorter={sorter}>Cluster</SortTh>
              <SortTh sortKey="grade" sorter={sorter}>Grade</SortTh>
              <SortTh sortKey="norm" sorter={sorter} align="right">Norm</SortTh>
              <SortTh sortKey="fill" sorter={sorter} align="right">Fill rate</SortTh>
              <SortTh sortKey="target" sorter={sorter} align="right">Monthly target</SortTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.store.id} data-store-register>
                <Td className="num text-xs text-ink2">{r.store.code}</Td>
                <Td className="text-ink">{r.store.name}</Td>
                <Td>{r.store.brand}</Td>
                <Td className="text-ink2">{r.store.city}</Td>
                <Td className="text-ink2">{r.cluster.name}</Td>
                <Td>{r.store.grade}</Td>
                <Td align="right" className="num">{r.norm.toLocaleString("en-IN")}</Td>
                <Td align="right" className="num">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot tone={r.fill >= 0.97 && r.fill <= 1.05 ? "good" : r.fill < 0.92 ? "critical" : "warn"} />
                    {pct(r.fill)}
                  </span>
                </Td>
                <Td align="right" className="num">{inr(r.store.targetMonth, { compact: true })}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <NewStore
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setVersion((v) => v + 1);
          setOpen(false);
        }}
      />
    </div>
  );
}

function NewStore({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const app = useApp();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [manager, setManager] = useState("");
  const [pincode, setPincode] = useState("");
  const [brand, setBrand] = useState<Brand>(BRANDS[0]);
  const [clusterId, setClusterId] = useState(CLUSTERS[0].id);
  const [grade, setGrade] = useState<Store["grade"]>("B");
  const [format, setFormat] = useState<Store["format"]>("Mall");
  const [model, setModel] = useState<Store["model"]>("COCO");
  const [headcount, setHeadcount] = useState(9);

  const cluster = CLUSTERS.find((c) => c.id === clusterId)!;
  const ready = name.trim().length > 2 && city.trim().length > 2 && manager.trim().length > 2 && /^\d{6}$/.test(pincode);

  function submit() {
    if (!ready) return;
    const store = createStore({
      name: name.trim(),
      city: city.trim(),
      brand,
      region: cluster.region as Region,
      format,
      model,
      grade,
      clusterId,
      pincode,
      headcount,
      managerName: manager.trim(),
    });
    app.dispatch({ type: "store:add", store });
    app.toastNow(`${store.name} opened · ${store.code}`, "good");
    setName("");
    setCity("");
    setManager("");
    setPincode("");
    onCreated();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Open a store"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <span className="text-xs text-ink2">
            Region follows the cluster: {cluster.name} sits in {cluster.region}
          </span>
          <button className="btn-primary" data-create-store disabled={!ready} onClick={submit}>
            Open the store
          </button>
        </div>
      }
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Store name">
          <input value={name} data-new-name onChange={(e) => setName(e.target.value)} placeholder="e.g. Palladium Andheri" className={inputCls} />
        </Field>
        <Field label="City">
          <input value={city} data-new-city onChange={(e) => setCity(e.target.value)} placeholder="e.g. Mumbai" className={inputCls} />
        </Field>
        <Field label="Store manager">
          <input value={manager} data-new-manager onChange={(e) => setManager(e.target.value)} placeholder="Full name" className={inputCls} />
        </Field>
        <Field label="Pincode">
          <input
            value={pincode}
            data-new-pincode
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6 digits"
            className={`${inputCls} num`}
          />
        </Field>
        <Field label="Brand">
          <select value={brand} data-new-brand onChange={(e) => setBrand(e.target.value as Brand)} className={inputCls}>
            {BRANDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cluster">
          <select value={clusterId} data-new-cluster onChange={(e) => setClusterId(e.target.value)} className={inputCls}>
            {CLUSTERS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.region}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Grade">
          <select value={grade} data-new-grade onChange={(e) => setGrade(e.target.value as Store["grade"])} className={inputCls}>
            {(["A", "B", "C"] as const).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Format">
          <select value={format} data-new-format onChange={(e) => setFormat(e.target.value as Store["format"])} className={inputCls}>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ownership">
          <select value={model} data-new-model onChange={(e) => setModel(e.target.value as Store["model"])} className={inputCls}>
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Headcount">
          <input
            type="number"
            min={2}
            max={40}
            value={headcount}
            data-new-headcount
            onChange={(e) => setHeadcount(Math.max(2, Math.min(40, Number(e.target.value) || 2)))}
            className={`${inputCls} num`}
          />
        </Field>
      </div>
    </Modal>
  );
}

const inputCls = "w-full border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-muted";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      {children}
    </div>
  );
}
