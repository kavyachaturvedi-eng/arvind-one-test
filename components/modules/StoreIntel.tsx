"use client";

// Store intelligence — the layer above execution.
//
// Billing, stock checks and orders tell a store what happened. This tells it
// what to do about it: which category is holding floor it has not earned, which
// style the rest of the cluster sells and this door does not, and who on the
// team is behind on units per bill.
//
// Every panel ends in an action or a name. A number with nothing to do about it
// does not belong on this screen.

import React, { useMemo, useState } from "react";
import {
  Card,
  Chip,
  Empty,
  Meter,
  SectionTitle,
  SortTh,
  Stat,
  StatusDot,
  Table,
  Td,
  Th,
  inr,
  pct,
  useSort,
} from "@/components/ui";
import StoreLink from "@/components/StoreLink";
import Trust from "@/components/Trust";
import {
  categoryMix,
  planningStores,
  priceBandMix,
  pushList,
  spaceVsSales,
  storeIntel,
  uptPosition,
  vmFor,
  type MixRow,
} from "@/lib/engine";
import { MIX_GAP_LABEL, UPT_TARGET } from "@/lib/rules";
import { storeById } from "@/lib/seed";
import { useApp } from "@/lib/state";

export default function StoreIntel() {
  const app = useApp();
  if (app.role === "planner" || app.role === "catplan" || app.role === "leadership") return <EstateIntel />;
  return <StoreCockpit storeId={app.storeId} />;
}

// ── The store manager's cockpit ──────────────────────────────────────────────

type Cut = "category" | "price";

