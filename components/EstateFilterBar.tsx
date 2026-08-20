"use client";

// The estate filter bar, shared by every planning screen that reads the estate.
//
// It lives in one component because the filters are shared state: Inventory used
// to inherit Store 360's narrowing with no control on screen, so "3 stores" had
// no visible explanation. Wherever the filters apply, the bar is there.

import React from "react";
import { Card, Chip } from "@/components/ui";
import { NO_FILTERS, filtersActive, planningStores } from "@/lib/engine";
import { CLUSTERS } from "@/lib/seed";
import { useApp } from "@/lib/state";

export default function EstateFilterBar() {
  const app = useApp();
  const { filters } = app.estate;
  const stores = planningStores();
  const clusters = CLUSTERS.filter((c) => stores.some((s) => s.clusterId === c.id));
  const regions = [...new Set(stores.map((s) => s.region))].sort();
  const narrowed = filtersActive(filters);

  return (
    <Card pad={false}>
      <div className="p-3 flex items-end gap-3 flex-wrap">
        <Filter label="Region" name="region" value={filters.region} onChange={(v) => app.setFilter({ region: v })} options={regions.map((r) => [r, r])} />
        <Filter label="Cluster" name="cluster" value={filters.cluster} onChange={(v) => app.setFilter({ cluster: v })} options={clusters.map((c) => [c.id, c.name])} />
        <Filter label="Grade" name="grade" value={filters.grade} onChange={(v) => app.setFilter({ grade: v })} options={[["A", "A"], ["B", "B"], ["C", "C"]]} />
        <Filter
          label="Fill rate"
          name="band"
          value={filters.band}
          onChange={(v) => app.setFilter({ band: v })}
          options={[["thin", "Below band"], ["healthy", "In band"], ["heavy", "Above band"]]}
        />
        {narrowed > 0 && (
          <button className="btn !py-1.5 !text-xs" data-clear-filters onClick={() => app.setFilter(NO_FILTERS)}>
            Clear
          </button>
        )}
      </div>
    </Card>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
  name,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  name: string;
}) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <select
        value={value}
        data-filter={name}
        onChange={(e) => onChange(e.target.value)}
        className={`border bg-raised px-2 py-1.5 text-xs text-ink ${
          value === "all" ? "border-line" : "border-[color:var(--brand)] text-[color:var(--brand)]"
        }`}
      >
        <option value="all">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
