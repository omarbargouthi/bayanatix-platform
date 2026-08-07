"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useChatSession } from "@/lib/chat/useChatSession";
import { useChatAssetContext } from "@/lib/chat/chat-context";
import { pageKindForPath, STARTER_QUESTIONS } from "@/lib/chat/starter-questions";
import { useLang } from "@/lib/lang-context";
import { ChatThread } from "@/components/chat/ChatThread";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ConversationList } from "@/components/chat/ConversationList";

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

export function ChatbotBubble() {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const pathname = usePathname();
  const { t } = useLang();
  const c = t.chat;
  const { contextAsset } = useChatAssetContext();
  const { conversationId, messages, progressLabel, sending, error, send, loadConversation, reset, submitFeedback } = useChatSession();

  const pageKind = pageKindForPath(pathname ?? "");
  const starters = STARTER_QUESTIONS[pageKind];

  function handleSend(text: string) {
    send(text, contextAsset ? { assetType: contextAsset.assetType, assetId: contextAsset.assetId } : null);
    if (!conversationId) setHistoryKey((k) => k + 1);
  }

  function handleNew() {
    reset();
    setShowHistory(false);
  }

  async function handleSelect(id: number) {
    await loadConversation(id);
    setShowHistory(false);
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[320px] bg-white border border-line rounded-xl shadow-md flex flex-col overflow-hidden"
          style={{ height: 380 }}>

          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-brand-deep to-brand-purple text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <ChatIcon />
              <div>
                <div className="text-sm font-semibold leading-none">{c.headerTitle}</div>
                <div className="text-[10px] text-white/60 mt-0.5">{c.headerSubtitle}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="w-6 h-6 flex items-center justify-center rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                title={c.history}
              >
                <HistoryIcon />
              </button>
              <Link
                href="/chat"
                className="w-6 h-6 flex items-center justify-center rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                title="Open full page"
              >
                <ExpandIcon />
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>
          </div>

          {showHistory ? (
            <ConversationList activeId={conversationId} onSelect={handleSelect} onNew={handleNew} refreshKey={historyKey} />
          ) : (
            <>
              <ChatThread
                messages={messages}
                progressLabel={progressLabel}
                error={error}
                onFeedback={submitFeedback}
                emptyState={
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-purple to-brand-violet flex items-center justify-center shrink-0 mt-0.5 text-white text-[10px] font-bold">AI</div>
                      <div className="bg-canvas rounded-lg rounded-tl-none px-3 py-2 text-sm text-ink max-w-[220px]">
                        {c.greeting}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 pl-9">
                      {starters.map((q) => (
                        <button
                          key={q}
                          onClick={() => handleSend(q)}
                          className="text-left text-[11px] px-2.5 py-1.5 rounded-lg border border-line hover:border-brand-purple/40 hover:bg-canvas-soft transition-colors text-ink-soft"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                }
              />
              <ChatComposer onSend={handleSend} disabled={sending} placeholder={c.placeholder} />
            </>
          )}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-14 h-14 rounded-full bg-gradient-to-br from-brand-purple to-brand-violet text-white shadow-md hover:shadow-lg transition-all flex items-center justify-center"
        aria-label="Open assistant"
      >
        {open
          ? <span className="text-2xl leading-none font-light">×</span>
          : <ChatIcon />
        }
      </button>
    </div>
  );
}
