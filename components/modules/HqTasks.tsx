"use client";

// Store tasks — the head-office end of what a store sees as "From HQ".
//
// Stores already receive these; this is where they are raised and assigned.
// Assign to the whole estate, a cluster, or one door.

import React, { useMemo, useState } from "react";
import { Card, Chip, SectionTitle, Stat, StatusDot, Table, Td, Th, fmtRunDate, relTime } from "@/components/ui";
import { filterStores, planningStores } from "@/lib/engine";
import { CLUSTERS, HOUR, NOW, SEEDED_HQ_TASKS, clusterById, storeById } from "@/lib/seed";
import { useApp } from "@/lib/state";

import type { HqAssignment } from "@/lib/types";

const DESKS = ["VM", "Retail Ops", "Commercial", "Planning", "Admin", "Training"];

const hash = (s: string) => {
  let h = 5;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
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

  const [q, setQ] = useState("");
  // What was raised before this session, so the screen opens with a history.
  const all = useMemo(() => [...app.hqTasks, ...SEEDED_HQ_TASKS], [app.hqTasks]);
  const openTasks = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(
      (t) =>
        !needle ||
        t.title.toLowerCase().includes(needle) ||
        t.from.toLowerCase().includes(needle) ||
        t.raisedBy.toLowerCase().includes(needle) ||
        t.storeIds.some((id) => storeById(id).name.toLowerCase().includes(needle)),
    );
  }, [all, q]);
  const storesCovered = new Set(all.flatMap((t) => t.storeIds)).size;

  /** Deterministic completion, so a task list has a real status spread. */
  function statusOf(t: HqAssignment) {
    if (t.dueAt > NOW && app.hqTasks.some((x) => x.id === t.id)) return { label: "Open", tone: "warn" as const, done: 0 };
    const done = (hash(t.id) % (t.storeIds.length + 1));
    if (done === t.storeIds.length) return { label: "Done", tone: "good" as const, done };
    if (t.dueAt < NOW) return { label: "Overdue", tone: "critical" as const, done };
    return { label: "In progress", tone: "warn" as const, done };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-ink">Store tasks</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Tasks" value={String(all.length)} emphasis />
        <Stat label="Stores covered" value={`${storesCovered} of ${stores.length}`} />
        <Stat label="Overdue" value={String(all.filter((t) => statusOf(t).label === "Overdue").length)} tone="critical" />
        <Stat label="Due inside 24h" value={String(all.filter((t) => t.dueAt > NOW && t.dueAt - NOW <= 24 * HOUR).length)} />
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
        <SectionTitle title="Tasks" />
        <div className="mb-3">
          <input
            value={q}
            data-hq-search
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a task, a store, a desk or who raised it"
            className="w-full rounded-lg border border-line bg-raised px-3 py-2.5 text-sm text-ink placeholder:text-muted"
          />
        </div>
        {openTasks.length === 0 ? (
          <div className="text-sm text-ink2">Nothing matches.</div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Task</Th>
                <Th>From</Th>
                <Th>Stores</Th>
                <Th align="right">Done</Th>
                <Th>Status</Th>
                <Th>Due</Th>
                <Th>Raised by</Th>
                <Th align="right">Chase</Th>
              </tr>
            </thead>
            <tbody>
              {openTasks.map((t) => {
                const st = statusOf(t);
                const lead = storeById(t.storeIds[0]);
                return (
                  <tr key={t.id} data-hq-row={st.label.toLowerCase()}>
                    <Td className="text-ink">{t.title}</Td>
                    <Td>{t.from}</Td>
                    <Td className="text-ink2">
                      {t.storeIds.length === stores.length
                        ? "Every store"
                        : t.storeIds.length === 1
                        ? lead.name
                        : `${t.storeIds.length} · ${clusterById(lead.clusterId).name}`}
                    </Td>
                    <Td align="right" className="num">
                      {st.done} of {t.storeIds.length}
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot tone={st.tone} />
                        <span className="text-xs text-ink2">{st.label}</span>
                      </span>
                    </Td>
                    <Td className="num text-xs">{fmtRunDate(t.dueAt)}</Td>
                    <Td className="text-xs text-ink2">
                      {t.raisedBy} · {relTime(t.raisedAt, NOW)}
                    </Td>
                    <Td align="right">
                      {st.label === "Done" ? (
                        <span className="text-muted text-xs">—</span>
                      ) : (
                        <button
                          className="btn !py-1 !text-2xs"
                          data-hq-call
                          onClick={() => {
                            app.dispatch({
                              type: "audit",
                              entry: {
                                at: NOW,
                                actor: app.actorName,
                                action: "Called about a task",
                                object: `${clusterById(lead.clusterId).managerName} · ${t.title}`,
                                system: "Arvind One",
                              },
                            });
                            app.toastNow(`Calling ${clusterById(lead.clusterId).managerName} — ${clusterById(lead.clusterId).name}`, "info");
                          }}
                        >
                          Call {clusterById(lead.clusterId).managerName.split(" ")[0]}
                        </button>
                      )}
                    </Td>
                  </tr>
                );
              })}
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
