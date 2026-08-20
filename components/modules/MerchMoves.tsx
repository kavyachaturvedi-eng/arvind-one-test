"use client";

// Smart Moves — merchandising intelligence in plain words.
// Every card is one decision: WHAT to move, WHY (last year's sales, the
// festival calendar, a sister store selling faster), what it's WORTH.
// Approve or say not now. Nothing moves on its own.

import React, { useMemo, useState } from "react";
import { NOW } from "@/lib/seed";
import { merchMoves, type MerchMove } from "@/lib/agents";
import { useApp } from "@/lib/state";
import { Card, Chip, SectionTitle, StatusDot, inr } from "@/components/ui";

export default function MerchMoves() {
  const app = useApp();
  const moves = useMemo(() => merchMoves(app.storeId), [app.storeId]);
  const [decided, setDecided] = useState<Record<string, "approved" | "later">>({});

  const open = moves.filter((m) => !decided[m.id]);
  const festival = moves.filter((m) => m.kind === "festival");
  const swaps = moves.filter((m) => m.kind === "swap");
  const worthOpen = open.reduce((a, m) => a + m.worth, 0);

  function approve(m: MerchMove) {
    setDecided((d) => ({ ...d, [m.id]: "approved" }));
    app.dispatch({
      type: "audit",
      entry: {
        at: NOW,
        actor: app.actorName,
        action: `Approved smart move ${m.id}: ${m.headline}`,
        object: m.styleName,
        system: "Arvi",
      },
    });
    app.toastNow(
      m.direction === "send"
        ? `Done, a transfer to ${m.otherStore} is raised and the pick list is printing`
        : `Done. ${m.otherStore} gets the pick task; the stock ships to you`,
      "good"
    );
  }

  function later(m: MerchMove) {
    setDecided((d) => ({ ...d, [m.id]: "later" }));
    app.toastNow("Kept for later. Arvi will remind you before the ship-by date", "info");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-ink">Smart Moves</h1>
        <div className="flex items-center gap-2">
          <Chip tone={open.length ? "warn" : "good"}>{open.length} waiting</Chip>
          <Chip tone="good">worth {inr(worthOpen, { compact: true })}</Chip>
        </div>
      </div>

      <Card>
        <SectionTitle
          title="Before the festival"
          right={<Chip tone="brand">{festival.filter((m) => !decided[m.id]).length} open</Chip>}
        />
        <div className="space-y-2.5">
          {festival.map((m) => (
            <MoveCard key={m.id} move={m} state={decided[m.id]} onApprove={() => approve(m)} onLater={() => later(m)} />
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle
          title="Slow here, selling fast there"
          right={<Chip>{swaps.filter((m) => !decided[m.id]).length} open</Chip>}
        />
        <div className="space-y-2.5">
          {swaps.map((m) => (
            <MoveCard key={m.id} move={m} state={decided[m.id]} onApprove={() => approve(m)} onLater={() => later(m)} />
          ))}
        </div>
      </Card>

    </div>
  );
}

function MoveCard({
  move,
  state,
  onApprove,
  onLater,
}: {
  move: MerchMove;
  state?: "approved" | "later";
  onApprove: () => void;
  onLater: () => void;
}) {
  return (
    <div className={`border p-3.5 ${state === "approved" ? "border-[color:var(--status-good)]" : "border-line"} ${state === "later" ? "opacity-55" : ""}`} data-merch-move>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <Chip tone={move.kind === "festival" ? "brand" : "neutral"}>
              {move.kind === "festival" ? "✦ Festival" : "⇄ Swap"}
            </Chip>
            <span className="text-2xs text-muted">{move.dueBy}</span>
          </div>
          <div className="text-[15px] font-semibold text-ink leading-snug">{move.headline}</div>
          <ul className="mt-2 space-y-1">
            {move.why.map((w) => (
              <li key={w} className="flex items-start gap-2 text-xs text-ink2 leading-relaxed">
                <StatusDot tone="neutral" />
                <span className="flex-1">{w}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="shrink-0 text-right">
          <div className="label">Worth</div>
          <div className="text-lg font-semibold num" style={{ color: "var(--status-good)" }}>{inr(move.worth, { compact: true })}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        {state === "approved" ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--status-good)" }}>
            <StatusDot tone="good" /> Approved. Transfer raised
          </span>
        ) : state === "later" ? (
          <span className="text-xs text-muted">Kept for later</span>
        ) : (
          <>
            <button data-merch-approve className="btn-primary !py-2 !text-xs" onClick={onApprove}>
              ✓ Approve move
            </button>
            <button className="btn !py-2 !text-xs" onClick={onLater}>Not now</button>
          </>
        )}
      </div>
    </div>
  );
}
