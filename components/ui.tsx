"use client";

import React, { useEffect, useRef, useState } from "react";
import { inr, pct } from "@/lib/rules";

// ── Primitives ───────────────────────────────────────────────────────────────

export function Card({
  children,
  className = "",
  pad = true,
}: {
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return <div className={`card ${pad ? "p-4" : ""} ${className}`}>{children}</div>;
}

export function SectionTitle({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-3">
      <div>
        <h2 className="text-[15px] font-semibold text-ink leading-tight">{title}</h2>
        {sub && <p className="text-xs text-ink2 mt-0.5 max-w-2xl leading-relaxed">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Chip({
  children,
  tone = "neutral",
  icon,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "serious" | "critical" | "brand";
  icon?: React.ReactNode;
}) {
  const map: Record<string, string> = {
    neutral: "text-ink2 bg-[color:var(--plane)]",
    good: "text-[color:var(--success-text)] bg-[var(--ok-soft)] border-[#CBDDD3]",
    warn: "text-[#9A6700] bg-[var(--warn-soft)] border-[#E5D9BC]",
    serious: "text-[#B4552D] bg-[var(--serious-soft)] border-[#E9D0C2]",
    critical: "text-[#C0392B] bg-[var(--crit-soft)] border-[#E8CBC6]",
    brand: "text-[color:var(--brand)] bg-[color:var(--brand-soft)] border-transparent",
  };
  return (
    <span className={`chip ${map[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

/** Status is never carried by colour alone — icon + label, per the accessibility rule. */
export function StatusDot({ tone }: { tone: "good" | "warn" | "serious" | "critical" | "neutral" }) {
  const c: Record<string, string> = {
    good: "var(--status-good)",
    warn: "var(--status-warning)",
    serious: "var(--status-serious)",
    critical: "var(--status-critical)",
    neutral: "var(--text-muted)",
  };
  return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: c[tone] }} aria-hidden />;
}

export function Delta({ value, invert = false, suffix = "" }: { value: number; invert?: boolean; suffix?: string }) {
  const positive = value >= 0;
  const good = invert ? !positive : positive;
  return (
    <span
      className="text-xs font-semibold num"
      style={{ color: good ? "var(--success-text)" : "var(--status-critical)" }}
    >
      {positive ? "▲" : "▼"} {Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  );
}

// ── Freshness stamp — the answer to the 9 PM refresh ─────────────────────────

export function Freshness({ minutes, label = "as of" }: { minutes: number; label?: string }) {
  const tone = minutes <= 30 ? "good" : minutes <= 240 ? "warn" : "critical";
  const text =
    minutes < 60 ? `${Math.round(minutes)} min ago` : minutes < 1440 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} d ago`;
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs text-muted font-medium">
      <StatusDot tone={tone as "good" | "warn" | "critical"} />
      {label} {text}
    </span>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────────────

export function Stat({
  label,
  value,
  sub,
  tone,
  spark,
  freshness,
  onClick,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: "good" | "warn" | "serious" | "critical";
  spark?: number[];
  freshness?: number;
  onClick?: () => void;
  emphasis?: boolean;
}) {
  const border =
    tone === "critical"
      ? "border-[color:var(--status-critical)]"
      : tone === "warn"
      ? "border-[color:var(--status-warning)]"
      : "border-line";
  const Wrapper: React.ElementType = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`card p-3.5 text-left w-full ${border} ${onClick ? "hover:shadow-pop transition-shadow cursor-pointer" : ""}`}
    >
      {/* No status dot: the tile border already carries the tone, and a second
          mark for the same signal was noise. */}
      <div className="label">{label}</div>
      <div className={`${emphasis ? "text-[32px]" : "text-[26px]"} font-semibold text-ink leading-none mt-2 num`}>{value}</div>
      {sub && <div className="text-xs text-ink2 mt-1.5 leading-snug">{sub}</div>}
      {spark && (
        <div className="mt-2.5">
          <Sparkline data={spark} />
        </div>
      )}
      {freshness !== undefined && (
        <div className="mt-2">
          <Freshness minutes={freshness} />
        </div>
      )}
    </Wrapper>
  );
}

// ── Charts (inline SVG, one axis, thin marks) ────────────────────────────────

export function Sparkline({
  data,
  height = 30,
  color = "var(--series-1)",
  showArea = true,
}: {
  data: number[];
  height?: number;
  color?: string;
  showArea?: boolean;
}) {
  if (!data.length) return null;
  const w = 120;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((d, i) => [(i / (data.length - 1)) * w, height - ((d - min) / range) * (height - 4) - 2]);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${path} L${w},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden>
      {showArea && <path d={area} fill={color} opacity={0.1} />}
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.5} fill={color} />
    </svg>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  tone?: string;
  note?: string;
}

export function BarChart({
  data,
  format = (n: number) => n.toFixed(0),
  color = "var(--series-1)",
  height = 8,
  max: maxOverride,
}: {
  data: BarDatum[];
  format?: (n: number) => string;
  color?: string;
  height?: number;
  max?: number;
}) {
  const max = maxOverride ?? Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="grid grid-cols-[minmax(96px,34%)_1fr_auto] gap-3 items-center">
          <div className="text-xs text-ink2 truncate" title={d.label}>
            {d.label}
          </div>
          <div className="relative rounded-full bg-[color:var(--plane)]" style={{ height }}>
            <div
              className="absolute left-0 top-0 rounded-full"
              style={{ width: `${(Math.abs(d.value) / max) * 100}%`, height, background: d.tone ?? color }}
            />
          </div>
          <div className="text-xs font-semibold text-ink num w-16 text-right">{format(d.value)}</div>
        </div>
      ))}
    </div>
  );
}

