"use client";
import { useCallback, useEffect, useState } from "react";

type ConversationSummary = { conversationId: number; titleText: string | null; lastMessageAt: string };

export function ConversationList({
  activeId,
  onSelect,
  onNew,
  refreshKey,
}: {
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  refreshKey?: number | string;
}) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/chat/conversations");
      if (r.ok) setConversations(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-line">
        <button onClick={onNew} className="btn btn-primary btn-sm w-full">+ New chat</button>
      </div>
      <div className="flex-1 overflow-y-auto nice-scroll">
        {loading ? (
          <div className="p-4 text-center text-xs text-muted">Loading…</div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted">No conversations yet.</div>
        ) : (
          conversations.map((c) => (
            <button
              key={c.conversationId}
              onClick={() => onSelect(c.conversationId)}
              className={`w-full text-left px-3 py-2.5 border-b border-line-soft text-[13px] truncate hover:bg-canvas-soft transition-colors ${
                activeId === c.conversationId ? "bg-brand-purple/5 text-brand-purple font-medium" : "text-ink"
              }`}
            >
              {c.titleText ?? "New conversation"}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
