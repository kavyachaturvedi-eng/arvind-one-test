"use client";

// A store name that goes to that store. Every table that lists stores uses it,
// so a name is always a way in rather than a dead label.

import React from "react";
import { storeById } from "@/lib/seed";
import { useApp } from "@/lib/state";

export default function StoreLink({ storeId, muted = false }: { storeId: string; muted?: boolean }) {
  const app = useApp();
  return (
    <button
      data-store-link={storeId}
      onClick={(e) => {
        e.stopPropagation();
        app.openStore(storeId);
      }}
      className={`text-left hover:underline decoration-dotted ${muted ? "text-ink2" : "text-ink"}`}
    >
      {storeById(storeId).name}
    </button>
  );
}
