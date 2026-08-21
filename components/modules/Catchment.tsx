"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Catchment — where the customers actually come from, by pin code, from
// Capillary loyalty data.
//
// Everything on this screen is deterministic: bubble angles come from rng()
// seeded on the pin code, never Math.random(), so the map is identical on the
// server and the client.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { NOW, rng, storeById } from "@/lib/seed";
import { catchment, type CatchmentCell } from "@/lib/engine";
import { useApp } from "@/lib/state";
import {
  Callout,
  Card,
  Chip,
  Freshness,
  SectionTitle,
  Stat,
  Swatch,
  Table,
  Tabs,
  Td,
  Th,
  inr,
  pct,
} from "@/components/ui";

/** Sequential ramp — one hue, light to dark. Never a rainbow for a quantity. */
const SPEND_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#0d366b"];

const VIEW = 420;
const CENTRE = VIEW / 2;
const PLOT_RADIUS = 176;

/** FNV-1a — stable string hash so every pin code gets the same angle every time. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Penetration assumption, stated on screen: roughly 28% of a nearby area's
 * addressable base is already a customer, falling by ~0.8 points per km. The
 * gap between the addressable base and the mapped customers is the untapped
 * catchment.
 */
function addressableBase(cell: CatchmentCell): number {
  const penetration = Math.max(0.04, 0.28 - 0.008 * cell.distanceKm);
  return Math.round(cell.customers / penetration);
}

type Placed = CatchmentCell & { x: number; y: number; revenue: number; share: number; untapped: number; bin: number };
type LaunchView = "marketing" | "site";