export function StoreCockpit({ storeId }: { storeId: string }) {
  const app = useApp();
  const store = storeById(storeId);
  const [cut, setCut] = useState<Cut>("category");

  const cats = useMemo(() => categoryMix([store]), [store]);
  const bands = useMemo(() => priceBandMix([store]), [store]);
  const rows = cut === "category" ? cats : bands;
  const space = useMemo(() => spaceVsSales(storeId), [storeId]);
  const push = useMemo(() => pushList(storeId, 6), [storeId]);
  const team = useMemo(() => uptPosition(storeId), [storeId]);
  const vm = useMemo(() => vmFor(storeId, app.vm[storeId]), [storeId, app.vm]);

  const pushes = cats.filter((c) => c.verdict === "push");
  const feeds = cats.filter((c) => c.verdict === "feed");
  const worstSpace = space[0];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">What to fix today</h1>
          <p className="text-sm text-ink2 mt-1">{store.name}</p>
        </div>
      </div>

      {/* Two or three things, chosen by what they are worth. Not a dashboard. */}
      <Card>
        <SectionTitle title="Today" />
        <div className="space-y-2">
          {pushes[0] && (
            <Focus
              tone="warn"
              headline={`Push ${pushes[0].label}`}
              body={`${pct(pushes[0].invShare)} of the floor, ${pct(pushes[0].salesShare)} of the sales. ${pushes[0].invUnits.toLocaleString("en-IN")} units on hand.`}
            />
          )}
          {team.upside > 0 && (
            <Focus
              tone={team.upt < team.network ? "critical" : "warn"}
              headline={`UPT ${team.upt.toFixed(2)} against ${UPT_TARGET.toFixed(1)}`}
              body={`Network is on ${team.network.toFixed(2)}. Closing it is ${team.upside.toLocaleString("en-IN")} more units a month at today's bill count.${team.laggards[0] ? ` Start with ${team.laggards[0].name}.` : ""}`}
            />
          )}
          {push[0] && (
            <Focus
              tone="warn"
              headline={`${push[0].style.name} sells here at ${push[0].storeRos.toFixed(1)}/day`}
              body={`The cluster does ${push[0].peerRos.toFixed(1)}. ${push[0].sellable} units already on the floor — worth ${inr(push[0].upside, { compact: true })} a fortnight.`}
            />
          )}
          {vm.missing.length > 0 && (
            <Focus
              tone={vm.score < 0.6 ? "critical" : "warn"}
              headline={`VM at ${pct(vm.score)}`}
              body={`${vm.missing.map((m) => m.label).join(", ")} still open.`}
            />
          )}
          {pushes.length === 0 && team.upside === 0 && push.length === 0 && vm.missing.length === 0 && (
            <Empty title="Nothing needs a decision today" />
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Over-invested categories" value={String(pushes.length)} tone={pushes.length ? "warn" : "good"} emphasis />
        <Stat label="Selling ahead of stock" value={String(feeds.length)} tone={feeds.length ? "warn" : undefined} />
        <Stat label="UPT" value={team.upt.toFixed(2)} tone={team.upt >= team.network ? "good" : "critical"} sub={`Network ${team.network.toFixed(2)}`} />
        <Stat label="Styles to push" value={String(push.length)} />
        <Stat label="VM adherence" value={pct(vm.score)} tone={vm.score >= 0.85 ? "good" : vm.score >= 0.6 ? "warn" : "critical"} />
      </div>

      <Card>
        <SectionTitle
          title="Stock against sales"
          right={
            <div className="flex items-center gap-2">
              <Trust inputs={["soh", "sales"]} />
              <div className="flex">
                {(["category", "price"] as Cut[]).map((c) => (
                  <button
                    key={c}
                    data-cut={c}
                    onClick={() => setCut(c)}
                    className={`chip !text-2xs ${cut === c ? "!border-[color:var(--brand)] !text-[color:var(--brand)]" : ""}`}
                  >
                    {c === "category" ? "Category" : "Price point"}
                  </button>
                ))}
              </div>
            </div>
          }
        />
        <MixTable rows={rows} />
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Card>
          <SectionTitle
            title="Floor space against sales"
            right={<Trust inputs={["space", "sales"]} />}
          />
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th align="right">Bays</Th>
                <Th align="right">Space</Th>
                <Th align="right">Sales</Th>
                <Th align="right">Gap</Th>
              </tr>
            </thead>
            <tbody>
              {space.map((r) => (
                <tr key={r.category} data-space-row>
                  <Td className="text-ink">{r.category}</Td>
                  <Td align="right" className="num text-xs text-ink2">{r.bays}</Td>
                  <Td align="right" className="num text-xs">{pct(r.spaceShare)}</Td>
                  <Td align="right" className="num text-xs">{pct(r.salesShare)}</Td>
                  <Td align="right">
                    <span className="inline-flex items-center gap-1.5 num text-xs">
                      {r.verdict !== "in_line" && <StatusDot tone={r.verdict === "push" ? "warn" : "good"} />}
                      {r.gap > 0 ? "+" : ""}{pct(r.gap)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {worstSpace && worstSpace.gap > 0 && (
            <div className="mt-2 text-xs text-ink2">
              {worstSpace.category} holds {worstSpace.bays} {worstSpace.bays === 1 ? "bay" : "bays"} for {pct(worstSpace.salesShare)} of sales.
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle title="Push these here" right={<Trust inputs={["soh", "sales"]} />} />
          {push.length === 0 ? (
            <Empty title="Nothing the cluster sells better" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>SKU</Th>
                  <Th>Style</Th>
                  <Th align="right">Here</Th>
                  <Th align="right">Cluster</Th>
                  <Th align="right">On floor</Th>
                  <Th align="right">A fortnight</Th>
                </tr>
              </thead>
              <tbody>
                {push.map((r) => (
                  <tr key={r.style.id} data-push-row>
                    <Td className="num text-xs text-ink2">{r.style.id}</Td>
                    <Td className="text-ink">{r.style.name}<span className="text-ink2"> · {r.style.colour}</span></Td>
                    <Td align="right" className="num text-xs" style={{ color: "var(--status-critical)" }}>{r.storeRos.toFixed(1)}</Td>
                    <Td align="right" className="num text-xs">{r.peerRos.toFixed(1)}</Td>
                    <Td align="right" className="num text-xs">{r.sellable}</Td>
                    <Td align="right" className="num text-xs">{inr(r.upside, { compact: true })}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle
          title="The team on units per bill"
          right={
            <div className="flex items-center gap-2">
              <Trust inputs={["staff", "sales"]} />
              <Chip tone={team.upt >= team.network ? "good" : "warn"}>{team.upt.toFixed(2)} · network {team.network.toFixed(2)}</Chip>
            </div>
          }
        />
        {team.laggards.length === 0 ? (
          <Empty title="Nobody is behind the bar" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Who</Th>
                <Th>Level</Th>
                <Th align="right">Bills</Th>
                <Th align="right">UPT</Th>
                <Th align="right">Units a month</Th>
                <Th>Against the bar</Th>
              </tr>
            </thead>
            <tbody>
              {team.laggards.map((l) => (
                <tr key={l.name} data-laggard>
                  <Td className="text-ink">{l.name}</Td>
                  <Td className="text-xs text-ink2">{l.role}</Td>
                  <Td align="right" className="num text-xs">{l.bills}</Td>
                  <Td align="right" className="num text-xs" style={{ color: "var(--status-critical)" }}>{l.upt.toFixed(2)}</Td>
                  <Td align="right" className="num text-xs">{l.behind}</Td>
                  <Td><Meter value={l.upt} target={Math.min(UPT_TARGET, team.network)} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Focus({ tone, headline, body }: { tone: "warn" | "critical"; headline: string; body: string }) {
  return (
    <div className="flex gap-2.5 items-start border-l-2 pl-3 py-0.5" style={{ borderColor: tone === "critical" ? "var(--status-critical)" : "var(--status-warn)" }}>
      <div>
        <div className="text-sm font-medium text-ink">{headline}</div>
        <div className="text-xs text-ink2 mt-0.5 leading-relaxed">{body}</div>
      </div>
    </div>
  );
}

export function MixTable({ rows }: { rows: MixRow[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Cut</Th>
          <Th align="right">On floor</Th>
          <Th align="right">Share of stock</Th>
          <Th align="right">Sold 28d</Th>
          <Th align="right">Share of sales</Th>
          <Th align="right">Gap</Th>
          <Th align="right">Cover</Th>
          <Th>Call</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} data-mix-row={r.verdict}>
            <Td className="text-ink">{r.label}</Td>
            <Td align="right" className="num text-xs">{r.invUnits.toLocaleString("en-IN")}</Td>
            <Td align="right" className="num text-xs">{pct(r.invShare)}</Td>
            <Td align="right" className="num text-xs">{r.soldUnits.toLocaleString("en-IN")}</Td>
            <Td align="right" className="num text-xs">{pct(r.salesShare)}</Td>
            <Td align="right" className="num text-xs" style={{ color: r.verdict === "push" ? "var(--status-critical)" : undefined }}>
              {r.gap > 0 ? "+" : ""}{pct(r.gap)}
            </Td>
            <Td align="right" className="num text-xs">{Number.isFinite(r.cover) ? `${Math.round(r.cover)}d` : "—"}</Td>
            <Td>
              {r.verdict === "in_line" ? (
                <span className="text-xs text-muted">In line</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-ink2">
                  <StatusDot tone={r.verdict === "push" ? "warn" : "good"} />
                  {MIX_GAP_LABEL[r.verdict]}
                </span>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

// ── The estate view of the same thing ────────────────────────────────────────

type IntelSort = "store" | "gap" | "upt" | "vm" | "push";

function EstateIntel() {
  const app = useApp();
  const stores = planningStores();
  const rows = useMemo(() => storeIntel(stores, app.vm), [stores, app.vm]);

  const sorter = useSort<IntelSort>("gap");
  const sorted = sorter.sort(rows, (r, key) => {
    switch (key) {
      case "store": return r.store.name;
      case "gap": return r.topGap?.gap ?? -1;
      case "upt": return r.upt;
      case "vm": return r.vmScore;
      case "push": return r.pushCount;
    }
  });

  const behind = rows.filter((r) => r.upt < r.uptNetwork).length;
  const overInvested = rows.filter((r) => r.topGap).length;
  const vmBehind = rows.filter((r) => r.vmScore < 0.85).length;
  const network = rows[0]?.uptNetwork ?? 0;
  // The same finding in many doors is a buying problem, not a store problem.
  const pattern = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => {
      if (r.topGap) counts.set(r.topGap.label, (counts.get(r.topGap.label) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Store intelligence</h1>
          <p className="text-sm text-ink2 mt-1">{stores.length} stores</p>
        </div>
        <Trust inputs={["soh", "sales", "staff"]} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Doors over-invested" value={`${overInvested}/${rows.length}`} tone={overInvested > rows.length / 2 ? "warn" : undefined} emphasis />
        <Stat label="Below network UPT" value={`${behind}/${rows.length}`} tone={behind ? "warn" : "good"} />
        <Stat label="Network UPT" value={network.toFixed(2)} sub={`Target ${UPT_TARGET.toFixed(1)}`} />
        <Stat label="VM below 85%" value={String(vmBehind)} tone={vmBehind ? "warn" : "good"} />
        <Stat label="Units a month on UPT" value={rows.reduce((a, r) => a + r.uptUpside, 0).toLocaleString("en-IN")} />
      </div>

      {pattern && pattern[1] > 2 && (
        <Card>
          <SectionTitle title="A pattern, not a door" />
          <p className="text-sm text-ink2 leading-relaxed">
            {pattern[0]} is the biggest over-investment in {pattern[1]} of {rows.length} stores. At that spread it is a buy or an
            allocation question, not something {pattern[1]} managers can each fix on the floor.
          </p>
        </Card>
      )}

      <Card>
        <SectionTitle title="Every door" />
        <Table>
          <thead>
            <tr>
              <SortTh sortKey="store" sorter={sorter}>Store</SortTh>
              <SortTh sortKey="gap" sorter={sorter}>Biggest over-investment</SortTh>
              <SortTh sortKey="upt" sorter={sorter} align="right">UPT</SortTh>
              <Th align="right">Units a month</Th>
              <SortTh sortKey="push" sorter={sorter} align="right">Categories to push</SortTh>
              <Th>Space</Th>
              <SortTh sortKey="vm" sorter={sorter} align="right">VM</SortTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.store.id} data-intel-row>
                <Td><StoreLink storeId={r.store.id} /></Td>
                <Td>
                  {r.topGap ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink2">
                      <StatusDot tone="warn" />
                      {r.topGap.label} · {pct(r.topGap.invShare)} of stock, {pct(r.topGap.salesShare)} of sales
                    </span>
                  ) : (
                    <span className="text-xs text-muted">In line</span>
                  )}
                </Td>
                <Td align="right" className="num text-xs" style={{ color: r.upt < r.uptNetwork ? "var(--status-critical)" : undefined }}>
                  {r.upt.toFixed(2)}
                </Td>
                <Td align="right" className="num text-xs">{r.uptUpside}</Td>
                <Td align="right" className="num text-xs">{r.pushCount}</Td>
                <Td className="text-xs text-ink2">{r.spaceGap ? `${r.spaceGap.category} +${pct(r.spaceGap.gap)}` : "—"}</Td>
                <Td align="right" className="num text-xs" style={{ color: r.vmScore < 0.6 ? "var(--status-critical)" : undefined }}>{pct(r.vmScore)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
