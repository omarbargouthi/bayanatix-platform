import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { initials } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";

const TYPE_LABEL: Record<string, string> = {
  FIX_DATA_ISSUE:    "Fix Data Issue",
  UPDATE_DEFINITION: "Update Definition",
  CERTIFY_ASSET:     "Certify Asset",
  GRANT_ACCESS:      "Grant Access",
  REMOVE_ACCESS:     "Remove Access",
  OTHER:             "Other",
};

const PRIORITY_DOT: Record<string, string> = {
  HIGH:   "bg-red-500",
  MEDIUM: "bg-amber-400",
  LOW:    "bg-gray-300",
};

const STATUS_BADGE: Record<string, string> = {
  OPEN:        "bg-blue-50 text-blue-700",
  IN_PROGRESS: "bg-amber-50 text-amber-700",
  RESOLVED:    "bg-emerald-50 text-emerald-700",
  CLOSED:      "bg-gray-50 text-gray-500",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [myRaised, onMyAssets] = await Promise.all([
    sql<{
      requestId: number; requestTypeCode: string; title: string;
      priorityCode: string; statusCode: string; createdAt: string; targetCount: number;
    }[]>`
      SELECT
        ar.request_id        AS "requestId",
        ar.request_type_code AS "requestTypeCode",
        ar.title,
        ar.priority_code     AS "priorityCode",
        ar.status_code       AS "statusCode",
        ar.created_at::text  AS "createdAt",
        (SELECT count(*)::int FROM bayanat.asset_request_targets t WHERE t.request_id = ar.request_id) AS "targetCount"
      FROM bayanat.asset_requests ar
      WHERE ar.raised_by_user_id = ${session.userId}
      ORDER BY ar.created_at DESC
      LIMIT 50
    `,
    sql<{
      requestId: number; requestTypeCode: string; title: string;
      priorityCode: string; statusCode: string; createdAt: string;
      raisedByName: string | null; assetName: string | null;
    }[]>`
      SELECT DISTINCT ON (ar.request_id)
        ar.request_id        AS "requestId",
        ar.request_type_code AS "requestTypeCode",
        ar.title,
        ar.priority_code     AS "priorityCode",
        ar.status_code       AS "statusCode",
        ar.created_at::text  AS "createdAt",
        u.full_name          AS "raisedByName",
        art.asset_name       AS "assetName"
      FROM bayanat.asset_requests ar
      JOIN bayanat.asset_request_targets art ON art.request_id = ar.request_id
      JOIN bayanat.asset_stakeholders stk
        ON stk.asset_type_code = art.asset_type_code
        AND stk.asset_id = art.asset_id
        AND stk.user_id = ${session.userId}
      LEFT JOIN bayanat.users u ON u.user_id = ar.raised_by_user_id
      WHERE ar.status_code IN ('OPEN', 'IN_PROGRESS')
      ORDER BY ar.request_id,
        CASE ar.priority_code WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END
      LIMIT 50
    `,
  ]);

  const openCount   = myRaised.filter((r) => r.statusCode === "OPEN" || r.statusCode === "IN_PROGRESS").length;
  const resolvedCount = myRaised.filter((r) => r.statusCode === "RESOLVED" || r.statusCode === "CLOSED").length;

  return (
    <main className="px-8 py-7 pb-14 max-w-4xl mx-auto">
      {/* Profile card */}
      <div className="card p-6 mb-8 flex items-center gap-6">
        <Avatar initials={initials(session.fullName)} seed={session.userId} size={72} />
        <div>
          <h1 className="text-2xl font-extrabold text-brand-deep">{session.fullName}</h1>
          <p className="text-sm text-muted">{session.email}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="tag tag-purple">{session.role}</span>
            <span className="tag">{openCount} open requests</span>
            <span className="tag">{onMyAssets.length} on my assets</span>
          </div>
        </div>
        <div className="ml-auto">
          <Link href="/requests" className="btn btn-primary">View All Requests →</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Requests I raised */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-brand-deep">Requests I Raised</h2>
            <span className="text-[11px] text-muted">{myRaised.length} total</span>
          </div>

          {myRaised.length === 0 ? (
            <div className="card px-5 py-8 text-center text-muted text-sm">
              You have not raised any requests yet.
            </div>
          ) : (
            <div className="space-y-2">
              {myRaised.map((r) => (
                <div key={r.requestId} className="card px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${PRIORITY_DOT[r.priorityCode] ?? "bg-gray-300"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-brand-deep line-clamp-1">{r.title}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10px] text-muted bg-canvas border border-line rounded px-1.5 py-0.5">
                          {TYPE_LABEL[r.requestTypeCode] ?? r.requestTypeCode}
                        </span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_BADGE[r.statusCode] ?? ""}`}>
                          {r.statusCode.replace("_", " ")}
                        </span>
                        <span className="text-[10px] text-muted">{r.targetCount} asset{r.targetCount !== 1 ? "s" : ""}</span>
                        <span className="text-[10px] text-muted ml-auto">{timeAgo(r.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Requests on my assets */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-brand-deep">Requests on My Assets</h2>
            <span className="text-[11px] text-muted">{onMyAssets.length} open</span>
          </div>

          {onMyAssets.length === 0 ? (
            <div className="card px-5 py-8 text-center text-muted text-sm">
              No open requests on assets you steward.
            </div>
          ) : (
            <div className="space-y-2">
              {onMyAssets.map((r) => (
                <div key={r.requestId} className="card px-4 py-3 border-l-2 border-l-amber-400">
                  <div className="flex items-start gap-2.5">
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${PRIORITY_DOT[r.priorityCode] ?? "bg-gray-300"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-brand-deep line-clamp-1">{r.title}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10px] text-muted bg-canvas border border-line rounded px-1.5 py-0.5">
                          {TYPE_LABEL[r.requestTypeCode] ?? r.requestTypeCode}
                        </span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_BADGE[r.statusCode] ?? ""}`}>
                          {r.statusCode.replace("_", " ")}
                        </span>
                        {r.assetName && (
                          <span className="text-[10px] font-mono text-muted border border-line bg-canvas rounded px-1">{r.assetName}</span>
                        )}
                        <span className="text-[10px] text-muted ml-auto">by {r.raisedByName ?? "unknown"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
