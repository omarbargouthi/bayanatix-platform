"use client";
import { useState } from "react";

export function FeedbackButtons({
  feedbackCode,
  onSubmit,
}: {
  feedbackCode: "UP" | "DOWN" | null;
  onSubmit: (code: "UP" | "DOWN", comment?: string) => void;
}) {
  const [pending, setPending] = useState<"UP" | "DOWN" | null>(null);
  const [comment, setComment] = useState("");

  function submit() {
    if (!pending) return;
    onSubmit(pending, comment.trim() || undefined);
    setPending(null);
    setComment("");
  }

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPending("UP")}
          className={`w-6 h-6 rounded flex items-center justify-center text-xs transition-colors ${feedbackCode === "UP" ? "bg-emerald-100 text-emerald-700" : "text-muted hover:bg-canvas-soft"}`}
          title="Helpful"
        >
          👍
        </button>
        <button
          onClick={() => setPending("DOWN")}
          className={`w-6 h-6 rounded flex items-center justify-center text-xs transition-colors ${feedbackCode === "DOWN" ? "bg-red-100 text-red-700" : "text-muted hover:bg-canvas-soft"}`}
          title="Not helpful"
        >
          👎
        </button>
      </div>
      {pending && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            className="field-input text-xs py-1 flex-1"
            placeholder="Optional comment…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            autoFocus
          />
          <button onClick={submit} className="btn btn-sm !py-1 !px-2 text-xs">Send</button>
        </div>
      )}
    </div>
  );
}
