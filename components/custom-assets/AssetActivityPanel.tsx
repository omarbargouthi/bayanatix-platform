import { getHistory } from "@/lib/audit";
import type { AuditEntry } from "@/lib/types";

function actorLabel(userName: string | null, userId: string) {
  return userName ?? userId;
}

function fmt(d: string) {
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function initials(name: string | null, userId: string) {
  if (!name) return userId.slice(0, 2).toUpperCase();
  const parts = name.trim().split(" ");
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function ChangeRow({ field, from, to }: { field: string; from: string | null; to: string | null }) {
  const label = field.replace(/_/g, " ");
  return (
    <div className="flex items-start gap-2 text-[12px] py-0.5">
      <span className="text-muted shrink-0 w-32 truncate capitalize">{label}</span>
      {from != null && (
        <>
          <span className="text-red-500 line-through max-w-[140px] truncate" title={from}>{from || "(empty)"}</span>
          <span className="text-muted shrink-0">→</span>
        </>
      )}
      <span className="text-emerald-700 max-w-[160px] truncate font-medium" title={to ?? ""}>{to || "(empty)"}</span>
    </div>
  );
}

function AuditCard({ entry }: { entry: AuditEntry }) {
  const ini = initials(entry.userName, entry.userId);
  return (
    <div className="flex gap-4 pb-6 relative">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-brand-purple/10 text-brand-purple text-[11px] font-bold flex items-center justify-center shrink-0 z-10">
          {ini}
        </div>
        <div className="w-px flex-1 bg-line mt-2" />
      </div>
      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="text-[13px] font-semibold text-ink">{actorLabel(entry.userName, entry.userId)}</span>
          <span className="text-[11px] text-muted">{entry.action === "CREATE" ? "created" : "updated"}</span>
          <span className="text-[11px] text-muted ml-auto shrink-0">{fmt(entry.timestamp)}</span>
        </div>
        {entry.changes.length > 0 && (
          <div className="bg-canvas-soft rounded-lg px-3 py-2.5 border border-line-soft">
            {entry.changes.map((c, i) => <ChangeRow key={i} field={c.field} from={c.from} to={c.to} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export async function AssetActivityPanel({ assetTypeCode, assetId }: { assetTypeCode: string; assetId: number }) {
  const history = await getHistory(assetTypeCode, assetId);

  if (history.length === 0) {
    return <p className="text-[13px] text-muted italic">No activity yet.</p>;
  }

  return (
    <div>
      {history.map((e) => <AuditCard key={e.auditId} entry={e} />)}
    </div>
  );
}
