"use client";

// Command palette — ⌘K / Ctrl-K. One keystroke to any screen, action or store.
// Reads the same navigation source of truth as the sidebar, so the two can
// never disagree about what a role can reach.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { NAV_ACTIONS, NAV_GROUPS } from "@/lib/nav";
import { STORES } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { openPublishTraining } from "./PublishTraining";

interface Item {
  key: string;
  kind: "Screen" | "Action" | "Store";
  label: string;
  hint: string;
  run: () => void;
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const storeSide = app.role === "store" || app.role === "staff";

  const all = useMemo<Item[]>(() => {
    const screens: Item[] = NAV_GROUPS.filter((g) => g.roles.includes(app.role)).flatMap((g) =>
      g.children.map((c) => ({
        key: `s-${g.key}-${c.id}-${c.focus ?? ""}`,
        kind: "Screen" as const,
        label: c.label,
        hint: `${g.section} · ${g.label}`,
        run: () => app.go(c.id, c.focus),
      }))
    );
    const actions: Item[] = NAV_ACTIONS.filter((a) => a.roles.includes(app.role)).map((a) => ({
      key: `a-${a.label}`,
      kind: "Action" as const,
      label: a.label,
      hint: a.hint,
      run: () => (a.overlay === "training" ? openPublishTraining() : app.go(a.id, a.focus)),
    }));
    const stores: Item[] = storeSide
      ? STORES.map((s) => ({
          key: `st-${s.id}`,
          kind: "Store" as const,
          label: `Switch to ${s.name}`,
          hint: `${s.brand} · ${s.city}`,
          run: () => app.setStore(s.id),
        }))
      : [];
    return [...actions, ...screens, ...stores];
  }, [app, storeSide]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all.filter((i) => i.kind !== "Store").slice(0, 9);
    const tokens = needle.split(/\s+/);
    return all
      .filter((i) => {
        const hay = `${i.label} ${i.hint}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 9);
  }, [q, all]);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      // Focus after the panel mounts.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => setCursor(0), [q]);

  function pick(i: Item | undefined) {
    if (!i) return;
    i.run();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4 no-print" role="dialog" aria-modal="true" aria-label="Jump to">
      <div className="fixed inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative card shadow-pop w-full max-w-xl rise">
        <div className="flex items-center gap-3 px-4 border-b border-line">
          <span className="text-muted" aria-hidden>⌕</span>
          <input
            ref={inputRef}
            data-palette-input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(results.length - 1, c + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); pick(results[cursor]); }
              else if (e.key === "Escape") { e.preventDefault(); onClose(); }
            }}
            placeholder="Jump to a screen, action or store…"
            className="flex-1 bg-transparent py-3.5 text-sm text-ink outline-none placeholder:text-muted"
          />
          <span className="kbd">esc</span>
        </div>

        <div className="max-h-[46vh] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted">Nothing matches &ldquo;{q}&rdquo;</div>
          ) : (
            results.map((i, idx) => (
              <button
                key={i.key}
                data-palette-item
                onClick={() => pick(i)}
                onMouseEnter={() => setCursor(idx)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  idx === cursor ? "bg-[color:var(--brand-soft)]" : ""
                }`}
              >
                <span className="chip shrink-0 !text-[9px]">{i.kind}</span>
                <span className={`text-sm flex-1 truncate ${idx === cursor ? "text-[color:var(--brand)] font-medium" : "text-ink"}`}>
                  {i.label}
                </span>
                <span className="text-2xs text-muted shrink-0 hidden sm:inline">{i.hint}</span>
                {idx === cursor && <span className="kbd shrink-0">↵</span>}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-line text-2xs text-muted">
          <span className="inline-flex items-center gap-1"><span className="kbd">↑↓</span> move</span>
          <span className="inline-flex items-center gap-1"><span className="kbd">↵</span> open</span>
          <span className="flex-1" />
          <span>Everything your role can reach</span>
        </div>
      </div>
    </div>
  );
}
