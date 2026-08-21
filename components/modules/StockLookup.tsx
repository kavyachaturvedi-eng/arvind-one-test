"use client";

// Check stock — the question the floor asks fifty times a day, answered in
// two taps: "do we have this, in this size, anywhere?" Every store and the
// warehouse, live, with the road to a transfer one tap away.

import React, { useMemo, useState } from "react";
import { NOW, STORES, STYLES, storeById, styleById } from "@/lib/seed";
import { dcAvailable, sellable, skuRow, stockForStyleAtStore, styleSignal } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { Card, Chip, Empty, SectionTitle, SizeGrid, StatusDot, Swatch, Table, Td, Th, inr } from "@/components/ui";
import type { Size } from "@/lib/types";

export default function StockLookup() {
  const app = useApp();
  const myStore = storeById(app.storeId);
  const [query, setQuery] = useState("");
  const [styleId, setStyleId] = useState("");
  const [size, setSize] = useState<Size | "">("");

  const [syncing, setSyncing] = useState(false);

  // The full list, with its own search and filters.
  const [fullList, setFullList] = useState(false);
  // The size grid opens where you are, rather than throwing you back to search.
  const [inline, setInline] = useState<string | null>(null);
  const [listQuery, setListQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("All brands");
  const [catFilter, setCatFilter] = useState("All categories");
  const [stockFilter, setStockFilter] = useState<"All" | "In stock" | "Low" | "Out of stock">("All");

  const inventory = useMemo(() => {
    return STYLES.map((s) => {
      const rows = stockForStyleAtStore(app.storeId, s.id);
      const units = rows.reduce((a, x) => a + sellable(x), 0);
      const brokenSizes = s.coreSizes.filter((cs) => {
        const row = rows.find((x) => x.size === cs);
        return !row || sellable(row) <= 0;
      });
      return { style: s, units, carried: rows.length > 0, brokenSizes };
    });
  }, [app.storeId]);

  const brands = useMemo(() => ["All brands", ...Array.from(new Set(STYLES.map((s) => s.brand)))], []);
  const cats = useMemo(() => ["All categories", ...Array.from(new Set(STYLES.map((s) => s.category)))], []);

  const listRows = useMemo(() => {
    const q = listQuery.toLowerCase().trim();
    return inventory
      .filter((r) => (brandFilter === "All brands" ? true : r.style.brand === brandFilter))
      .filter((r) => (catFilter === "All categories" ? true : r.style.category === catFilter))
      .filter((r) =>
        stockFilter === "All"
          ? true
          : stockFilter === "Out of stock"
          ? r.units === 0
          : stockFilter === "Low"
          ? r.units > 0 && r.units <= 6
          : r.units > 6
      )
      .filter((r) => (!q ? true : r.style.name.toLowerCase().includes(q) || r.style.id.toLowerCase().includes(q)))
      .sort((a, b) => a.units - b.units);
  }, [inventory, listQuery, brandFilter, catFilter, stockFilter]);

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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-ink">Check stock</h1>
        <div className="flex items-center gap-2">
          {/* The manager can push a stuck count without opening any settings. */}
          {app.role === "store" && (
            <button
              data-inv-sync
              className="btn"
              disabled={syncing}
              onClick={() => {
                setSyncing(true);
                app.dispatch({
                  type: "audit",
                  entry: { at: NOW, actor: app.actorName, action: "Forced a stock-count sync to the website", object: "inventory", system: "Arvind One" },
                });
                app.toastNow("Stock counts pushed. The website catches up in under a minute.", "good");
              }}
            >
              {syncing ? "✓ Counts pushed" : "↻ Force sync counts"}
            </button>
          )}
          <button data-full-list className="btn" onClick={() => setFullList((v) => !v)}>
            {fullList ? "Back to search" : "See full list"}
          </button>
        </div>
      </div>

      {fullList ? (
        <Card>
          <SectionTitle title={`Everything at ${myStore.name}`} right={<Chip>{listRows.length} styles</Chip>} />
          <div className="flex gap-2 flex-wrap">
            <input
              data-list-search
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="Search by name or code"
              className="flex-1 min-w-[200px] rounded-lg border border-line bg-raised px-3 py-2.5 text-sm text-ink placeholder:text-muted"
            />
            <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="border border-line bg-raised px-3 py-2.5 text-sm text-ink">
              {brands.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="border border-line bg-raised px-3 py-2.5 text-sm text-ink">
              {cats.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              data-stock-filter
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)}
              className="border border-line bg-raised px-3 py-2.5 text-sm text-ink"
            >
              {["All", "In stock", "Low", "Out of stock"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="mt-3">
            <Table>
              <thead>
                <tr><Th>Item</Th><Th>Brand</Th><Th>Category</Th><Th align="right">MRP</Th><Th align="right">On the floor</Th><Th>Core sizes</Th><Th align="right" /></tr>
              </thead>
              <tbody>
                {listRows.map((r) => (
                  <React.Fragment key={r.style.id}>
                  <tr>
                    <Td>
                      <span className="inline-flex items-center gap-2">
                        <Swatch hex={r.style.colourHex} />
                        <span>
                          <span className="block text-sm text-ink">{r.style.name}</span>
                          <span className="block text-2xs text-muted num">{r.style.id}</span>
                        </span>
                      </span>
                    </Td>
                    <Td className="text-xs text-ink2">{r.style.brand}</Td>
                    <Td className="text-xs text-ink2">{r.style.category}</Td>
                    <Td align="right" className="num text-xs">{inr(r.style.mrp)}</Td>
                    <Td align="right">
                      <span
                        className="num text-sm font-semibold"
                        style={{ color: r.units === 0 ? "var(--status-critical)" : r.units <= 6 ? "var(--status-warning)" : "var(--status-good)" }}
                      >
                        {r.units}
                      </span>
                    </Td>
                    <Td className="text-xs">
                      {r.brokenSizes.length === 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-ink2"><StatusDot tone="good" />all there</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5" style={{ color: "var(--status-critical)" }}>
                          <StatusDot tone="critical" />{r.brokenSizes.join(", ")} at zero
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      <button
                        className="btn !py-1 !text-2xs"
                        data-check-sizes
                        onClick={() => setInline(inline === r.style.id ? null : r.style.id)}
                      >
                        {inline === r.style.id ? "Hide" : "Check sizes"}
                      </button>
                    </Td>
                  </tr>
                  {inline === r.style.id && (
                    <tr data-inline-sizes>
                      <Td colSpan={7}>
                        <InlineSizes styleId={r.style.id} />
                      </Td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </Table>
            {listRows.length === 0 && <Empty title="Nothing matches those filters" />}
          </div>
        </Card>
      ) : (
      <Card>
        <SectionTitle title="1 · Which item?" />
        <div className="flex gap-2">
          <span className="grid place-items-center w-11 border border-line bg-[color:var(--plane)] text-lg shrink-0" aria-hidden>⌸</span>
          <input
            data-lookup-scan
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // A barcode gun types the item code and presses Enter.
              const code = query.trim().toUpperCase();
              const hit = STYLES.find((s) => s.id.toUpperCase() === code) ?? options[0];
              if (hit) {
                setStyleId(hit.id);
                setSize("");
                app.toastNow(`${hit.name} scanned`, "info");
              }
            }}
            placeholder="Scan the barcode, or type a name like polo"
            className="w-full rounded-lg border border-line bg-raised px-3 py-3 text-base text-ink placeholder:text-muted"
          />
        </div>
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
            <SectionTitle title="2 · Which size?" />
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
      )}

      {!fullList && style && size && (
        <Card>
          <SectionTitle
            title={`${style.name} · size ${size}`}
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
                      <StatusDot tone="critical" /> No store and no warehouse has this size, offer the online channel.
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

// ── The size grid, opened in place ───────────────────────────────────────────
//
// Sizes here, and the two things a floor can do about a gap: ask the warehouse,
// or ask for a transfer. Which store a transfer comes from is planning's call.

function InlineSizes({ styleId }: { styleId: string }) {
  const app = useApp();
  const style = styleById(styleId);
  const sig = useMemo(() => styleSignal(app.storeId, styleId), [app.storeId, styleId]);
  const units = useMemo(() => {
    const out: Record<string, number> = {};
    style.sizes.forEach((sz) => {
      const row = skuRow(app.storeId, styleId, sz);
      out[sz] = row ? Math.max(0, row.onHand - row.reserved) : 0;
    });
    return out;
  }, [app.storeId, styleId, style.sizes]);

  const [size, setSize] = useState<Size>(sig.health.missingCore[0] ?? style.coreSizes[0]);
  const wh = dcAvailable(styleId, size);
  // A week's cover, but never a token single unit: a pivotal size that has run
  // out needs enough to hold the run together.
  const week = Math.ceil(sig.ros * 7);
  const floor = style.coreSizes.includes(size) ? 3 : 2;
  const need = Math.max(sig.decision.units, week, floor);

  function ask(kind: "warehouse" | "transfer") {
    app.raiseRequest({
      kind: "replenish",
      storeId: app.storeId,
      styleId,
      size,
      units: kind === "warehouse" ? Math.min(need, wh) : need,
      note: kind === "warehouse" ? "Warehouse pull" : "Transfer",
      evidence: {
        fillRate: 0,
        sellable: sig.sellable,
        ros: sig.ros,
        coverDays: sig.cover,
        sizeSetStatus: sig.health.status,
        valueAtRisk: Math.round(sig.valueAtRisk),
      },
    });
    app.toastNow(`Asked planning for ${kind === "warehouse" ? Math.min(need, wh) : need} × ${style.name} (${size})`, "good");
  }

  return (
    <div className="py-1 space-y-2.5">
      <SizeGrid sizes={style.sizes} units={units} core={style.coreSizes} selected={size} onPick={(sz) => setSize(sz as Size)} />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-ink2 num">
          Size {size} · {units[size] ?? 0} here · {wh} in warehouse
        </span>
        <span className="flex-1" />
        <button className="btn !py-1 !text-2xs" data-inline-transfer onClick={() => ask("transfer")}>
          Ask for a transfer
        </button>
        <button className="btn-primary !py-1 !text-2xs" data-inline-replenish disabled={wh <= 0} onClick={() => ask("warehouse")}>
          Ask warehouse for {Math.min(need, wh)}
        </button>
      </div>
    </div>
  );
}
