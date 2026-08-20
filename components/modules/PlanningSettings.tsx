"use client";

// Planning settings — and the honest bit.
//
// Every threshold the planning layer runs on is listed here with where it came
// from. "Confirmed" means the client told us. "Invented" means we made it up so
// the thing would run, and it is waiting to be replaced by Praveen's Vector
// documentation. Nobody should be able to mistake one for the other.

import React from "react";
import { Callout, Card, Chip, SectionTitle, Stat, StatusDot, Table, Td, Th } from "@/components/ui";
import { CLUSTERS, CURRENT_SEASON } from "@/lib/seed";
import { PLANNING_BRAND, planningStores } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { ASSUMPTIONS, coreShareTarget, pct } from "@/lib/rules";

export default function PlanningSettings() {
  const app = useApp();
  const stores = planningStores();
  const invented = ASSUMPTIONS.filter((a) => a.basis === "invented").length;
  const confirmed = ASSUMPTIONS.filter((a) => a.basis === "confirmed");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Assumptions</h1>
          <p className="text-xs text-ink2 mt-1">{CURRENT_SEASON.name}</p>
        </div>
        <Chip tone={invented > 0 ? "warn" : "good"}>{invented} still invented</Chip>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Confirmed by AFL" value={String(confirmed.length)} tone="good" emphasis />
        <Stat label="Invented by us" value={String(invented)} tone="warn" />
        <Stat label="Clusters" value={String(CLUSTERS.filter((c) => stores.some((s) => s.clusterId === c.id)).length)} sub={`${stores.length} stores`} />
        <Stat label="Waiting on Vector" value={String(invented)} />
      </div>


      <Card>
        <SectionTitle title="Where every number comes from" />
        <Table>
          <thead>
            <tr>
              <Th>Setting</Th>
              <Th>Value</Th>
              <Th>Basis</Th>
              <Th>Source</Th>
            </tr>
          </thead>
          <tbody>
            {ASSUMPTIONS.map((a) => (
              <tr key={a.key} data-assumption={a.basis}>
                <Td>
                  <div className="flex items-center gap-2">
                    <StatusDot tone={a.basis === "confirmed" ? "good" : "warn"} />
                    <span className="text-ink">{a.label}</span>
                  </div>
                </Td>
                <Td className="num">{a.value}</Td>
                <Td>
                  <Chip tone={a.basis === "confirmed" ? "good" : "warn"}>{a.basis === "confirmed" ? "Confirmed" : "Invented"}</Chip>
                </Td>
                <Td>
                  <span className="text-xs text-ink2">{a.source}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>


      <Card>
        <SectionTitle title="Clusters" />
        <Table>
          <thead>
            <tr>
              <Th>Cluster</Th>
              <Th>Region</Th>
              <Th>Manager</Th>
              <Th>Cities</Th>
              <Th align="right">Stores</Th>
            </tr>
          </thead>
          <tbody>
            {CLUSTERS.filter((c) => stores.some((s) => s.clusterId === c.id)).map((c) => (
              <tr key={c.id} data-cluster-row>
                <Td>{c.name}</Td>
                <Td>{c.region}</Td>
                <Td className="text-ink2">{c.managerName}</Td>
                <Td className="text-ink2">{c.cities.join(", ")}</Td>
                <Td align="right" className="num">{stores.filter((s) => s.clusterId === c.id).length}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
