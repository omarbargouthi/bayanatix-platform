import { sql } from "../db";
import type { CollabThread, CollabMessage, CollabAssetRef } from "../types";

// ── Token parsing helpers ─────────────────────────────────────────────────────

// Always create a fresh regex instance to avoid lastIndex statefulness
function tokenRe() { return /#(asset|user)\[([^\]]+)\]/g; }

function extractMentionedUserIds(body: string): string[] {
  const ids: string[] = [];
  for (const m of body.matchAll(tokenRe())) {
    if (m[1] === "user") {
      const userId = m[2].split("|")[0];
      if (userId) ids.push(userId);
    }
  }
  return [...new Set(ids)];
}

function extractAssetRefs(body: string): CollabAssetRef[] {
  const refs: CollabAssetRef[] = [];
  for (const m of body.matchAll(tokenRe())) {
    if (m[1] === "asset") {
      const parts = m[2].split("|");
      refs.push({ assetPath: parts[0] ?? "", assetType: parts[1] ?? "", assetId: parts[2] ?? "" });
    }
  }
  return refs;
}

async function sendNotification(
  userId: string,
  titleText: string,
  bodyText: string,
  href: string,
) {
  try {
    await sql`
      INSERT INTO bayanat.notifications
        (user_id, type, title, body, severity, action_label, action_href)
      VALUES
        (${userId}, 'COLLABORATION', ${titleText}, ${bodyText}, 'INFO', 'View Thread', ${href})
    `;
  } catch (err) {
    // Non-fatal: notification failure should not abort thread/message creation
    console.warn("[collab] notification insert failed:", err);
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listThreads(): Promise<CollabThread[]> {
  const threads = await sql<{
    thread_id: number; title: string; created_by: string; author_name: string;
    created_at: string; updated_at: string; message_count: number;
  }[]>`
    SELECT
      t.thread_id,
      t.title,
      t.created_by,
      u.full_name                                                          AS author_name,
      t.created_at,
      t.updated_at,
      (SELECT COUNT(*)::int FROM bayanat.collab_messages m WHERE m.thread_id = t.thread_id) AS message_count
    FROM bayanat.collab_threads t
    JOIN bayanat.users u ON u.user_id = t.created_by
    ORDER BY t.updated_at DESC
  `;

  if (threads.length === 0) return [];

  const threadIds = threads.map((t) => t.thread_id);
  // Use sql() helper for IN clause — matches pattern in catalog.ts
  const refs = await sql<{ thread_id: number; asset_type: string; asset_id: string; asset_path: string }[]>`
    SELECT thread_id, asset_type, asset_id, asset_path
    FROM bayanat.collab_asset_refs
    WHERE thread_id IN ${sql(threadIds)}
  `;

  const refsMap = new Map<number, CollabAssetRef[]>();
  for (const r of refs) {
    const arr = refsMap.get(r.thread_id) ?? [];
    arr.push({ assetType: r.asset_type, assetId: r.asset_id, assetPath: r.asset_path });
    refsMap.set(r.thread_id, arr);
  }

  return threads.map((t) => ({
    threadId:     t.thread_id,
    title:        t.title,
    createdBy:    t.created_by,
    authorName:   t.author_name,
    createdAt:    String(t.created_at),
    updatedAt:    String(t.updated_at),
    messageCount: t.message_count,
    assetRefs:    refsMap.get(t.thread_id) ?? [],
  }));
}

export async function getThreadById(threadId: number): Promise<{
  thread: CollabThread;
  messages: CollabMessage[];
} | null> {
  const threads = await sql<{
    thread_id: number; title: string; created_by: string; author_name: string;
    created_at: string; updated_at: string; message_count: number;
  }[]>`
    SELECT
      t.thread_id, t.title, t.created_by, u.full_name AS author_name,
      t.created_at, t.updated_at,
      (SELECT COUNT(*)::int FROM bayanat.collab_messages m WHERE m.thread_id = t.thread_id) AS message_count
    FROM bayanat.collab_threads t
    JOIN bayanat.users u ON u.user_id = t.created_by
    WHERE t.thread_id = ${threadId}
  `;
  if (!threads[0]) return null;
  const t = threads[0];

  const [msgs, refs] = await Promise.all([
    sql<{ message_id: number; author_id: string; author_name: string; body: string; created_at: string }[]>`
      SELECT m.message_id, m.author_id, u.full_name AS author_name, m.body, m.created_at
      FROM bayanat.collab_messages m
      JOIN bayanat.users u ON u.user_id = m.author_id
      WHERE m.thread_id = ${threadId}
      ORDER BY m.created_at ASC
    `,
    sql<{ asset_type: string; asset_id: string; asset_path: string }[]>`
      SELECT asset_type, asset_id, asset_path
      FROM bayanat.collab_asset_refs
      WHERE thread_id = ${threadId}
    `,
  ]);

  return {
    thread: {
      threadId:     t.thread_id,
      title:        t.title,
      createdBy:    t.created_by,
      authorName:   t.author_name,
      createdAt:    String(t.created_at),
      updatedAt:    String(t.updated_at),
      messageCount: t.message_count,
      assetRefs:    refs.map((r) => ({ assetType: r.asset_type, assetId: r.asset_id, assetPath: r.asset_path })),
    },
    messages: msgs.map((m) => ({
      messageId:  m.message_id,
      threadId,
      authorId:   m.author_id,
      authorName: m.author_name,
      body:       m.body,
      createdAt:  String(m.created_at),
    })),
  };
}

export async function createThread(
  title: string,
  body: string,
  authorId: string,
  authorName: string,
): Promise<number> {
  const threadRows = await sql<{ thread_id: number }[]>`
    INSERT INTO bayanat.collab_threads (title, created_by)
    VALUES (${title}, ${authorId})
    RETURNING thread_id
  `;
  const threadId = threadRows[0].thread_id;

  const msgRows = await sql<{ message_id: number }[]>`
    INSERT INTO bayanat.collab_messages (thread_id, author_id, body)
    VALUES (${threadId}, ${authorId}, ${body})
    RETURNING message_id
  `;
  const messageId = msgRows[0].message_id;

  // Store parsed asset refs (non-fatal failures)
  for (const ref of extractAssetRefs(body)) {
    try {
      await sql`
        INSERT INTO bayanat.collab_asset_refs (thread_id, message_id, asset_type, asset_id, asset_path)
        VALUES (${threadId}, ${messageId}, ${ref.assetType}, ${ref.assetId}, ${ref.assetPath})
      `;
    } catch (err) {
      console.warn("[collab] asset_ref insert failed:", err);
    }
  }

  // Notify mentioned users (non-fatal)
  for (const userId of extractMentionedUserIds(body)) {
    if (userId === authorId) continue;
    await sendNotification(
      userId,
      `${authorName} mentioned you in "${title}"`,
      body.slice(0, 200),
      `/collaboration/${threadId}`,
    );
  }

  return threadId;
}

export async function addMessage(
  threadId: number,
  authorId: string,
  authorName: string,
  body: string,
  threadTitle: string,
): Promise<number> {
  const rows = await sql<{ message_id: number }[]>`
    INSERT INTO bayanat.collab_messages (thread_id, author_id, body)
    VALUES (${threadId}, ${authorId}, ${body})
    RETURNING message_id
  `;
  const messageId = rows[0].message_id;

  // Store new asset refs (non-fatal)
  for (const ref of extractAssetRefs(body)) {
    try {
      await sql`
        INSERT INTO bayanat.collab_asset_refs (thread_id, message_id, asset_type, asset_id, asset_path)
        VALUES (${threadId}, ${messageId}, ${ref.assetType}, ${ref.assetId}, ${ref.assetPath})
      `;
    } catch (err) {
      console.warn("[collab] asset_ref insert failed:", err);
    }
  }

  // Notify mentioned users (non-fatal)
  for (const userId of extractMentionedUserIds(body)) {
    if (userId === authorId) continue;
    await sendNotification(
      userId,
      `${authorName} mentioned you in "${threadTitle}"`,
      body.slice(0, 200),
      `/collaboration/${threadId}`,
    );
  }

  return messageId;
}
