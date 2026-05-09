"use client";

import { useState } from "react";
import { AddAssetModal } from "./AddAssetModal";

export function AddAssetButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-primary btn-sm">
        + Add Asset
      </button>
      {open && <AddAssetModal onClose={() => setOpen(false)} />}
    </>
  );
}
