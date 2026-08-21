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
import StoreLink from "@/components/StoreLink";
import { inr } from "@/lib/rules";
import { CycleBuilder, CycleCard } from "@/components/modules/Renewal";
import PullbackBuilder from "@/components/modules/PullbackBuilder";
import type { Size, StockMove } from "@/lib/types";
import SizeAllocator, { type SizeMap } from "@/components/SizeAllocator";
import { SEEDED_MOVES } from "@/lib/seed";

type MoveSort = "at" | "from" | "to" | "style" | "units";

export default function MoveStock() {
  const app = useApp();
  const stores = planningStores();
  const styles = useMemo(() => STYLES.filter((s) => s.brand === PLANNING_BRAND), []);

  const [from, setFrom] = useState<string>("warehouse");
  const [toStoreId, setToStoreId] = useState(stores[0]?.id ?? "");
  const [styleId, setStyleId] = useState(styles[0]?.id ?? "");
  // Sizes are allocated together, not one variant at a time.
  const [sizes, setSizes] = useState<SizeMap>({});
  const [spread, setSpread] = useState(false);
  const [pull, setPull] = useState(false);

  const style = styleById(styleId);
  const bySize = useMemo(() => warehouseBySize(styleId), [styleId]);
  // Same reason as the cycle builder: default to a size that has stock behind it.

  const total = Object.values(sizes).reduce((a, n) => a + (n ?? 0), 0);
  const errors = useMemo(
    () =>
      Object.entries(sizes)
        .filter(([, n]) => (n ?? 0) > 0)
        .flatMap(([sz, n]) => validateMove({ from, toStoreId, styleId, size: sz as Size, units: n as number })),
    [sizes, from, toStoreId, styleId],
  );

  function move() {
    if (errors.length > 0 || total <= 0) return;
    const moves: StockMove[] = [];
    Object.entries(sizes).forEach(([sz, n], i) => {
      if (!n || n <= 0) return;
      if (!applyMove({ from, toStoreId, styleId, size: sz as Size, units: n })) return;
      moves.push({
        id: `MV-${app.moves.length + 1}-${i}`,
        at: NOW,
        by: app.actorName,
        from,
        toStoreId,
        styleId,
        size: sz as Size,
        units: n,
        reason: "Moved by planning",
      });
    });
    if (moves.length === 0) return;
    app.dispatch({ type: "cycle:apply", id: `MANUAL-${app.moves.length + 1}`, moves, by: app.actorName });
    app.toastNow(`${moves.reduce((a, m) => a + m.units, 0)} × ${style.name} → ${storeById(toStoreId).name}`, "good");
    setSizes({});
  }

  // Allocation and pull-back cycles are raised here, so they are decided here.
  const cycles = app.cycles.filter((c) => c.kind === "allocation" || c.kind === "pullback");

  const sorter = useSort<MoveSort>("at");
  const sortedMoves = sorter.sort([...app.moves, ...SEEDED_MOVES], (m, key) => {
    switch (key) {
      case "at": return m.at;
      case "from": return m.from === "warehouse" ? "Warehouse" : storeById(m.from).name;
      case "to": return m.toStoreId === "warehouse" ? "Warehouse" : storeById(m.toStoreId).name;
      case "style": return styleById(m.styleId).name;
      case "units": return m.units;
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Move stock</h1>
                  </div>
        <div className="flex items-center gap-2">
          <button className="btn" data-pullback onClick={() => setPull(true)}>
            Pull back
          </button>
          <button className="btn" data-spread onClick={() => setSpread(true)}>
            Allocate
          </button>
        </div>
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
                setSizes({});
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
          <div className="flex items-end">
            <button className="btn-primary w-full" data-move-confirm disabled={total <= 0 || errors.length > 0} onClick={move}>
              Move {total > 0 ? `${total} units` : ""}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <SizeAllocator styleId={styleId} toStoreId={toStoreId} from={from} value={sizes} onChange={setSizes} />
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

      {cycles.length > 0 && (
        <Card>
          <SectionTitle title="Cycles waiting on a decision" />
          <div className="space-y-3">
            {cycles.map((c) => (
              <CycleCard key={c.id} cycle={c} />
            ))}
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle title="Movement log" />
        {sortedMoves.length === 0 ? (
          <div className="text-sm text-ink2">Nothing moved yet.</div>
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
                  <Td>{m.from === "warehouse" ? <span className="text-ink2">Warehouse</span> : <StoreLink storeId={m.from} muted />}</Td>
                  <Td>{m.toStoreId === "warehouse" ? <span className="text-ink2">Warehouse</span> : <StoreLink storeId={m.toStoreId} />}</Td>
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
      <PullbackBuilder open={pull} onClose={() => setPull(false)} />
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
