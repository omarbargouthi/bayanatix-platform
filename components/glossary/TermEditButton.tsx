"use client";

import { useState } from "react";
import type { GlossaryTermDetail } from "@/lib/types";
import { TermEditModal } from "./TermEditModal";

export function TermEditButton({ term }: { term: GlossaryTermDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-sm">Edit</button>
      {open && <TermEditModal term={term} onClose={() => setOpen(false)} />}
    </>
  );
}
