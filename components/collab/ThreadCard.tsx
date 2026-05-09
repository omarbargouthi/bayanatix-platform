import Link from "next/link";
import type { CollabThread } from "@/lib/types";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const ASSET_TYPE_LABEL: Record<string, string> = {
  DATA_SOURCE:    "Source",
  SCHEMA:         "Schema",
  TABLE:          "Table",
  COLUMN:         "Column",
  GLOSSARY_DOMAIN:"Domain",
  GLOSSARY_TERM:  "Term",
};

const ASSET_TYPE_COLOR: Record<string, string> = {
  DATA_SOURCE:    "bg-blue-50   text-blue-700   border-blue-200",
  SCHEMA:         "bg-sky-50    text-sky-700    border-sky-200",
  TABLE:          "bg-teal-50   text-teal-700   border-teal-200",
  COLUMN:         "bg-emerald-50 text-emerald-700 border-emerald-200",
  GLOSSARY_DOMAIN:"bg-amber-50  text-amber-700  border-amber-200",
  GLOSSARY_TERM:  "bg-amber-50  text-amber-700  border-amber-200",
};

export function ThreadCard({ thread }: { thread: CollabThread }) {
  const initials = thread.authorName.split(" ").map((n) => n[0]).join("").slice(0, 2);

  return (
    <Link href={`/collaboration/${thread.threadId}`}
      className="block card px-5 py-4 hover:border-brand-purple/30 hover:shadow-sm transition-all group">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <span className="w-8 h-8 rounded-full bg-brand-purple/15 text-brand-purple text-[11px] font-bold grid place-items-center shrink-0 mt-0.5">
          {initials}
        </span>

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-brand-deep text-sm group-hover:text-brand-purple transition-colors line-clamp-1">
              {thread.title}
            </span>
          </div>

          {/* Author + time */}
          <div className="text-[11px] text-muted mb-2">
            {thread.authorName} · {timeAgo(thread.updatedAt)}
          </div>

          {/* Asset ref chips */}
          {thread.assetRefs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {thread.assetRefs.slice(0, 4).map((ref, i) => (
                <span key={i}
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                    ASSET_TYPE_COLOR[ref.assetType] ?? "bg-gray-50 text-gray-600 border-gray-200"
                  }`}>
                  {ASSET_TYPE_LABEL[ref.assetType] ?? ref.assetType}
                  <span className="font-normal opacity-80">
                    {ref.assetPath.split(" > ").pop()}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Message count */}
        <div className="flex items-center gap-1 text-muted text-xs shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {thread.messageCount}
        </div>
      </div>
    </Link>
  );
}
