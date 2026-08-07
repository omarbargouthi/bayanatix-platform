import { sql } from "../db";

export type ChatRoleCode = "USER" | "ASSISTANT";
export type ChatFeedbackCode = "UP" | "DOWN";

export type ChatConversation = {
  conversationId:    number;
  userId:            string;
  titleText:         string | null;
  contextAssetType:  string | null;
  contextAssetId:    number | null;
  createdAt:         string;
  lastMessageAt:     string;
};

export type ChatMessageRow = {
  messageId:            number;
  conversationId:       number;
  roleCode:             ChatRoleCode;
  contentText:          string;
  toolTraceJson:        unknown;
  sourcesJson:          unknown;
  modelRefText:         string | null;
  tokenCountInt:        number | null;
  feedbackCode:         ChatFeedbackCode | null;
  feedbackCommentText:  string | null;
  createdAt:            string;
};

const CONVERSATION_COLS = `
  conversation_id AS "conversationId", user_id AS "userId", title_text AS "titleText",
  context_asset_type AS "contextAssetType", context_asset_id AS "contextAssetId",
  created_at::text AS "createdAt", last_message_at::text AS "lastMessageAt"
`;

const MESSAGE_COLS = `
  message_id AS "messageId", conversation_id AS "conversationId", role_code AS "roleCode",
  content_text AS "contentText", tool_trace_json AS "toolTraceJson", sources_json AS "sourcesJson",
  model_ref_text AS "modelRefText", token_count_int AS "tokenCountInt",
  feedback_code AS "feedbackCode", feedback_comment_text AS "feedbackCommentText", created_at::text AS "createdAt"
`;

export async function createConversation(
  userId: string, contextAssetType: string | null, contextAssetId: number | null,
): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.chat_conversations (user_id, context_asset_type, context_asset_id)
    VALUES (${userId}, ${contextAssetType}, ${contextAssetId})
    RETURNING conversation_id AS id
  `;
  return row.id;
}

export async function listConversations(userId: string): Promise<ChatConversation[]> {
  return sql<ChatConversation[]>`
    SELECT ${sql.unsafe(CONVERSATION_COLS)}
    FROM bayanat.chat_conversations
    WHERE user_id = ${userId}
    ORDER BY last_message_at DESC
    LIMIT 100
  `;
}

export async function getConversation(conversationId: number): Promise<ChatConversation | null> {
  const rows = await sql<ChatConversation[]>`
    SELECT ${sql.unsafe(CONVERSATION_COLS)}
    FROM bayanat.chat_conversations WHERE conversation_id = ${conversationId}
  `;
  return rows[0] ?? null;
}

export async function getMessages(conversationId: number): Promise<ChatMessageRow[]> {
  return sql<ChatMessageRow[]>`
    SELECT ${sql.unsafe(MESSAGE_COLS)}
    FROM bayanat.chat_messages
    WHERE conversation_id = ${conversationId}
    ORDER BY message_id
  `;
}

export async function appendMessage(data: {
  conversationId: number; roleCode: ChatRoleCode; contentText: string;
  toolTraceJson?: unknown; sourcesJson?: unknown;
  modelRefText?: string | null; tokenCountInt?: number | null;
}): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.chat_messages
      (conversation_id, role_code, content_text, tool_trace_json, sources_json, model_ref_text, token_count_int)
    VALUES (
      ${data.conversationId}, ${data.roleCode}, ${data.contentText},
      ${(data.toolTraceJson ?? null) as any}::jsonb, ${(data.sourcesJson ?? null) as any}::jsonb,
      ${data.modelRefText ?? null}, ${data.tokenCountInt ?? null}
    )
    RETURNING message_id AS id
  `;
  await sql`UPDATE bayanat.chat_conversations SET last_message_at = now() WHERE conversation_id = ${data.conversationId}`;
  return row.id;
}

export async function updateConversationTitle(conversationId: number, titleText: string): Promise<void> {
  await sql`UPDATE bayanat.chat_conversations SET title_text = ${titleText} WHERE conversation_id = ${conversationId}`;
}

export async function deleteConversation(conversationId: number): Promise<void> {
  await sql`DELETE FROM bayanat.chat_conversations WHERE conversation_id = ${conversationId}`;
}

export async function setFeedback(messageId: number, feedbackCode: ChatFeedbackCode, comment: string | null): Promise<void> {
  await sql`
    UPDATE bayanat.chat_messages
    SET feedback_code = ${feedbackCode}, feedback_comment_text = ${comment}
    WHERE message_id = ${messageId}
  `;
}
