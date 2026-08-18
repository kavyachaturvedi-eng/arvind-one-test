"use client";

// Copilot — the conversational layer over the same governed data every screen
// uses. Suggests, answers, and can execute the action it proposes.

import React, { useState } from "react";
import { copilotSuggestions, type CopilotSuggestion } from "@/lib/agents";
import { useApp } from "@/lib/state";

export default function Copilot() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<CopilotSuggestion | null>(null);

  const suggestions = copilotSuggestions(app.role, app.storeId);

  function runAction(s: CopilotSuggestion) {
    if (!s.action) return;
    if (s.action.label.includes("Save the Sale")) app.go("savesale");
    if (s.action.label.includes("Live Execution")) app.go("live");
    app.toastNow(s.action.toast, "good");
    setOpen(false);
    setActive(null);
  }

  return (
    <>
      {/* The launcher */}
      <button
        data-copilot
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-40 no-print flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium text-white transition-colors"
        style={{ background: open ? "var(--brand)" : "var(--text-primary)" }}
      >
        <span className="serif-accent" style={{ color: "#fff" }}>Ai</span>
        Copilot
      </button>

      {open && (
        <div className="fixed bottom-16 right-5 z-40 w-[min(420px,calc(100vw-40px))] card shadow-pop no-print rise">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <div>
              <div className="text-sm font-medium text-ink">Copilot</div>
              <div className="text-2xs text-muted">Answers from governed metrics. Actions need your tap.</div>
            </div>
            <button className="btn-ghost !px-2" onClick={() => { setOpen(false); setActive(null); }}>×</button>
          </div>

          <div className="p-4 max-h-[420px] overflow-y-auto">
            {!active ? (
              <>
                <div className="label mb-2">Try asking</div>
                <div className="space-y-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s.q}
                      onClick={() => setActive(s)}
                      className="w-full text-left border border-line px-3 py-2.5 text-sm text-ink hover:border-[color:var(--brand)] transition-colors"
                    >
                      {s.q}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="text-sm font-medium text-ink">{active.q}</div>
                <div className="border-l-2 pl-3 text-sm text-ink2 leading-relaxed" style={{ borderColor: "var(--brand)" }}>
                  {active.a}
                </div>
                <div className="flex items-center gap-2">
                  {active.action && (
                    <button className="btn-primary !py-1.5 !text-xs" onClick={() => runAction(active)}>
                      {active.action.label}
                    </button>
                  )}
                  <button className="btn !py-1.5 !text-xs" onClick={() => setActive(null)}>Back</button>
                </div>
                <div className="text-2xs text-muted pt-2 border-t border-line">
                  Computed from the same metric definitions every screen uses · nothing is invented
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
