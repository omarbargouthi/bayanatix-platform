"use client";

import { useState, useEffect } from "react";
import type { AssetRating } from "@/lib/types";

function Star({ filled, half, onClick, onHover }: { filled: boolean; half?: boolean; onClick: () => void; onHover: () => void }) {
  return (
    <button type="button" onClick={onClick} onMouseEnter={onHover} className="text-2xl leading-none transition-transform hover:scale-110 focus:outline-none">
      <span className={filled || half ? "text-amber-400" : "text-gray-200"}>★</span>
    </button>
  );
}

export function StarRatingWidget({ assetType, assetId }: { assetType: string; assetId: number }) {
  const [data,    setData]    = useState<AssetRating | null>(null);
  const [hover,   setHover]   = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [pendingStar, setPendingStar] = useState(0);
  const [comment, setComment] = useState("");
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    fetch(`/api/assets/${assetType}/${assetId}/rating`)
      .then((r) => r.ok ? r.json() : null)
      .then(setData);
  }, [assetType, assetId]);

  async function submit() {
    setSaving(true);
    await fetch(`/api/assets/${assetType}/${assetId}/rating`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stars: pendingStar, comment: comment.trim() || null }),
    });
    const updated = await fetch(`/api/assets/${assetType}/${assetId}/rating`).then((r) => r.json());
    setData(updated);
    setSaving(false);
    setShowModal(false);
    setComment("");
  }

  const avg      = data?.average ? Number(data.average) : 0;
  const myStars  = data?.myRating?.stars ?? 0;
  const display  = hover > 0 ? hover : (myStars || avg);

  return (
    <>
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-0 cursor-pointer"
          onMouseLeave={() => setHover(0)}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              filled={n <= Math.floor(display)}
              onClick={() => { setPendingStar(n); setComment(data?.myRating?.comment ?? ""); setShowModal(true); }}
              onHover={() => setHover(n)}
            />
          ))}
        </div>
        <div className="text-[12px] text-muted">
          {data?.count ? (
            <span><strong className="text-ink">{avg.toFixed(1)}</strong> ({data.count} rating{data.count !== 1 ? "s" : ""})</span>
          ) : (
            <span>No ratings yet</span>
          )}
        </div>
      </div>
      {myStars > 0 && (
        <p className="text-[11px] text-muted mt-0.5">Your rating: {myStars}★{data?.myRating?.comment ? ` · "${data.myRating.comment}"` : ""}</p>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm border border-line p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-brand-deep mb-4">Rate this asset</h3>
            <div className="flex items-center gap-1 justify-center mb-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setPendingStar(n)} className="text-3xl leading-none transition-transform hover:scale-110">
                  <span className={n <= pendingStar ? "text-amber-400" : "text-gray-200"}>★</span>
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="input-field resize-none w-full mb-4"
              placeholder="Add a comment (optional)…"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowModal(false)} className="btn">Cancel</button>
              <button onClick={submit} disabled={saving || pendingStar === 0} className="btn btn-primary">
                {saving ? "Saving…" : "Submit Rating"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
