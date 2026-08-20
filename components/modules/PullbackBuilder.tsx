"use client";

// Pull-back — planning decides what comes off the floors.
//
// After EOSS, fashion that will not carry into the next season comes back so it
// can go to an outlet or a channel that will clear it. The store does not make
// that call, so this is raised here and approved before anything ships; the
// store then sees it as an outward batch to pack.

import React, { useMemo, useState } from "react";
import { Callout, Modal, StatusDot, Swatch, Table, Td, Th } from "@/components/ui";
import { PLANNING_BRAND, gradedStyles, planningStores, unitsAt } from "@/lib/engine";
import { NOW, STYLES, styleById } from "@/lib/seed";
import { CYCLE_LABEL, useApp } from "@/lib/state";
import { inr, pct } from "@/lib/rules";
import type { Cycle, CycleLine, Size } from "@/lib/types";

export default function PullbackBuilder({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const stores = planningStores();
  // Fashion first: core carries across seasons, so it is not what comes back.
  const styles = useMemo(
    () => STYLES.filter((s) => s.brand === PLANNING_BRAND).sort((a, b) => (a.productType === b.productType ? 0 : a.productType === "fashion" ? -1 : 1)),
    [],
  );

  const [styleId, setStyleId] = useState(styles[0]?.id ?? "");
  const [byStore, setByStore] = useState<Record<string, Partial<Record<Size, number>>>>({});
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [note, setNote] = useState("EOSS pull-back");

  const style = styleById(styleId);

  function storeTotal(sid: string) {
    return Object.values(byStore[sid] ?? {}).reduce((a, n) => a + (n ?? 0), 0);
  }
  const total = stores.reduce((a, st) => a + storeTotal(st.id), 0);

  // Nobody can send back more than they hold.
  const overStores = stores.filter((st) =>
    Object.entries(byStore[st.id] ?? {}).some(([sz, n]) => (n ?? 0) > unitsAt(st.id, styleId, sz as Size)),
  );

  function submit() {
    const lines: CycleLine[] = Object.entries(byStore).flatMap(([sid, sizes]) =>
      Object.entries(sizes ?? {})
        .filter(([, n]) => (n ?? 0) > 0)
        .map(([sz, n], i) => ({ id: `CL-${sid}-${sz}-${i}`, storeId: sid, styleId, size: sz as Size, units: n as number })),
    );
    if (lines.length === 0 || overStores.length > 0) return;
    const cycle: Cycle = {
      id: `CY-PB-${app.cycles.length + 1}`,
      kind: "pullback",
      status: "awaiting_approval",
      createdAt: NOW,
      createdBy: app.actorName,
      source: "stores",
      lines,
      note: `${note} · ${style.name}`,
    };
    app.dispatch({ type: "cycle:create", cycle });
    app.toastNow(`${CYCLE_LABEL.pullback} raised · ${total} units from ${lines.length} store-size lines`, "good");
    setByStore({});
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Pull stock back"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <span className="text-xs num" style={{ color: overStores.length > 0 ? "var(--status-critical)" : "var(--text-secondary)" }}>
            {total} units back to the warehouse
          </span>
          <button className="btn-primary" data-pullback-submit disabled={total === 0 || overStores.length > 0} onClick={submit}>
            Send for approval
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <div className="label mb-1">Unit</div>
            <select
              value={styleId}
              data-pullback-style
              onChange={(e) => {
                setStyleId(e.target.value);
                setByStore({});
                setOpenRow(null);
              }}
              className={inputCls}
            >
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} · {s.name} · {s.colour} · {s.productType === "core" ? "Core" : "Fashion"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="label mb-1">Reason</div>
            <select value={note} data-pullback-reason onChange={(e) => setNote(e.target.value)} className={inputCls}>
              <option>EOSS pull-back</option>
              <option>Not carrying next season</option>
              <option>Consolidating into outlets</option>
              <option>Quality hold</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap text-xs">
          <Swatch hex={style.colourHex} label={style.colour} />
          <span className="text-ink2">{style.category}</span>
          <span className="text-ink2">{style.productType === "core" ? "Core" : "Fashion"}</span>
          <span className="num text-ink2">MRP {inr(style.mrp)}</span>
        </div>

        {overStores.length > 0 && <Callout tone="critical" title="Asking for more than the floor holds" />}

        <Table>
          <thead>
            <tr>
              <Th>Store</Th>
              <Th>Grade</Th>
              <Th align="right">On floor</Th>
              <Th align="right">Sell-through</Th>
              <Th>Set</Th>
              <Th align="right">Pulling back</Th>
              <Th align="right">Sizes</Th>
            </tr>
          </thead>
          <tbody>
            {stores.map((st) => {
              const carried = gradedStyles(st.id, 80).find((g) => g.signal.style.id === styleId);
              const mine = storeTotal(st.id);
              const expanded = openRow === st.id;
              return (
                <React.Fragment key={st.id}>
                  <tr data-pullback-row>
                    <Td className="text-ink">{st.name}</Td>
                    <Td>{st.grade}</Td>
                    <Td align="right" className="num">{carried ? carried.signal.sellable : 0}</Td>
                    <Td align="right" className="num">{carried ? pct(carried.sellThrough) : "—"}</Td>
                    <Td>
                      {carried ? (
                        <span className="inline-flex items-center gap-1.5">
                          <StatusDot tone={carried.signal.health.status === "healthy" ? "good" : carried.signal.health.status === "broken" ? "critical" : "warn"} />
                          <span className="text-xs text-ink2">{carried.grade}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Not carried</span>
                      )}
                    </Td>
                    <Td align="right" className="num" style={mine > 0 ? { color: "var(--status-serious)" } : undefined}>
                      {mine || "—"}
                    </Td>
                    <Td align="right">
                      <button className="btn !py-1 !text-2xs" data-pullback-sizes onClick={() => setOpenRow(expanded ? null : st.id)} disabled={!carried}>
                        {expanded ? "Hide" : "Sizes"}
                      </button>
                    </Td>
                  </tr>
                  {expanded && (
                    <tr>
                      <Td colSpan={7}>
                        <div className="flex gap-2 flex-wrap py-1">
                          {style.sizes.map((sz) => {
                            const here = unitsAt(st.id, styleId, sz);
                            return (
                              <div key={sz} className="border border-line px-2 py-1.5">
                                <div className="text-2xs num text-ink2 mb-1">
                                  {sz} · has {here}
                                </div>
                                <input
                                  type="number"
                                  min={0}
                                  max={here}
                                  value={byStore[st.id]?.[sz] ?? 0}
                                  data-pullback-qty
                                  onChange={(e) =>
                                    setByStore({
                                      ...byStore,
                                      [st.id]: { ...(byStore[st.id] ?? {}), [sz]: Math.max(0, Math.min(here, Number(e.target.value) || 0)) },
                                    })
                                  }
                                  className="w-14 border border-line bg-raised px-1.5 py-1 text-sm text-ink text-right num"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </Td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </Table>
      </div>
    </Modal>
  );
}

const inputCls = "w-full border border-line bg-raised px-3 py-2 text-sm text-ink";
