"use client";
import { useCallback, useRef, useState } from "react";
import type { SourceRef } from "./types";

export type ChatUiMessage = {
  messageId:    number;
  role:         "USER" | "ASSISTANT";
  text:         string;
  sources:      SourceRef[];
  feedbackCode: "UP" | "DOWN" | null;
};

type ServerMessage = {
  messageId: number; roleCode: "USER" | "ASSISTANT"; contentText: string;
  sourcesJson: SourceRef[] | null; feedbackCode: "UP" | "DOWN" | null;
};

let tempIdCounter = -1;

function toUiMessage(m: ServerMessage): ChatUiMessage {
  return { messageId: m.messageId, role: m.roleCode, text: m.contentText, sources: m.sourcesJson ?? [], feedbackCode: m.feedbackCode };
}

// Single implementation both the ChatbotBubble panel and the /chat full page call
// into — owns conversation state, the SSE fetch()+manual-reader parse (not native
// EventSource, since that only supports GET and this needs a POST body), and the
// send/feedback/delete actions.
export function useChatSession() {
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setProgressLabel(null);
    setError(null);
  }, []);

  const loadConversation = useCallback(async (id: number) => {
    setError(null);
    const r = await fetch(`/api/chat/conversations/${id}`);
    if (!r.ok) { setError("Couldn't load that conversation."); return; }
    const data = await r.json();
    setConversationId(id);
    setMessages((data.messages as ServerMessage[]).map(toUiMessage));
  }, []);

  const send = useCallback(async (text: string, contextAsset?: { assetType: string; assetId: number } | null) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    setSending(true);

    setMessages((prev) => [...prev, { messageId: tempIdCounter--, role: "USER", text: trimmed, sources: [], feedbackCode: null }]);

    try {
      let cid = conversationId;
      if (!cid) {
        const createRes = await fetch("/api/chat/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contextAssetType: contextAsset?.assetType ?? null, contextAssetId: contextAsset?.assetId ?? null }),
        });
        if (!createRes.ok) throw new Error("Couldn't start a conversation.");
        const { conversationId: newId } = await createRes.json();
        cid = newId;
        setConversationId(newId);
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const res = await fetch(`/api/chat/conversations/${cid}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error("Assistant unavailable. Please try again shortly.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIdx = buffer.indexOf("\n\n");
        while (sepIdx !== -1) {
          const chunk = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          const eventMatch = chunk.match(/^event: (.+)$/m);
          const dataMatch = chunk.match(/^data: (.+)$/m);
          if (eventMatch && dataMatch) {
            const eventName = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);
            if (eventName === "progress") {
              setProgressLabel(data.label);
            } else if (eventName === "complete") {
              setProgressLabel(null);
              setMessages((prev) => [...prev, { messageId: data.messageId, role: "ASSISTANT", text: data.text, sources: data.sources ?? [], feedbackCode: null }]);
            } else if (eventName === "error") {
              setProgressLabel(null);
              setError(data.error ?? "Assistant unavailable.");
            }
          }
          sepIdx = buffer.indexOf("\n\n");
        }
      }
    } catch (err) {
      setProgressLabel(null);
      setError(err instanceof Error ? err.message : "Assistant unavailable. Please try again shortly.");
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [conversationId, sending]);

  const submitFeedback = useCallback(async (messageId: number, feedbackCode: "UP" | "DOWN", comment?: string) => {
    setMessages((prev) => prev.map((m) => (m.messageId === messageId ? { ...m, feedbackCode } : m)));
    await fetch(`/api/chat/messages/${messageId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedbackCode, comment: comment ?? null }),
    }).catch(() => {});
  }, []);

  const deleteCurrentConversation = useCallback(async () => {
    if (!conversationId) { reset(); return; }
    await fetch(`/api/chat/conversations/${conversationId}`, { method: "DELETE" }).catch(() => {});
    reset();
  }, [conversationId, reset]);

  return { conversationId, messages, progressLabel, sending, error, send, loadConversation, reset, submitFeedback, deleteCurrentConversation };
}
