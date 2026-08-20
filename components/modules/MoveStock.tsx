"use client";

// Move stock — planning's override.
//
// The run and the cycles are the system's opinion. This is where a planner
// overrules it: take units out of the warehouse or off one store's floor and put
// them on another, on their own judgement. Nothing is auto-approved and nothing
// is hidden — every move lands in the movement log with a name against it.

import React, { useMemo, useState } from "react";
import { Callout, Card, Chip, SectionTitle, SortTh, Stat, Swatch, Table, Tabs, Td, Th, fmtDateTime, useSort } from "@/components/ui";
import { PLANNING_BRAND, applyMove, planningStores, unitsAt, validateMove, warehouseBySize, warehouseTotal } from "@/lib/engine";
import { NOW, STYLES, storeById, styleById } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { inr } from "@/lib/rules";
import { CycleBuilder } from "@/components/modules/Renewal";
import type { Size, StockMove } from "@/lib/types";

type MoveSort = "at" | "from" | "to" | "style" | "units";

export default function MoveStock() {
  const app = useApp();
  const stores = planningStores();
  const styles = useMemo(() => STYLES.filter((s) => s.brand === PLANNING_BRAND), []);

  const [from, setFrom] = useState<string>("warehouse");
  const [toStoreId, setToStoreId] = useState(stores[0]?.id ?? "");
  const [styleId, setStyleId] = useState(styles[0]?.id ?? "");
  const [size, setSize] = useState<Size | "">("");
  const [units, setUnits] = useState(0);
  const [spread, setSpread] = useState(false);

  const style = styleById(styleId);
  const bySize = useMemo(() => warehouseBySize(styleId), [styleId]);
  // Same reason as the cycle builder: default to a size that has stock behind it.
  const deepest = useMemo(() => {
    if (from === "warehouse") return [...bySize].sort((a, b) => b.units - a.units)[0]?.size ?? style.coreSizes[0];
    return [...style.sizes].sort((a, b) => unitsAt(from, styleId, b) - unitsAt(from, styleId, a))[0] ?? style.coreSizes[0];
  }, [bySize, from, styleId, style.sizes, style.coreSizes]);
  const chosenSize = (size || deepest) as Size;

  const available = from === "warehouse" ? (bySize.find((b) => b.size === chosenSize)?.units ?? 0) : unitsAt(from, styleId, chosenSize);
  const request = { from, toStoreId, styleId, size: chosenSize, units };
  const errors = units > 0 ? validateMove(request) : [];

  function move() {
    if (errors.length > 0 || units <= 0) return;
    if (!applyMove(request)) return;
    const record: StockMove = {
      id: `MV-${app.moves.length + 1}`,
      at: NOW,
      by: app.actorName,
      from,
      toStoreId,
      styleId,
      size: chosenSize,
      units,
      reason: "Moved by planning",
    };
    app.dispatch({ type: "cycle:apply", id: `MANUAL-${app.moves.length + 1}`, moves: [record], by: app.actorName });
    app.toastNow(`${units} × ${style.name} (${chosenSize}) → ${storeById(toStoreId).name}`, "good");
    setUnits(0);
  }

  const sorter = useSort<MoveSort>("at");
  const sortedMoves = sorter.sort(app.moves, (m, key) => {
    switch (key) {
      case "at": return m.at;
      case "from": return m.from === "warehouse" ? "Warehouse" : storeById(m.from).name;
      case "to": return storeById(m.toStoreId).name;
      case "style": return styleById(m.styleId).name;
      case "units": return m.units;
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Move stock</h1>
          <p className="text-xs text-ink2 mt-1">Warehouse to a store, or store to store, on your call</p>
        </div>
        <button className="btn" data-spread onClick={() => setSpread(true)}>
          Allocate one unit across stores
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Moves this session" value={String(app.moves.length)} emphasis />
        <Stat label="Units moved" value={app.moves.reduce((a, m) => a + m.units, 0).toLocaleString("en-IN")} />
        <Stat label="Warehouse total, this unit" value={warehouseTotal(styleId).toLocaleString("en-IN")} sub={style.name} />
        <Stat label={`Available in ${chosenSize}`} value={String(available)} tone={available === 0 ? "critical" : undefined} />
      </div>

      <Card>
        <SectionTitle title="Move units" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="From">
            <select value={from} data-move-from onChange={(e) => setFrom(e.target.value)} className={inputCls}>
              <option value="warehouse">Warehouse</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="To">
            <select value={toStoreId} data-move-to onChange={(e) => setToStoreId(e.target.value)} className={inputCls}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Unit">
            <select
              value={styleId}
              data-move-style
              onChange={(e) => {
                setStyleId(e.target.value);
                setSize("");
                setUnits(0);
              }}
              className={inputCls}
            >
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} · {s.name} · {s.colour}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Size">
            <select value={chosenSize} data-move-size onChange={(e) => setSize(e.target.value as Size)} className={inputCls}>
              {style.sizes.map((sz) => (
                <option key={sz} value={sz}>
                  {sz}
                  {from === "warehouse" ? ` — ${bySize.find((b) => b.size === sz)?.units ?? 0} in warehouse` : ` — ${unitsAt(from, styleId, sz)} on floor`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Units">
            <input
              type="number"
              min={0}
              max={available}
              value={units}
              data-move-units
              onChange={(e) => setUnits(Math.max(0, Number(e.target.value) || 0))}
              className={`${inputCls} num`}
            />
          </Field>
          <div className="flex items-end">
            <button className="btn-primary w-full" data-move-confirm disabled={units <= 0 || errors.length > 0} onClick={move}>
              Move {units > 0 ? `${units} units` : ""}
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 flex-wrap text-xs">
          <Swatch hex={style.colourHex} label={style.colour} />
          <span className="text-ink2">{style.category}</span>
          <span className="num text-ink2">MRP {inr(style.mrp)}</span>
          <Chip>{from === "warehouse" ? "Warehouse" : storeById(from).name} → {storeById(toStoreId).name}</Chip>
        </div>

        {errors.length > 0 && (
          <div className="mt-3">
            <Callout tone="critical" title="This move will not go through">
              <ul className="list-disc pl-4 space-y-0.5">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Callout>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle title="Movement log" />
        {app.moves.length === 0 ? (
          <div className="text-sm text-ink2">Nothing moved yet this session.</div>
        ) : (
          <Table>
            <thead>
              <tr>
                <SortTh sortKey="at" sorter={sorter}>When</SortTh>
                <SortTh sortKey="from" sorter={sorter}>From</SortTh>
                <SortTh sortKey="to" sorter={sorter}>To</SortTh>
                <Th>SKU</Th>
                <SortTh sortKey="style" sorter={sorter}>Style</SortTh>
                <Th>Size</Th>
                <SortTh sortKey="units" sorter={sorter} align="right">Units</SortTh>
                <Th>Why</Th>
                <Th>Who</Th>
              </tr>
            </thead>
            <tbody>
              {sortedMoves.map((m) => (
                <tr key={m.id} data-move-row>
                  <Td className="num text-xs whitespace-nowrap">{fmtDateTime(m.at)}</Td>
                  <Td className="text-ink2">{m.from === "warehouse" ? "Warehouse" : storeById(m.from).name}</Td>
                  <Td className="text-ink">{storeById(m.toStoreId).name}</Td>
                  <Td className="num text-xs text-ink2">{m.styleId}</Td>
                  <Td>{styleById(m.styleId).name}</Td>
                  <Td className="num">{m.size}</Td>
                  <Td align="right" className="num">{m.units}</Td>
                  <Td className="text-xs text-ink2">{m.reason}</Td>
                  <Td className="text-xs text-ink2">{m.by}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <CycleBuilder open={spread} onClose={() => setSpread(false)} kind="allocation" />
    </div>
  );
}

const inputCls = "w-full border border-line bg-raised px-3 py-2 text-sm text-ink";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      {children}
    </div>
  );
}
