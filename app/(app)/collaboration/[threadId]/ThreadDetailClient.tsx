"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CollabThread, CollabMessage } from "@/lib/types";
import { RichBody } from "@/components/collab/RichBody";
import { CollabComposer } from "@/components/collab/CollabComposer";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

const ASSET_COLOR: Record<string, string> = {
  DATA_SOURCE:    "bg-blue-50   text-blue-700   border-blue-200",
  SCHEMA:         "bg-sky-50    text-sky-700    border-sky-200",
  TABLE:          "bg-teal-50   text-teal-700   border-teal-200",
  COLUMN:         "bg-emerald-50 text-emerald-700 border-emerald-200",
  GLOSSARY_DOMAIN:"bg-amber-50  text-amber-700  border-amber-200",
  GLOSSARY_TERM:  "bg-amber-50  text-amber-700  border-amber-200",
};

function assetUrl(assetType: string, assetId: string) {
  const ids = assetId.split(":");
  switch (assetType) {
    case "DATA_SOURCE":    return "/catalog";
    case "SCHEMA":         return `/catalog/${ids[0]}`;
    case "TABLE":          return `/catalog/${ids[1]}/tables/${ids[0]}`;
    case "COLUMN":         return `/catalog/${ids[2]}/tables/${ids[1]}`;
    case "GLOSSARY_DOMAIN": return "/glossary";
    case "GLOSSARY_TERM":  return `/glossary/${ids[0]}`;
    default:               return "/catalog";
  }
}

export function ThreadDetailClient({
  thread,
  messages,
}: {
  thread:   CollabThread;
  messages: CollabMessage[];
}) {
  const router = useRouter();

  async function handleReply(body: string) {
    await fetch(`/api/collab/threads/${thread.threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    router.refresh();
  }

  return (
    <main className="px-8 py-7 pb-14 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="text-[12px] text-muted mb-4">
        <Link href="/collaboration" className="hover:text-brand-purple">Collaboration</Link>
        <span className="mx-1.5">›</span>
        <span className="text-ink">{thread.title}</span>
      </div>

      {/* Thread header */}
      <div className="card p-6 mb-6">
        <h1 className="text-xl font-extrabold text-brand-deep mb-2">{thread.title}</h1>

        {/* Asset references */}
        {thread.assetRefs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {thread.assetRefs.map((ref, i) => (
              <Link key={i} href={assetUrl(ref.assetType, ref.assetId)}
                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border hover:opacity-80 transition-opacity ${
                  ASSET_COLOR[ref.assetType] ?? "bg-gray-50 text-gray-600 border-gray-200"
                }`}>
                <span>{ref.assetPath}</span>
              </Link>
            ))}
          </div>
        )}

        <div className="text-[11px] text-muted">
          Started by <span className="font-medium text-ink">{thread.authorName}</span>
          &nbsp;·&nbsp;{thread.messageCount} messages
          &nbsp;·&nbsp;Last activity {timeAgo(thread.updatedAt)}
        </div>
      </div>

      {/* Messages */}
      <div className="space-y-4 mb-8">
        {messages.map((msg, idx) => {
          const initials = msg.authorName.split(" ").map((n) => n[0]).join("").slice(0, 2);
          const isFirst  = idx === 0;
          return (
            <div key={msg.messageId} className={`flex gap-4 ${isFirst ? "" : ""}`}>
              {/* Avatar */}
              <div className="shrink-0 pt-0.5">
                <span className={`w-9 h-9 rounded-full text-[12px] font-bold grid place-items-center
                  ${isFirst ? "bg-brand-purple/20 text-brand-purple" : "bg-canvas border border-line text-muted"}`}>
                  {initials}
                </span>
              </div>

              {/* Bubble */}
              <div className={`flex-1 min-w-0 card px-4 py-3 ${isFirst ? "border-brand-purple/20" : ""}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-sm text-brand-deep">{msg.authorName}</span>
                  {isFirst && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-purple/10 text-brand-purple">
                      Author
                    </span>
                  )}
                  <span className="text-[11px] text-muted ml-auto">{timeAgo(msg.createdAt)}</span>
                </div>
                <div className="text-sm text-ink leading-relaxed">
                  <RichBody body={msg.body} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply composer */}
      <div className="card p-5">
        <h3 className="font-bold text-sm text-brand-deep mb-3">Reply to thread</h3>
        <CollabComposer
          onSubmit={handleReply}
          placeholder="Add your reply… Use # to reference an asset, #user. to mention a colleague"
          rows={4}
        />
      </div>
    </main>
  );
}
