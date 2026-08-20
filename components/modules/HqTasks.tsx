"use client";

// Store tasks — the head-office end of what a store sees as "From HQ".
//
// Stores already receive these; this is where they are raised and assigned.
// Assign to the whole estate, a cluster, or one door.

import React, { useMemo, useState } from "react";
import { Card, Chip, SectionTitle, Stat, StatusDot, Table, Td, Th, fmtRunDate, relTime } from "@/components/ui";
import { filterStores, planningStores } from "@/lib/engine";
import { CLUSTERS, HOUR, NOW, clusterById, storeById } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { ticketSlaHours } from "@/lib/rules";
import type { HqAssignment } from "@/lib/types";

const DESKS = ["VM", "Retail Ops", "Commercial", "Planning", "Admin", "Training"];
const SCOPES = ["estate", "cluster", "store"] as const;
type Scope = (typeof SCOPES)[number];

export default function HqTasks() {
  const app = useApp();
  const stores = planningStores();
  const clusters = useMemo(() => CLUSTERS.filter((c) => stores.some((s) => s.clusterId === c.id)), [stores]);

  const [title, setTitle] = useState("");
  const [desk, setDesk] = useState(DESKS[0]);
  const [scope, setScope] = useState<Scope>("estate");
  const [clusterId, setClusterId] = useState(clusters[0]?.id ?? "");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [dueHours, setDueHours] = useState(24);
  const [needsPhoto, setNeedsPhoto] = useState(false);

  const targets =
    scope === "estate" ? stores : scope === "cluster" ? filterStores({ region: "all", cluster: clusterId, grade: "all", band: "all" }) : stores.filter((s) => s.id === storeId);

  function assign() {
    if (!title.trim() || targets.length === 0) return;
    const task: HqAssignment = {
      id: `HQA-${app.hqTasks.length + 1}`,
      title: title.trim(),
      from: desk,
      storeIds: targets.map((s) => s.id),
      dueAt: NOW + dueHours * HOUR,
      slaHours: dueHours,
      needsPhoto,
      raisedBy: app.actorName,
      raisedAt: NOW,
    };
    app.dispatch({ type: "hq:assign", task });
    app.toastNow(`Assigned to ${targets.length} ${targets.length === 1 ? "store" : "stores"}`, "good");
    setTitle("");
  }

  const openTasks = app.hqTasks;
  const storesCovered = new Set(openTasks.flatMap((t) => t.storeIds)).size;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-ink">Store tasks</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Assigned this session" value={String(openTasks.length)} emphasis />
        <Stat label="Stores covered" value={`${storesCovered} of ${stores.length}`} />
        <Stat label="Needing a photo" value={String(openTasks.filter((t) => t.needsPhoto).length)} />
        <Stat label="Due inside 24h" value={String(openTasks.filter((t) => t.dueAt - NOW <= 24 * HOUR).length)} />
      </div>

      <Card>
        <SectionTitle title="Raise a task" />
        <div className="space-y-3">
          <input
            value={title}
            data-hq-title
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Install the festive window kit and send a photo"
            className="w-full rounded-lg border border-line bg-raised px-3 py-2.5 text-sm text-ink placeholder:text-muted"
          />

          <div className="flex items-end gap-3 flex-wrap">
            <Field label="From">
              <select value={desk} data-hq-desk onChange={(e) => setDesk(e.target.value)} className="border border-line bg-raised px-2 py-1.5 text-xs text-ink">
                {DESKS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Assign to">
              <select value={scope} data-hq-scope onChange={(e) => setScope(e.target.value as Scope)} className="border border-line bg-raised px-2 py-1.5 text-xs text-ink">
                <option value="estate">Every store</option>
                <option value="cluster">One cluster</option>
                <option value="store">One store</option>
              </select>
            </Field>

            {scope === "cluster" && (
              <Field label="Cluster">
                <select value={clusterId} data-hq-cluster onChange={(e) => setClusterId(e.target.value)} className="border border-line bg-raised px-2 py-1.5 text-xs text-ink">
                  {clusters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {scope === "store" && (
              <Field label="Store">
                <select value={storeId} data-hq-store onChange={(e) => setStoreId(e.target.value)} className="border border-line bg-raised px-2 py-1.5 text-xs text-ink">
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Due in">
              <select value={dueHours} data-hq-due onChange={(e) => setDueHours(Number(e.target.value))} className="border border-line bg-raised px-2 py-1.5 text-xs text-ink">
                {[4, 8, 24, 48, 72].map((h) => (
                  <option key={h} value={h}>
                    {h}h
                  </option>
                ))}
              </select>
            </Field>

            <label className="flex items-center gap-2 text-xs text-ink pb-1.5">
              <input type="checkbox" checked={needsPhoto} data-hq-photo onChange={(e) => setNeedsPhoto(e.target.checked)} />
              Photo to close
            </label>

            <button className="btn-primary !py-1.5 !text-xs" data-hq-assign disabled={!title.trim()} onClick={assign}>
              Assign to {targets.length} {targets.length === 1 ? "store" : "stores"}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Assigned" />
        {openTasks.length === 0 ? (
          <div className="text-sm text-ink2">Nothing assigned yet.</div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Task</Th>
                <Th>From</Th>
                <Th>Stores</Th>
                <Th>Due</Th>
                <Th>Photo</Th>
                <Th>Raised</Th>
              </tr>
            </thead>
            <tbody>
              {openTasks.map((t) => (
                <tr key={t.id} data-hq-row>
                  <Td className="text-ink">{t.title}</Td>
                  <Td>{t.from}</Td>
                  <Td className="text-ink2">
                    {t.storeIds.length === stores.length
                      ? "Every store"
                      : t.storeIds.length === 1
                      ? storeById(t.storeIds[0]).name
                      : `${t.storeIds.length} stores · ${clusterById(storeById(t.storeIds[0]).clusterId).name}`}
                  </Td>
                  <Td className="num text-xs">{fmtRunDate(t.dueAt)}</Td>
                  <Td>
                    {t.needsPhoto ? (
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot tone="warn" />
                        <span className="text-xs text-ink2">Required</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </Td>
                  <Td className="text-xs text-ink2">
                    {t.raisedBy} · {relTime(t.raisedAt, NOW)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      {children}
    </div>
  );
}
