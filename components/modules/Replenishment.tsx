"use client";

// Replenishment — the pull-and-transfer engine for this store.
// Warehouse pulls execute here; inter-store transfers route into Save the Sale.

import React, { useMemo, useState } from "react";
import { NOW } from "@/lib/seed";
import { sizeSetExceptions, type StyleSignal } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { Card, Chip, Empty, SectionTitle, Stat, StatusDot, Swatch, Table, Td, Th, inr } from "@/components/ui";

const ACTION_LABEL: Record<string, string> = {
  replenish_from_dc: "Pull from warehouse",
  transfer_in: "Transfer from a store",
  stop_sell: "Stop featuring",
  monitor: "Monitor",
};

export default function Replenishment() {
  const app = useApp();
  const all = useMemo(() => sizeSetExceptions(app.storeId, 40), [app.storeId]);
  const [raised, setRaised] = useState<string[]>([]);

  const pulls = all.filter((s) => s.decision.action === "replenish_from_dc");
  const transfers = all.filter((s) => s.decision.action === "transfer_in");
  const others = all.filter((s) => s.decision.action !== "replenish_from_dc" && s.decision.action !== "transfer_in");
  const pullUnits = pulls.reduce((a, s) => a + (s.decision.units || 0), 0);
  const atRiskValue = all.reduce((a, s) => a + s.valueAtRisk, 0);
  const openPulls = pulls.filter((s) => !raised.includes(s.style.id));

  function raisePull(sig: StyleSignal) {
    const units = Math.max(1, Math.min(sig.dcUnits, sig.decision.units || Math.ceil(sig.ros * 7)));
    app.dispatch({
      type: "task:create",
      task: {
        id: `T-RP-${sig.style.id}`,
        storeId: app.storeId,
        title: `Replenish ${units} × ${sig.style.name} from the warehouse`,
        detail: `${sig.decision.reason} Warehouse shows ${sig.dcUnits} units.`,
        origin: "replenishment",
        assignedTo: app.actorName,
        dueAt: NOW + 24 * 3600_000,
        priority: 1,
        status: "todo",
        requiresPhoto: false,
        photoAttached: false,
        valueAtRisk: Math.round(sig.valueAtRisk),
        slaHours: 24,
      },
    });
    setRaised((r) => [...r, sig.style.id]);
    app.toastNow(`Pull raised: ${units} × ${sig.style.name}`, "good");
  }

  function raiseAll() {
    openPulls.forEach(raisePull);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Replenishment</h1>
        </div>
        {openPulls.length > 1 && (
          <button className="btn-primary" onClick={raiseAll}>Raise all {openPulls.length} pulls</button>
        )}
      </div>

      <Card>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="serif-accent text-sm shrink-0">Arvi</span>
          <span className="text-xs text-ink">
            The Replenishment Agent raised 11 pulls inside its autonomy limit overnight. 2 above-limit moves are waiting for approval.
          </span>
          <button className="btn !py-1 !text-2xs" onClick={() => app.go("agents")}>Review approvals</button>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Warehouse pulls" value={String(pulls.length)} tone={pulls.length ? "warn" : "good"} sub={`${pullUnits} units recommended`} emphasis />
        <Stat label="Store transfers" value={String(transfers.length)} sub="Warehouse empty, a peer store has it" />
        <Stat label="Other exceptions" value={String(others.length)} sub="Stop-sell or monitor" />
        <Stat label="Value at risk" value={inr(atRiskValue, { compact: true })} tone="critical" sub="Full-price sales if nothing moves" />
      </div>

      <Card>
        <SectionTitle title="Pull from warehouse" right={<Chip tone={openPulls.length ? "warn" : "good"}>{openPulls.length} open</Chip>} />
        {pulls.length === 0 ? (
          <Empty title="Nothing to pull" body="No exception currently has warehouse stock available." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Style</Th><Th>Missing</Th>
                <Th align="right">RoS</Th><Th align="right">Cover</Th>
                <Th align="right">Warehouse</Th><Th align="right">Pull</Th>
                <Th align="right">At risk</Th><Th align="right" />
              </tr>
            </thead>
            <tbody>
              {pulls.map((s) => {
                const done = raised.includes(s.style.id);
                return (
                  <tr key={s.style.id}>
                    <Td>
                      <span className="inline-flex items-center gap-2 text-sm text-ink"><Swatch hex={s.style.colourHex} />{s.style.name}</span>
                    </Td>
                    <Td className="text-xs text-ink2">{s.health.missingCore.join(", ") || "—"}</Td>
                    <Td align="right" className="num text-xs">{s.ros.toFixed(2)}/d</Td>
                    <Td align="right" className="num text-xs">{s.cover > 900 ? "—" : `${s.cover.toFixed(0)}d`}</Td>
                    <Td align="right" className="num text-xs">{s.dcUnits}</Td>
                    <Td align="right" className="num font-semibold text-ink">{s.decision.units || Math.ceil(s.ros * 7)}</Td>
                    <Td align="right" className="num text-xs" style={{ color: "var(--status-critical)" }}>{inr(s.valueAtRisk, { compact: true })}</Td>
                    <Td align="right">
                      {done ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-ink2"><StatusDot tone="good" />Raised</span>
                      ) : (
                        <button className="btn-primary !py-1.5 !text-xs" onClick={() => raisePull(s)}>Pull</button>
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
        <SectionTitle title="Transfer from a store" right={<Chip>{transfers.length}</Chip>} />
        {transfers.length === 0 ? (
          <Empty title="No transfers suggested" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Style</Th><Th>Missing</Th><Th align="right">RoS</Th>
                <Th align="right">Peer stock</Th><Th align="right">At risk</Th><Th align="right" />
              </tr>
            </thead>
            <tbody>
              {transfers.map((s) => (
                <tr key={s.style.id}>
                  <Td>
                    <span className="inline-flex items-center gap-2 text-sm text-ink"><Swatch hex={s.style.colourHex} />{s.style.name}</span>
                  </Td>
                  <Td className="text-xs text-ink2">{s.health.missingCore.join(", ") || "—"}</Td>
                  <Td align="right" className="num text-xs">{s.ros.toFixed(2)}/d</Td>
                  <Td align="right" className="num text-xs">{s.donorUnits}</Td>
                  <Td align="right" className="num text-xs" style={{ color: "var(--status-critical)" }}>{inr(s.valueAtRisk, { compact: true })}</Td>
                  <Td align="right">
                    <button className="btn-primary !py-1.5 !text-xs" onClick={() => app.go("savesale")}>Find donor</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {others.length > 0 && (
        <Card>
          <SectionTitle title="No stock anywhere" right={<Chip>{others.length}</Chip>} />
          <Table>
            <thead>
              <tr><Th>Style</Th><Th>Missing</Th><Th>Action</Th><Th className="w-1/2">Why</Th></tr>
            </thead>
            <tbody>
              {others.map((s) => (
                <tr key={s.style.id}>
                  <Td>
                    <span className="inline-flex items-center gap-2 text-sm text-ink"><Swatch hex={s.style.colourHex} />{s.style.name}</span>
                  </Td>
                  <Td className="text-xs text-ink2">{s.health.missingCore.join(", ") || "—"}</Td>
                  <Td><Chip tone={s.decision.action === "stop_sell" ? "critical" : "neutral"}>{ACTION_LABEL[s.decision.action]}</Chip></Td>
                  <Td className="text-xs text-ink2">{s.decision.reason}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
