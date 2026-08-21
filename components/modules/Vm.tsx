"use client";

// VM adherence.
//
// The checklist a store closes out, with a photo where a photo is the only real
// proof. The point is not the checklist — it is that HQ stops ringing round the
// network to find the four doors that have not done it.

import React, { useMemo, useState } from "react";
import { Card, Chip, Empty, Meter, SectionTitle, SortTh, Stat, StatusDot, Table, Td, Th, pct, relTime, useSort } from "@/components/ui";
import StoreLink from "@/components/StoreLink";
import { VmAuditModal } from "./VmAudit";
import { NOW, VM_CHECKS, storeById } from "@/lib/seed";
import { planningStores, vmAdherence, vmFor } from "@/lib/engine";
import { useApp } from "@/lib/state";

export default function Vm() {
  const app = useApp();
  if (app.role === "planner" || app.role === "catplan" || app.role === "leadership") return <EstateVm />;
  return <StoreVm />;
}

// ── The store's checklist ────────────────────────────────────────────────────

function StoreVm() {
  const app = useApp();
  const store = storeById(app.storeId);
  const row = useMemo(() => vmFor(app.storeId, app.vm[app.storeId]), [app.storeId, app.vm]);
  const [shooting, setShooting] = useState<string | null>(null);
  const shot = VM_CHECKS.find((c) => c.id === shooting);

  function set(checkId: string, label: string, done: boolean) {
    app.dispatch({ type: "vm:check", storeId: app.storeId, checkId, done, by: app.actorName, label });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">VM adherence</h1>
          <p className="text-sm text-ink2 mt-1">{store.name}</p>
        </div>
        <Chip tone={row.score >= 0.85 ? "good" : row.score >= 0.6 ? "warn" : "critical"}>{pct(row.score)}</Chip>
      </div>

      <Card>
        <SectionTitle title="Today's checklist" right={<span className="text-2xs text-muted">Last closed {relTime(row.lastAt, NOW)}</span>} />
        <div className="divide-y divide-[color:var(--line)]">
          {VM_CHECKS.map((c) => {
            const done = row.done.includes(c.id);
            return (
              <div key={c.id} className="flex items-center gap-3 py-2.5" data-vm-check={c.id}>
                <StatusDot tone={done ? "good" : "warn"} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink">{c.label}</div>
                  <div className="text-xs text-ink2 truncate">{c.detail}</div>
                </div>
                {c.needsPhoto && !done ? (
                  <button className="btn-primary !py-1 !text-2xs" data-vm-shoot onClick={() => setShooting(c.id)}>
                    Photo
                  </button>
                ) : (
                  <button
                    className={done ? "btn !py-1 !text-2xs" : "btn-primary !py-1 !text-2xs"}
                    data-vm-toggle
                    onClick={() => set(c.id, c.label, !done)}
                  >
                    {done ? "Reopen" : "Done"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {shot && (
        <VmAuditModal
          open
          taskId={`vm-${app.storeId}-${shot.id}`}
          taskTitle={shot.label}
          onClose={() => setShooting(null)}
          onApproved={() => {
            set(shot.id, shot.label, true);
            setShooting(null);
          }}
        />
      )}
    </div>
  );
}

// ── The estate view ─────────────────────────────────────────────────────────

type VmSort = "store" | "score" | "last";

function EstateVm() {
  const app = useApp();
  const stores = planningStores();
  const rows = useMemo(() => vmAdherence(stores, app.vm), [stores, app.vm]);

  const sorter = useSort<VmSort>("score", "asc");
  const sorted = sorter.sort(rows, (r, key) => {
    switch (key) {
      case "store": return r.store.name;
      case "score": return r.score;
      case "last": return r.lastAt;
    }
  });

  const behind = rows.filter((r) => r.score < 0.85);
  const estate = rows.length ? rows.reduce((a, r) => a + r.score, 0) / rows.length : 0;
  // Which check the network fails most — one message beats twenty-four calls.
  const worstCheck = useMemo(() => {
    const counts = VM_CHECKS.map((c) => ({ check: c, missing: rows.filter((r) => !r.done.includes(c.id)).length }));
    return counts.sort((a, b) => b.missing - a.missing)[0];
  }, [rows]);

  function chase() {
    if (behind.length === 0) return;
    app.dispatch({
      type: "hq:assign",
      task: {
        id: `HQ-VM-${app.hqTasks.length + 1}`,
        title: `Close out VM: ${worstCheck.check.label}`,
        from: "VM",
        storeIds: behind.map((r) => r.store.id),
        dueAt: NOW + 24 * 3600_000,
        slaHours: 24,
        needsPhoto: worstCheck.check.needsPhoto,
        raisedBy: app.actorName,
        raisedAt: NOW,
      },
    });
    app.toastNow(`Assigned to ${behind.length} ${behind.length === 1 ? "store" : "stores"}`, "good");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">VM adherence</h1>
          <p className="text-sm text-ink2 mt-1">{stores.length} stores</p>
        </div>
        <button className="btn" data-vm-chase disabled={behind.length === 0} onClick={chase}>
          Assign to the {behind.length} behind
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Estate adherence" value={pct(estate)} tone={estate >= 0.85 ? "good" : "warn"} emphasis />
        <Stat label="Below 85%" value={String(behind.length)} tone={behind.length ? "warn" : "good"} />
        <Stat label="At full marks" value={String(rows.filter((r) => r.score === 1).length)} />
        <Stat label="Most missed" value={worstCheck.check.label} sub={`${worstCheck.missing} stores`} />
        <Stat label="Checks in the list" value={String(VM_CHECKS.length)} />
      </div>

      <Card>
        <SectionTitle title="Worst first" right={<Chip>{sorted.length}</Chip>} />
        {sorted.length === 0 ? (
          <Empty title="No stores in scope" />
        ) : (
          <Table>
            <thead>
              <tr>
                <SortTh sortKey="store" sorter={sorter}>Store</SortTh>
                <SortTh sortKey="score" sorter={sorter} align="right">Adherence</SortTh>
                <Th>Against the estate</Th>
                <Th>Still open</Th>
                <SortTh sortKey="last" sorter={sorter}>Last closed</SortTh>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.store.id} data-vm-row>
                  <Td><StoreLink storeId={r.store.id} /></Td>
                  <Td align="right" className="num text-xs" style={{ color: r.score < 0.6 ? "var(--status-critical)" : undefined }}>
                    {pct(r.score)}
                  </Td>
                  <Td><Meter value={r.score} target={0.85} /></Td>
                  <Td className="text-xs text-ink2">{r.missing.length === 0 ? "—" : r.missing.map((m) => m.label).join(", ")}</Td>
                  <Td className="text-xs text-ink2 whitespace-nowrap">{relTime(r.lastAt, NOW)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
