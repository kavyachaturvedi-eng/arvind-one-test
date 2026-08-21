"use client";

// How much to believe a number.
//
// Intelligence built on an input nobody trusts is worse than no intelligence,
// because it is wrong with a straight face. Every derived panel says which
// inputs it rests on, and takes the weakest of them.

import React from "react";
import { DATA_INPUTS, TRUST_LABEL, trustOf } from "@/lib/rules";

export default function Trust({ inputs }: { inputs: string[] }) {
  const level = trustOf(inputs);
  const named = inputs.map((k) => DATA_INPUTS.find((d) => d.key === k)?.label ?? k);
  const tone = level === "solid" ? "good" : level === "partial" ? "warn" : "critical";
  return (
    <span
      className="chip !text-[9px] shrink-0"
      data-trust={level}
      title={`${named.join(" · ")} — ${DATA_INPUTS.filter((d) => inputs.includes(d.key) && d.trust !== "solid").map((d) => d.note).join(" ") || "System of record."}`}
      style={{
        color: tone === "good" ? "var(--success-text)" : tone === "warn" ? "var(--status-warn)" : "var(--status-critical)",
        borderColor: "currentColor",
      }}
    >
      {TRUST_LABEL[level]}
    </span>
  );
}
