"use client";

// People — who to call about a store.
//
// The chain is region head → cluster manager → store manager → floor. Planning
// chases tasks and asks against stores, so the hierarchy has to be in the system
// rather than in somebody's phone.

import React, { useMemo, useState } from "react";
import { Card, Chip, SectionTitle, SortTh, Stat, StatusDot, Table, Td, Th, useSort } from "@/components/ui";
import StoreLink from "@/components/StoreLink";
import { PEOPLE, STORES, clusterById, personById, storeById } from "@/lib/seed";
import { planningStores } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { NOW } from "@/lib/seed";
import type { Person } from "@/lib/seed";

type Sort = "name" | "role" | "where" | "reports";

const ROLE_ORDER: Record<Person["role"], number> = {
  "Region head": 0,
  "Cluster manager": 1,
  "Store manager": 2,
  "Store staff": 3,
};

export default function People() {
  const app = useApp();
  const [q, setQ] = useState("");
  const [roleCut, setRoleCut] = useState<"all" | Person["role"]>("all");

  const scopeIds = useMemo(() => new Set(planningStores().map((s) => s.id)), []);

  // Only the people attached to the brand's estate — plus the region and
  // cluster layers above them, which are shared.
  const inScope = useMemo(
    () =>
      PEOPLE.filter((p) => {
        if (p.role === "Region head" || p.role === "Cluster manager") return true;
        return scopeIds.has(p.scope);
      }),
    [scopeIds],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inScope
      .filter((p) => roleCut === "all" || p.role === roleCut)
      .filter((p) => {
        if (!needle) return true;
        const where = whereFor(p);
        return p.name.toLowerCase().includes(needle) || p.role.toLowerCase().includes(needle) || where.toLowerCase().includes(needle) || p.phone.includes(needle);
      });
  }, [inScope, q, roleCut]);

  const sorter = useSort<Sort>("role", "asc");
  const sorted = sorter.sort(rows, (p, key) => {
    switch (key) {
      case "name": return p.name;
      case "role": return ROLE_ORDER[p.role];
      case "where": return whereFor(p);
      case "reports": return p.reportsTo ? personById(p.reportsTo)?.name ?? "" : "";
    }
  });

  function call(p: Person) {
    app.dispatch({
      type: "audit",
      entry: { at: NOW, actor: app.actorName, action: "Called", object: `${p.name} · ${p.role} · ${whereFor(p)}`, system: "Arvind One" },
    });
    app.toastNow(`Calling ${p.name} · ${p.phone}`, "info");
  }

  const counts = (role: Person["role"]) => inScope.filter((p) => p.role === role).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-ink">People</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Region heads" value={String(counts("Region head"))} emphasis />
        <Stat label="Cluster managers" value={String(counts("Cluster manager"))} />
        <Stat label="Store managers" value={String(counts("Store manager"))} />
        <Stat label="Floor staff" value={String(counts("Store staff"))} />
      </div>

      <Card pad={false}>
        <div className="p-3 flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="label mb-1">Search</div>
            <input
              value={q}
              data-people-search
              onChange={(e) => setQ(e.target.value)}
              placeholder="A name, a store, a role or a number"
              className="w-full border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-muted"
            />
          </div>
          <div>
            <div className="label mb-1">Level</div>
            <select
              value={roleCut}
              data-people-role
              onChange={(e) => setRoleCut(e.target.value as typeof roleCut)}
              className={`border bg-raised px-2 py-2 text-xs text-ink ${roleCut === "all" ? "border-line" : "border-[color:var(--brand)]"}`}
            >
              <option value="all">Everyone</option>
              <option value="Region head">Region heads</option>
              <option value="Cluster manager">Cluster managers</option>
              <option value="Store manager">Store managers</option>
              <option value="Store staff">Floor staff</option>
            </select>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle title="The chain" right={<Chip>{sorted.length}</Chip>} />
        <Table>
          <thead>
            <tr>
              <SortTh sortKey="name" sorter={sorter}>Name</SortTh>
              <SortTh sortKey="role" sorter={sorter}>Level</SortTh>
              <SortTh sortKey="where" sorter={sorter}>Where</SortTh>
              <SortTh sortKey="reports" sorter={sorter}>Reports to</SortTh>
              <Th>Phone</Th>
              <Th align="right">Call</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const store = STORES.find((s) => s.id === p.scope);
              return (
                <tr key={p.id} data-person={p.role}>
                  <Td className="text-ink">{p.name}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5">
                      <StatusDot tone={p.role === "Region head" ? "good" : p.role === "Cluster manager" ? "warn" : "neutral"} />
                      <span className="text-xs text-ink2">{p.role}</span>
                    </span>
                  </Td>
                  <Td>{store ? <StoreLink storeId={store.id} /> : <span className="text-ink2">{whereFor(p)}</span>}</Td>
                  <Td className="text-ink2">{p.reportsTo ? personById(p.reportsTo)?.name ?? "—" : "—"}</Td>
                  <Td className="num text-xs text-ink2">{p.phone}</Td>
                  <Td align="right">
                    <button className="btn !py-1 !text-2xs" data-person-call onClick={() => call(p)}>
                      Call
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

/** Where a person sits: a region, a cluster, or a store. */
function whereFor(p: Person): string {
  if (p.role === "Region head") return p.scope;
  if (p.role === "Cluster manager") return clusterById(p.scope)?.name ?? p.scope;
  return storeById(p.scope)?.name ?? p.scope;
}