export default function Catchment() {
  const app = useApp();
  const store = storeById(app.storeId);
  const cells = useMemo(() => catchment(app.storeId), [app.storeId]);

  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [ring, setRing] = useState<number>(0); // 0 = all
  const [launchView, setLaunchView] = useState<LaunchView>("marketing");
  const [built, setBuilt] = useState(false);

  const placed: Placed[] = useMemo(() => {
    const maxKm = Math.max(...cells.map((c) => c.distanceKm), 1);
    const maxSpend = Math.max(...cells.map((c) => c.spend));
    const minSpend = Math.min(...cells.map((c) => c.spend));
    const totalRevenue = cells.reduce((a, c) => a + c.customers * c.spend, 0);
    return cells.map((c) => {
      // Deterministic angle from the pin code — the same area sits in the same
      // place on every render, so the map can be read and pointed at.
      const angle = rng(hash(c.pincode))() * Math.PI * 2;
      const r = (c.distanceKm / maxKm) * PLOT_RADIUS;
      const revenue = c.customers * c.spend;
      const t = (c.spend - minSpend) / Math.max(1, maxSpend - minSpend);
      return {
        ...c,
        x: CENTRE + Math.cos(angle) * r,
        y: CENTRE + Math.sin(angle) * r,
        revenue,
        share: revenue / Math.max(1, totalRevenue),
        untapped: Math.max(0, addressableBase(c) - c.customers),
        bin: Math.min(SPEND_RAMP.length - 1, Math.floor(t * SPEND_RAMP.length)),
      };
    });
  }, [cells]);

  const maxKm = Math.max(...placed.map((p) => p.distanceKm), 1);
  const maxCustomers = Math.max(...placed.map((p) => p.customers), 1);
  const kmToPx = (km: number) => (km / maxKm) * PLOT_RADIUS;
  const bubbleR = (n: number) => 4 + Math.sqrt(n / maxCustomers) * 20;

  const totalCustomers = placed.reduce((a, p) => a + p.customers, 0);
  const within5 = placed.filter((p) => p.distanceKm <= 5);
  const topSpend = [...placed].sort((a, b) => b.spend - a.spend)[0];
  const untapped = placed.reduce((a, p) => a + p.untapped, 0);

  const visible = ring === 0 ? placed : placed.filter((p) => p.distanceKm <= ring);
  const ranked = [...visible].sort((a, b) => b.customers - a.customers);
  const active = placed.find((p) => p.pincode === (hover ?? selected)) ?? null;

  // Under-served: many customers, far from the store they currently travel to.
  const underServed = useMemo(() => {
    const far = placed.filter((p) => p.distanceKm > 5);
    return [...far]
      .map((p) => ({
        ...p,
        score: 0.6 * (p.customers / maxCustomers) + 0.4 * (p.distanceKm / maxKm),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [placed, maxCustomers, maxKm]);

  const reach = underServed.reduce((a, p) => a + p.customers, 0);
  const reachUntapped = underServed.reduce((a, p) => a + p.untapped, 0);

  function buildCampaign() {
    setBuilt(true);
    app.dispatch({
      type: "audit",
      entry: {
        at: NOW,
        actor: app.actorName,
        action: `Built launch campaign list — ${underServed.map((u) => u.area).join(", ")}`,
        object: `${reach.toLocaleString("en-IN")} customers`,
        system: "Arvind One",
      },
    });
    app.toastNow(
      `Campaign list built: ${reach.toLocaleString("en-IN")} mapped customers across ${underServed.length} pin codes · estimated reach ${(reach + reachUntapped).toLocaleString("en-IN")} including untapped base`,
      "good"
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-ink">Where to open next</h2>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone="brand">Source: loyalty ledger · {store.name}</Chip>
          <Freshness minutes={42} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Customers mapped" value={totalCustomers.toLocaleString("en-IN")} sub={`${placed.length} pin codes with at least one identified customer`} />
        <Stat
          label="Share within 5 km"
          value={pct(within5.reduce((a, p) => a + p.customers, 0) / Math.max(1, totalCustomers))}
        />
        <Stat label="Top area by spend" value={topSpend.area} sub={`${inr(topSpend.spend)} average spend per customer · ${topSpend.distanceKm} km out`} />
        <Stat
          label="Estimated untapped"
          value={untapped.toLocaleString("en-IN")}
          tone="warn"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,440px)_1fr] gap-4">
        {/* ── The map ── */}
        <Card>
          <SectionTitle
            title="Where they come from"
            right={
              <select
                className="rounded-md border border-line bg-raised px-2 py-1 text-xs"
                value={ring}
                onChange={(ev) => setRing(Number(ev.target.value))}
              >
                <option value={0}>All areas</option>
                <option value={5}>Within 5 km</option>
                <option value={15}>Within 15 km</option>
              </select>
            }
          />
          <div className="relative w-full max-w-[420px] mx-auto aspect-square">
            <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="w-full h-full">
              {[5, 15].map((km) => (
                <g key={km}>
                  <circle cx={CENTRE} cy={CENTRE} r={kmToPx(km)} fill="none" stroke="var(--grid)" strokeDasharray="4 4" />
                  <text x={CENTRE + kmToPx(km) - 4} y={CENTRE - 5} textAnchor="end" fontSize="10" fill="var(--text-muted)">
                    {km} km
                  </text>
                </g>
              ))}
              <circle cx={CENTRE} cy={CENTRE} r={kmToPx(maxKm)} fill="none" stroke="var(--grid)" />
              {placed.map((p) => {
                const dim = ring !== 0 && p.distanceKm > ring;
                const isActive = active?.pincode === p.pincode;
                return (
                  <circle
                    key={p.pincode}
                    cx={p.x}
                    cy={p.y}
                    r={bubbleR(p.customers)}
                    fill={SPEND_RAMP[p.bin]}
                    stroke={isActive ? "var(--brand)" : "rgba(11,11,11,0.18)"}
                    strokeWidth={isActive ? 2.5 : 1}
                    opacity={dim ? 0.2 : 0.92}
                    className="cursor-pointer"
                    onMouseEnter={() => setHover(p.pincode)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setSelected(selected === p.pincode ? null : p.pincode)}
                  >
                    <title>{`${p.area} ${p.pincode} — ${p.customers} customers, ${inr(p.spend)} avg spend, ${p.distanceKm} km`}</title>
                  </circle>
                );
              })}
              {/* The store itself, at the centre */}
              <path d={`M${CENTRE} ${CENTRE - 9} L${CENTRE + 8} ${CENTRE + 6} L${CENTRE - 8} ${CENTRE + 6} Z`} fill="var(--brand)" />
              <text x={CENTRE} y={CENTRE + 20} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-primary)">
                {store.name}
              </text>
            </svg>

            {active && (
              <div
                className="absolute card p-2 shadow-pop text-2xs pointer-events-none z-10 w-44"
                style={{ left: `${(active.x / VIEW) * 100}%`, top: `${(active.y / VIEW) * 100}%`, transform: "translate(-50%, -120%)" }}
              >
                <div className="font-semibold text-ink">{active.area}</div>
                <div className="text-muted num">{active.pincode} · {active.distanceKm} km</div>
                <div className="num mt-1 text-ink2">{active.customers.toLocaleString("en-IN")} customers</div>
                <div className="num text-ink2">{inr(active.spend)} avg spend</div>
                <div className="num text-ink2">{pct(active.share, 1)} of store revenue</div>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="label">Average spend</span>
            {SPEND_RAMP.map((hex, i) => (
              <Swatch key={hex} hex={hex} label={i === 0 ? "lower" : i === SPEND_RAMP.length - 1 ? "higher" : undefined} />
            ))}
            <span className="text-2xs text-muted">· bubble area = customers · ▲ = this store</span>
          </div>
        </Card>

        {/* ── Ranked areas ── */}
        <Card>
          <SectionTitle
            title="Areas, ranked"
            sub={`${ranked.length} pin codes${ring ? ` within ${ring} km` : ""}. Share of store revenue is customers × average spend for the area, over the same total for every mapped area.`}
          />
          <Table>
            <thead>
              <tr>
                <Th>Pin code</Th>
                <Th>Area</Th>
                <Th align="right">Customers</Th>
                <Th align="right">Avg spend</Th>
                <Th align="right">Distance</Th>
                <Th align="right">Share of store revenue</Th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((p) => (
                <tr
                  key={p.pincode}
                  className={`cursor-pointer hover:bg-[color:var(--plane)] ${selected === p.pincode ? "bg-[color:var(--brand-soft)]" : ""}`}
                  onMouseEnter={() => setHover(p.pincode)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setSelected(selected === p.pincode ? null : p.pincode)}
                >
                  <Td className="num text-ink2">{p.pincode}</Td>
                  <Td>{p.area}</Td>
                  <Td align="right" className="num">{p.customers.toLocaleString("en-IN")}</Td>
                  <Td align="right" className="num">{inr(p.spend)}</Td>
                  <Td align="right" className="num">{p.distanceKm} km</Td>
                  <Td align="right" className="num">{pct(p.share, 1)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      {/* ── Launch use case ── */}
      <Card>
        <SectionTitle
          title="New store launch — the three areas to act on"
          right={
            <Tabs
              value={launchView}
              onChange={setLaunchView}
              options={[
                { id: "marketing", label: "Marketing target list" },
                { id: "site", label: "Site-selection signal" },
              ]}
            />
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {underServed.map((u, i) => (
            <div key={u.pincode} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-ink">{u.area}</div>
                <Chip tone={i === 0 ? "brand" : "neutral"}>#{i + 1}</Chip>
              </div>
              <div className="text-2xs text-muted num mt-0.5">{u.pincode} · {u.distanceKm} km from {store.name}</div>
              {launchView === "marketing" ? (
                <ul className="text-xs text-ink2 mt-2 space-y-1 leading-relaxed">
                  <li className="num">{u.customers.toLocaleString("en-IN")} identified customers, {inr(u.spend)} average spend</li>
                  <li className="num">{pct(u.share, 1)} of this store&apos;s revenue already comes from here</li>
                  <li>Addressable for a launch offer: <span className="num">{(u.customers + u.untapped).toLocaleString("en-IN")}</span> including untapped base</li>
                </ul>
              ) : (
                <ul className="text-xs text-ink2 mt-2 space-y-1 leading-relaxed">
                  <li className="num">{u.customers.toLocaleString("en-IN")} customers currently travelling {u.distanceKm} km to buy</li>
                  <li className="num">{u.untapped.toLocaleString("en-IN")} estimated untapped at the stated penetration curve</li>
                  <li>
                    Cannibalisation risk: <span className="num">{pct(u.share, 1)}</span> of this store&apos;s revenue would be in the new
                    catchment — net gain must clear that.
                  </li>
                </ul>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <button className="btn-primary" onClick={buildCampaign}>
            Build a launch campaign list
          </button>
          {built && (
            <Chip tone="good">
              List built · {reach.toLocaleString("en-IN")} customers · estimated reach {(reach + reachUntapped).toLocaleString("en-IN")}
            </Chip>
          )}
        </div>
      </Card>

      <Callout tone="warn" title="Directional only">
        Pin code is optional on most bills, so the mapped base under-counts, unevenly by store. Trust the ranking of areas, not
        the counts. Untapped uses a stated penetration curve — 28% at the store, falling ~0.8 points per km.
      </Callout>
    </div>
  );
}
