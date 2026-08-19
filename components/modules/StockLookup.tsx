"use client";

// Check stock — the question the floor asks fifty times a day, answered in
// two taps: "do we have this, in this size, anywhere?" Every store and the
// warehouse, live, with the road to a transfer one tap away.

import React, { useMemo, useState } from "react";
import { STORES, STYLES, storeById, styleById } from "@/lib/seed";
import { dcAvailable, sellable, skuRow, stockForStyleAtStore } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { Card, Chip, Empty, SectionTitle, SizeGrid, StatusDot, Swatch, Table, Td, Th, inr } from "@/components/ui";
import type { Size } from "@/lib/types";

export default function StockLookup() {
  const app = useApp();
  const myStore = storeById(app.storeId);
  const [query, setQuery] = useState("");
  const [styleId, setStyleId] = useState("");
  const [size, setSize] = useState<Size | "">("");

  const options = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return STYLES.slice(0, 30);
    return STYLES.filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
  }, [query]);

  const style = styleId ? styleById(styleId) : null;

  const myUnits: Record<string, number> = useMemo(() => {
    if (!style) return {};
    const out: Record<string, number> = {};
    for (const r of stockForStyleAtStore(app.storeId, style.id)) out[r.size] = sellable(r);
    return out;
  }, [app.storeId, style]);

  const network = useMemo(() => {
    if (!style || !size) return [];
    return STORES.filter((s) => s.id !== app.storeId)
      .map((s) => {
        const row = skuRow(s.id, style.id, size as Size);
        return { store: s, units: row ? sellable(row) : 0 };
      })
      .filter((x) => x.units > 0)
      .sort((a, b) => b.units - a.units);
  }, [app.storeId, style, size]);

  const dcUnits = style && size ? dcAvailable(style.id, size as Size) : 0;
  const totalElsewhere = network.reduce((a, x) => a + x.units, 0) + dcUnits;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink">Check stock</h1>

      <Card>
        <SectionTitle title="1 · Which item?" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a name — try “polo” or “jean”"
          className="w-full rounded-lg border border-line bg-raised px-3 py-3 text-base text-ink placeholder:text-muted"
        />
        <div className="mt-2.5 max-h-[190px] overflow-y-auto space-y-1 pr-1">
          {options.map((s) => {
            const active = styleId === s.id;
            return (
              <button
                key={s.id}
                data-lookup-style
                onClick={() => {
                  setStyleId(s.id);
                  setSize("");
                }}
                className={`w-full text-left rounded-lg border px-2.5 py-2 flex items-center gap-2.5 transition-colors ${
                  active ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-line hover:bg-[color:var(--plane)]"
                }`}
              >
                <Swatch hex={s.colourHex} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink truncate">{s.name}</div>
                  <div className="text-2xs text-muted">{s.brand} · {s.category} · MRP {inr(s.mrp)}</div>
                </div>
              </button>
            );
          })}
          {options.length === 0 && <Empty title="Nothing matches that name" />}
        </div>

        {style && (
          <div className="mt-5 pt-4 border-t border-line">
            <SectionTitle title="2 · Which size?" sub={`What ${myStore.name} has on the floor right now.`} />
            <SizeGrid
              sizes={style.sizes}
              units={myUnits}
              core={style.coreSizes}
              selected={size || undefined}
              onPick={(s) => setSize(s as Size)}
            />
          </div>
        )}
      </Card>

      {style && size && (
        <Card>
          <SectionTitle
            title={`${style.name} · size ${size} — everywhere`}
            right={<Chip tone={totalElsewhere > 0 ? "good" : "critical"}>{totalElsewhere} elsewhere</Chip>}
          />
          <Table>
            <thead>
              <tr><Th>Where</Th><Th align="right">Sellable now</Th><Th align="right">Distance</Th><Th align="right" /></tr>
            </thead>
            <tbody>
              {/* This store first, then the warehouse, then the network */}
              <tr>
                <Td>
                  <div className="text-sm font-medium text-ink">{myStore.name} <Chip tone="brand">this store</Chip></div>
                </Td>
                <Td align="right" className="num text-sm font-semibold" style={{ color: (myUnits[size] ?? 0) > 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                  {myUnits[size] ?? 0}
                </Td>
                <Td align="right" className="num text-xs text-muted">—</Td>
                <Td align="right">
                  {(myUnits[size] ?? 0) > 0 && <span className="text-2xs text-muted">On your floor</span>}
                </Td>
              </tr>
              <tr data-lookup-dc>
                <Td>
                  <div className="text-sm font-medium text-ink">Warehouse (RPC) <Chip tone="neutral">DC</Chip></div>
                </Td>
                <Td align="right" className="num text-sm font-semibold" style={{ color: dcUnits > 0 ? "var(--status-good)" : "var(--text-muted)" }}>{dcUnits}</Td>
                <Td align="right" className="num text-xs text-ink2">next truck</Td>
                <Td align="right">
                  {dcUnits > 0 && (
                    <button className="btn !py-1 !text-2xs" onClick={() => app.go("replenish")}>Pull from warehouse</button>
                  )}
                </Td>
              </tr>
              {network.map((x) => {
                return (
                  <tr key={x.store.id}>
                    <Td>
                      <div className="text-sm text-ink">{x.store.name}</div>
                      <div className="text-2xs text-muted">{x.store.brand} · {x.store.city}</div>
                    </Td>
                    <Td align="right" className="num text-sm font-semibold text-ink">{x.units}</Td>
                    <Td align="right" className="num text-xs text-ink2">{x.store.city === myStore.city ? "same city" : x.store.region === myStore.region ? "same region" : "other region"}</Td>
                    <Td align="right">
                      <button data-lookup-transfer className="btn-primary !py-1 !text-2xs" onClick={() => app.go("savesale")}>
                        Get it here
                      </button>
                    </Td>
                  </tr>
                );
              })}
              {network.length === 0 && dcUnits === 0 && (
                <tr>
                  <Td colSpan={4}>
                    <div className="flex items-center gap-2 text-xs py-1" style={{ color: "var(--status-critical)" }}>
                      <StatusDot tone="critical" /> No store and no warehouse has this size — offer the online channel.
                    </div>
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
          {network.length > 0 && (
            <div className="text-2xs text-muted mt-2">
              “Get it here” opens Inter-store transfer with the best source already recommended.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
