import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: { frameworkId: string; reqId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const threads = await sql<{
    threadId: number;
    title: string;
    status: string;
    createdBy: string;
    createdAt: string;
    messageCount: number;
  }[]>`
    SELECT
      t.thread_id        AS "threadId",
      t.title,
      t.status,
      t.created_by       AS "createdBy",
      t.created_at::text AS "createdAt",
      COUNT(m.message_id)::int AS "messageCount"
    FROM bayanat.collab_threads t
    JOIN bayanat.collab_asset_refs ar ON ar.thread_id = t.thread_id
    LEFT JOIN bayanat.collab_messages m ON m.thread_id = t.thread_id
    WHERE ar.asset_type = 'COMPLIANCE_EVIDENCE'
      AND ar.asset_id   = ${params.reqId}
    GROUP BY t.thread_id
    ORDER BY t.created_at DESC
  `;

  return NextResponse.json({ threads });
}

export async function POST(
  req: Request,
  { params }: { params: { frameworkId: string; reqId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, body } = await req.json();
  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "title and body required" }, { status: 400 });
  }

  const threadRows = await sql<{ thread_id: number }[]>`
    INSERT INTO bayanat.collab_threads (title, created_by, thread_type)
    VALUES (${title.trim()}, ${session.userId}, 'DISCUSSION')
    RETURNING thread_id
  `;
  const threadId = threadRows[0].thread_id;

  const msgRows = await sql<{ message_id: number }[]>`
    INSERT INTO bayanat.collab_messages (thread_id, author_id, body)
    VALUES (${threadId}, ${session.userId}, ${body.trim()})
    RETURNING message_id
  `;
  const messageId = msgRows[0].message_id;

  await sql`
    INSERT INTO bayanat.collab_asset_refs (thread_id, message_id, asset_type, asset_id, asset_path)
    VALUES (${threadId}, ${messageId}, 'COMPLIANCE_EVIDENCE', ${params.reqId}, ${`/governance/compliance?req=${params.reqId}`})
  `;

  return NextResponse.json({ threadId }, { status: 201 });
}
