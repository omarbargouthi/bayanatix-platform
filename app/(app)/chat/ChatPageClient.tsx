"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useChatSession } from "@/lib/chat/useChatSession";
import { useChatAssetContext } from "@/lib/chat/chat-context";
import { ChatThread } from "@/components/chat/ChatThread";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ConversationList } from "@/components/chat/ConversationList";

function ChatPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { contextAsset } = useChatAssetContext();
  const { conversationId, messages, progressLabel, sending, error, send, loadConversation, reset, submitFeedback } = useChatSession();

  const cParam = searchParams.get("c");

  useEffect(() => {
    if (cParam) {
      const id = Number(cParam);
      if (Number.isFinite(id) && id !== conversationId) loadConversation(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cParam]);

  // Keep the URL in sync once a brand-new conversation gets its id (first message
  // in a fresh /chat visit) — replace, not push, so this doesn't pollute history.
  useEffect(() => {
    if (conversationId && cParam !== String(conversationId)) {
      router.replace(`/chat?c=${conversationId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  function handleSend(text: string) {
    send(text, contextAsset ? { assetType: contextAsset.assetType, assetId: contextAsset.assetId } : null);
  }

  function handleSelect(id: number) {
    router.push(`/chat?c=${id}`);
  }

  function handleNew() {
    reset();
    router.push("/chat");
  }

  return (
    <div className="flex h-[calc(100vh-64px)]">
      <div className="w-72 border-r border-line shrink-0">
        <ConversationList activeId={conversationId} onSelect={handleSelect} onNew={handleNew} refreshKey={conversationId ?? "new"} />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <ChatThread
          messages={messages}
          progressLabel={progressLabel}
          error={error}
          onFeedback={submitFeedback}
          bubbleMaxWidth="max-w-[520px]"
          emptyState={<div className="text-center text-muted text-sm py-10">Ask a question about your data assets to get started.</div>}
        />
        <ChatComposer onSend={handleSend} disabled={sending} placeholder="Ask about data assets…" />
      </div>
    </div>
  );
}

export function ChatPageClient() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-muted">Loading…</div>}>
      <ChatPageContent />
    </Suspense>
  );
}
