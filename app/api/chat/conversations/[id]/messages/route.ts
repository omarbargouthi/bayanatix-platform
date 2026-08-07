import { getSession } from "@/lib/auth";
import { getConversation, appendMessage, updateConversationTitle } from "@/lib/queries/chat";
import { runChatTurn, type OrchestratorEvent } from "@/lib/chat/orchestrator";
import type { ChatContextAsset } from "@/lib/chat/system-prompt";

export const runtime = "nodejs";

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function truncateTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
}

// POST { text: string } — persists the user's message, then streams the
// orchestrator's tool-calling progress over SSE, ending with a `complete` event
// once the assistant's reply has been generated and persisted. Uses fetch()+manual
// reader parsing on the client rather than native EventSource, since EventSource
// only supports GET and this needs a POST body (spec §5 degradation: on provider
// failure, emits an `error` event the UI renders as "assistant unavailable").
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const conversationId = Number(params.id);
  const conversation = await getConversation(conversationId);
  if (!conversation || conversation.userId !== session.userId) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return new Response(JSON.stringify({ error: "text is required" }), { status: 400 });

  await appendMessage({ conversationId, roleCode: "USER", contentText: text });
  if (!conversation.titleText) {
    await updateConversationTitle(conversationId, truncateTitle(text));
  }

  const contextAsset: ChatContextAsset =
    conversation.contextAssetType && conversation.contextAssetId != null
      ? { assetType: conversation.contextAssetType, assetId: conversation.contextAssetId }
      : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const onEvent = (e: OrchestratorEvent) => {
        controller.enqueue(encoder.encode(sseEvent("progress", { label: e.label })));
      };

      let result;
      try {
        result = await runChatTurn(conversationId, session, contextAsset, onEvent);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Assistant unavailable";
        controller.enqueue(encoder.encode(sseEvent("error", { error: message })));
        controller.close();
        return;
      }

      if (!result.ok) {
        controller.enqueue(encoder.encode(sseEvent("error", { error: "Assistant unavailable. Please try again shortly." })));
        controller.close();
        return;
      }

      const messageId = await appendMessage({
        conversationId,
        roleCode: "ASSISTANT",
        contentText: result.text,
        toolTraceJson: result.toolTrace,
        sourcesJson: result.sources,
        modelRefText: result.modelRef,
        tokenCountInt: result.tokenCount,
      });

      controller.enqueue(encoder.encode(sseEvent("complete", { messageId, text: result.text, sources: result.sources })));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
