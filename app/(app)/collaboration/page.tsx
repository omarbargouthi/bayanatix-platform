"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { CollabThread } from "@/lib/types";
import { ThreadCard } from "@/components/collab/ThreadCard";
import { CollabComposer } from "@/components/collab/CollabComposer";

export default function CollaborationPage() {
  const router = useRouter();
  const [threads,     setThreads]     = useState<CollabThread[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [showNew,     setShowNew]     = useState(false);
  const [newTitle,    setNewTitle]    = useState("");
  const [titleError,  setTitleError]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/collab/threads");
    setThreads(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = threads.filter((t) =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  );

  async function handleNewThread(body: string) {
    if (!newTitle.trim()) { setTitleError(true); return; }
    const r = await fetch("/api/collab/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), body }),
    });
    const { threadId } = await r.json();
    setShowNew(false);
    setNewTitle("");
    router.push(`/collaboration/${threadId}`);
  }

  const totalAssets = threads.reduce((s, t) => s + t.assetRefs.length, 0);
  const totalMsgs   = threads.reduce((s, t) => s + t.messageCount, 0);

  return (
    <main className="px-8 py-7 pb-14">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-7">
        <Stat label="Active Threads"    value={threads.length}  color="purple" />
        <Stat label="Total Messages"    value={totalMsgs}       color="blue" />
        <Stat label="Assets Referenced" value={totalAssets}     color="teal" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search threads…"
          className="flex-1 border border-line rounded-md px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
        />
        <button onClick={() => setShowNew(true)} className="btn btn-primary">
          + New Thread
        </button>
      </div>

      {/* Thread list */}
      {loading
        ? <div className="py-16 text-center text-muted text-sm">Loading…</div>
        : filtered.length === 0
          ? <div className="py-16 text-center text-muted text-sm">
              {search ? "No threads match your search." : "No threads yet. Start the first one!"}
            </div>
          : <div className="flex flex-col gap-3">
              {filtered.map((t) => <ThreadCard key={t.threadId} thread={t} />)}
            </div>
      }

      {/* New Thread modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl border border-line">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 className="font-bold text-brand-deep">New Collaboration Thread</h2>
              <button onClick={() => setShowNew(false)} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="field-label">Thread Title</label>
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => { setNewTitle(e.target.value); setTitleError(false); }}
                  placeholder="e.g. Data quality review — AR_INVOICES"
                  className={`input-field ${titleError ? "border-red-400" : ""}`}
                />
                {titleError && <p className="text-[11px] text-red-500 mt-1">Please enter a title.</p>}
              </div>
              <div>
                <label className="field-label">First Message</label>
                <CollabComposer
                  onSubmit={handleNewThread}
                  placeholder="Describe the topic… Use # to reference an asset, #user. to mention a steward"
                  rows={5}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: "purple" | "blue" | "teal" }) {
  const styles = {
    purple: { ring: "border-l-brand-purple bg-brand-purple/5", text: "text-brand-purple" },
    blue:   { ring: "border-l-blue-400 bg-blue-50/60",         text: "text-blue-600" },
    teal:   { ring: "border-l-teal-400 bg-teal-50/60",         text: "text-teal-600" },
  }[color];
  return (
    <div className={`card border-l-4 ${styles.ring} px-5 py-4`}>
      <div className={`text-2xl font-extrabold ${styles.text}`}>{value}</div>
      <div className="text-[11px] text-muted mt-0.5 uppercase tracking-wider">{label}</div>
    </div>
  );
}
