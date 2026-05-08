"use client";

import { useEffect } from "react";

export function HighlightScroll({ entityId }: { entityId: number }) {
  useEffect(() => {
    const el = document.getElementById(`entity-${entityId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [entityId]);

  return null;
}