/** Grouped columns with a hover tooltip — used for period comparisons. */
export function ColumnChart({
  categories,
  series,
  format = (n: number) => n.toFixed(0),
  height = 150,
}: {
  categories: string[];
  series: { name: string; color: string; values: number[] }[];
  format?: (n: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const groupW = 100 / categories.length;
  const barW = (groupW * 0.62) / series.length;

  return (
    <div className="relative">
      <div className="relative" style={{ height }}>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <div key={g} className="absolute left-0 right-0 border-t" style={{ bottom: `${g * 100}%`, borderColor: "var(--grid)" }} />
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height={height} className="relative">
          {categories.map((_, ci) =>
            series.map((s, si) => {
              const v = s.values[ci] ?? 0;
              const h = (v / max) * 96;
              const x = ci * groupW + groupW * 0.19 + si * barW;
              return (
                <rect
                  key={`${ci}-${si}`}
                  x={x}
                  y={100 - h}
                  width={barW - 0.6}
                  height={Math.max(0.6, h)}
                  fill={s.color}
                  rx={0.8}
                  onMouseEnter={() => setHover(ci)}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })
          )}
        </svg>
      </div>
      <div className="flex mt-1.5">
        {categories.map((c, i) => (
          <div key={c} className="text-2xs text-muted text-center truncate px-0.5" style={{ width: `${groupW}%` }}>
            {c}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-2.5">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5 text-2xs text-ink2">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      {hover !== null && (
        <div className="absolute top-0 right-0 card p-2 text-2xs shadow-pop z-10">
          <div className="font-semibold text-ink mb-1">{categories[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-2 num">
              <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
              <span className="text-ink2">{s.name}</span>
              <span className="ml-auto font-semibold text-ink">{format(s.values[hover] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Meter({ value, target = 1, tone }: { value: number; target?: number; tone?: string }) {
  const p = Math.min(1.35, value / target);
  const colour = tone ?? (p >= 0.97 && p <= 1.05 ? "var(--status-good)" : p < 0.85 ? "var(--status-critical)" : "var(--status-warning)");
  return (
    <div className="relative h-2 rounded-full bg-[color:var(--plane)] overflow-hidden">
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (p / 1.35) * 100)}%`, background: colour }} />
      <div className="absolute inset-y-0 w-px bg-[color:var(--baseline)]" style={{ left: `${(1 / 1.35) * 100}%` }} />
    </div>
  );
}

// ── SLA bar ──────────────────────────────────────────────────────────────────

export function SlaBar({ pctConsumed, label }: { pctConsumed: number; label: string }) {
  const clamped = Math.min(1, pctConsumed);
  const tone = pctConsumed >= 1 ? "var(--status-critical)" : pctConsumed >= 0.75 ? "var(--status-warning)" : "var(--status-good)";
  return (
    <div className="w-full">
      <div className="h-1.5 rounded-full bg-[color:var(--plane)] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${clamped * 100}%`, background: tone }} />
      </div>
      <div className="text-2xs mt-1 num" style={{ color: pctConsumed >= 1 ? "var(--status-critical)" : "var(--text-muted)" }}>
        {label}
      </div>
    </div>
  );
}

// ── Table ────────────────────────────────────────────────────────────────────

export function Table({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto -mx-1 ${className}`}>
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  );
}
const ALIGN: Record<string, string> = { left: "text-left", right: "text-right", center: "text-center" };

interface CellProps {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  style?: React.CSSProperties;
  colSpan?: number;
  title?: string;
  onClick?: () => void;
}

export function Th({ children, align = "left", className = "", style, colSpan, title, onClick }: CellProps) {
  return (
    <th
      style={style}
      colSpan={colSpan}
      title={title}
      onClick={onClick}
      className={`label pb-2 px-2 border-b border-line font-semibold ${ALIGN[align]} whitespace-nowrap ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = "left", className = "", style, colSpan, title, onClick }: CellProps) {
  return (
    <td
      style={style}
      colSpan={colSpan}
      title={title}
      onClick={onClick}
      className={`py-2.5 px-2 border-b border-line align-middle ${ALIGN[align]} ${className}`}
    >
      {children}
    </td>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative card shadow-pop w-full ${wide ? "max-w-4xl" : "max-w-2xl"} my-4 rise`}>
        <div className="flex items-start justify-between gap-4 p-4 border-b border-line">
          <div>
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            {sub && <p className="text-xs text-ink2 mt-0.5">{sub}</p>}
          </div>
          <button className="btn-ghost !px-2 text-lg leading-none" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="p-4 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <div className="p-4 border-t border-line flex items-center justify-end gap-2 flex-wrap">{footer}</div>}
      </div>
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; count?: number }[];
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[color:var(--plane)] border border-line flex-wrap">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            value === o.id ? "bg-raised text-ink shadow-card" : "text-ink2 hover:text-ink"
          }`}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 text-2xs num text-muted">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Empty / info ─────────────────────────────────────────────────────────────

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="text-center py-10 px-6">
      <div className="text-sm font-medium text-ink">{title}</div>
      {body && <div className="text-xs text-ink2 mt-1 max-w-md mx-auto">{body}</div>}
    </div>
  );
}

export function Callout({
  children,
  tone = "brand",
  title,
}: {
  children: React.ReactNode;
  tone?: "brand" | "good" | "warn" | "critical";
  title?: string;
}) {
  const map: Record<string, string> = {
    brand: "bg-[color:var(--brand-soft)] border-[color:var(--brand)]",
    good: "bg-[var(--ok-soft)] border-[#0ca30c]",
    warn: "bg-[var(--warn-soft)] border-[#fab219]",
    critical: "bg-[var(--crit-soft)] border-[#d03b3b]",
  };
  return (
    <div className={`rounded-lg border-l-[3px] px-3.5 py-3 ${map[tone]}`}>
      {title && <div className="text-xs font-semibold text-ink mb-1">{title}</div>}
      <div className="text-xs text-ink2 leading-relaxed">{children}</div>
    </div>
  );
}

// ── Before/after comparison — used all over the prototype ────────────────────

export function BeforeAfter({
  before,
  after,
  beforeLabel = "Today",
  afterLabel = "Arvind One",
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
      <div className="rounded-lg border border-line px-3 py-2 bg-[color:var(--plane)]">
        <div className="label mb-0.5">{beforeLabel}</div>
        <div className="text-sm font-semibold text-ink num">{before}</div>
      </div>
      <div className="text-muted text-sm">→</div>
      <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--status-good)", background: "var(--ok-soft)" }}>
        <div className="label mb-0.5" style={{ color: "var(--success-text)" }}>
          {afterLabel}
        </div>
        <div className="text-sm font-semibold num" style={{ color: "var(--success-text)" }}>
          {after}
        </div>
      </div>
    </div>
  );
}

// ── Size grid — the most-used micro-visual in the app ────────────────────────

export function SizeGrid({
  sizes,
  units,
  core,
  onPick,
  selected,
}: {
  sizes: string[];
  units: Record<string, number>;
  core: string[];
  onPick?: (s: string) => void;
  selected?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {sizes.map((s) => {
        const u = units[s] ?? 0;
        const isCore = core.includes(s);
        const out = u <= 0;
        const tone = out && isCore ? "critical" : out ? "neutral" : u <= 2 ? "warn" : "good";
        const bg =
          tone === "critical" ? "var(--crit-soft)" : tone === "warn" ? "var(--warn-soft)" : tone === "good" ? "var(--ok-soft)" : "var(--plane)";
        const bd =
          tone === "critical" ? "var(--status-critical)" : tone === "warn" ? "var(--status-warning)" : tone === "good" ? "#CBDDD3" : "var(--line)";
        const Comp: React.ElementType = onPick ? "button" : "div";
        return (
          <Comp
            key={s}
            onClick={onPick ? () => onPick(s) : undefined}
            title={`Size ${s} · ${u} sellable${isCore ? " · core size" : ""}`}
            className={`min-w-[42px] rounded-md border px-1.5 py-1 text-center transition-all ${
              onPick ? "hover:scale-105 cursor-pointer" : ""
            } ${selected === s ? "ring-2 ring-offset-1 ring-[color:var(--brand)]" : ""}`}
            style={{ background: bg, borderColor: bd }}
          >
            <div className="text-2xs font-semibold text-ink2 flex items-center justify-center gap-0.5">
              {s}
              {isCore && <span className="text-[8px] leading-none" title="Core size">★</span>}
            </div>
            <div className="text-sm font-semibold text-ink num leading-tight">{u}</div>
          </Comp>
        );
      })}
    </div>
  );
}

// ── Swatch ───────────────────────────────────────────────────────────────────

export function Swatch({ hex, label }: { hex: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-4 h-4 rounded border border-line shrink-0" style={{ background: hex }} />
      {label && <span className="text-xs text-ink2">{label}</span>}
    </span>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

export function Timeline({ events }: { events: { at: number; actor: string; label: string; system: string }[] }) {
  return (
    <ol className="relative pl-5">
      <div className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-[color:var(--grid)]" />
      {events.map((e, i) => (
        <li key={i} className="relative pb-3 last:pb-0">
          <span
            className="absolute -left-[15px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[color:var(--surface-2)]"
            style={{ background: i === events.length - 1 ? "var(--brand)" : "var(--baseline)" }}
          />
          <div className="text-xs text-ink leading-snug">{e.label}</div>
          <div className="text-2xs text-muted mt-0.5">
            {e.actor} · {e.system} · {fmtTime(e.at)}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── Formatting helpers ───────────────────────────────────────────────────────

export function fmtTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata", hour12: false });
}
export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
/** "Tue 11 Aug" — the run calendar needs the weekday, not just the date. */
export function fmtRunDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}
export function fmtDateTime(ms: number): string {
  return `${fmtDate(ms)} ${fmtTime(ms)}`;
}
export function relTime(ms: number, now: number): string {
  const diff = now - ms;
  const m = Math.round(diff / 60000);
  if (Math.abs(m) < 60) return m >= 0 ? `${m}m ago` : `in ${-m}m`;
  const h = Math.round(m / 60);
  if (Math.abs(h) < 48) return h >= 0 ? `${h}h ago` : `in ${-h}h`;
  const d = Math.round(h / 24);
  return d >= 0 ? `${d}d ago` : `in ${-d}d`;
}

export { inr, pct };

// ── Toast ────────────────────────────────────────────────────────────────────

export function Toast({ message, tone, onDone }: { message: string; tone: "good" | "warn" | "info"; onDone: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    timer.current = setTimeout(onDone, 4200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [message, onDone]);
  const bg = tone === "good" ? "var(--success-text)" : tone === "warn" ? "#9A6700" : "var(--brand)";
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] rise no-print">
      <div className="rounded-lg px-4 py-2.5 text-sm text-white shadow-pop max-w-md" style={{ background: bg }}>
        {message}
      </div>
    </div>
  );
}
