"use client";
import type { ReactNode } from "react";
import type { ChatUiMessage } from "@/lib/chat/useChatSession";
import { SourceChips } from "./SourceChips";
import { FeedbackButtons } from "./FeedbackButtons";

function AiAvatar() {
  return (
    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-purple to-brand-violet flex items-center justify-center shrink-0 mt-0.5 text-white text-[10px] font-bold">
      AI
    </div>
  );
}

export function ChatThread({
  messages,
  progressLabel,
  error,
  onFeedback,
  emptyState,
  bubbleMaxWidth = "max-w-[220px]",
}: {
  messages: ChatUiMessage[];
  progressLabel: string | null;
  error: string | null;
  onFeedback: (messageId: number, code: "UP" | "DOWN", comment?: string) => void;
  emptyState?: ReactNode;
  bubbleMaxWidth?: string;
}) {
  return (
    <div className="flex-1 overflow-y-auto nice-scroll p-4 flex flex-col gap-3">
      {messages.length === 0 && !progressLabel && !error && emptyState}

      {messages.map((m) => (
        <div key={m.messageId} className={`flex gap-2 ${m.role === "USER" ? "justify-end" : ""}`}>
          {m.role === "ASSISTANT" && <AiAvatar />}
          <div
            className={`${bubbleMaxWidth} px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === "USER" ? "bg-brand-purple text-white rounded-lg rounded-tr-none" : "bg-canvas text-ink rounded-lg rounded-tl-none"
            }`}
          >
            {m.text}
            {m.role === "ASSISTANT" && <SourceChips sources={m.sources} />}
            {m.role === "ASSISTANT" && (
              <FeedbackButtons feedbackCode={m.feedbackCode} onSubmit={(code, comment) => onFeedback(m.messageId, code, comment)} />
            )}
          </div>
        </div>
      ))}

      {progressLabel && (
        <div className="flex gap-2">
          <AiAvatar />
          <div className="bg-canvas rounded-lg rounded-tl-none px-3 py-2 text-sm text-muted italic">{progressLabel}</div>
        </div>
      )}

      {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
    </div>
  );
}
