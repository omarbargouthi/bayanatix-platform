"use client";

import { useState, useEffect } from "react";

// DATA_ENTITIES (tables) are always followable; DATA_SCHEMAS/DATA_SOURCES
// are gated by an admin toggle (Admin > Configuration > Follow Settings) —
// following either fans out to every table/column beneath it, which can
// flood a follower's Homepage activity feed. The API is the source of truth
// for "allowed" (?assetType=... route checks the live setting); this
// component just reflects whatever it reports.
export function FollowButton({
  assetType,
  assetId,
  iconOnly,
  size = "md",
}: {
  assetType: string;
  assetId:   number;
  iconOnly?: boolean;
  size?:     "sm" | "md";
}) {
  const [following, setFollowing] = useState(false);
  const [allowed,   setAllowed]   = useState(true);
  const [loading,   setLoading]   = useState(true);
  const [busy,      setBusy]      = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/assets/${assetType}/${assetId}/follow`)
      .then((r) => r.ok ? r.json() : { following: false, allowed: true })
      .then((d) => { setFollowing(!!d.following); setAllowed(d.allowed !== false); })
      .finally(() => setLoading(false));
  }, [assetType, assetId]);

  async function toggle() {
    if (!allowed || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/assets/${assetType}/${assetId}/follow`, {
        method: following ? "DELETE" : "POST",
      });
      if (r.ok) setFollowing((f) => !f);
    } finally {
      setBusy(false);
    }
  }

  const disabled = loading || !allowed || busy;
  const title = !allowed
    ? `Following ${assetType === "DATA_SOURCES" ? "data sources" : "schemas"} is disabled by your admin`
    : following ? "Unfollow" : "Follow";

  if (iconOnly) {
    const dim = size === "sm" ? "w-6 h-6" : "w-8 h-8";
    return (
      <button
        onClick={toggle}
        disabled={disabled}
        title={title}
        className={`${dim} grid place-items-center rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          following ? "text-amber-500 hover:bg-canvas-soft" : "text-ink-soft hover:bg-canvas-soft hover:text-amber-600"
        }`}
      >
        <span className={size === "sm" ? "text-sm leading-none" : "text-base leading-none"}>{following ? "★" : "☆"}</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={disabled}
      title={title}
      className={`btn btn-sm disabled:opacity-40 disabled:cursor-not-allowed ${
        following ? "bg-brand-purple/10 text-brand-purple border-brand-purple/30" : ""
      }`}
    >
      {following ? "★ Following" : "☆ Follow"}
    </button>
  );
}
