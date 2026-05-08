"use client";
import { useState } from "react";

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

export function ChatbotBubble() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

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
                <div className="text-sm font-semibold leading-none">Bayanatix Assistant</div>
                <div className="text-[10px] text-white/60 mt-0.5">Data Governance AI</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 flex items-center justify-center rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto nice-scroll p-4 flex flex-col gap-3">
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-purple to-brand-violet flex items-center justify-center shrink-0 mt-0.5">
                <ChatIcon />
              </div>
              <div className="bg-canvas rounded-lg rounded-tl-none px-3 py-2 text-sm text-ink max-w-[220px]">
                Hello! I can help you navigate data assets, explain governance policies, or find tables and columns. What do you need?
              </div>
            </div>
          </div>

          {/* Input */}
          <div className="p-3 border-t border-line flex gap-2 shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setInput(""); }}
              className="flex-1 field-input text-sm py-2"
              placeholder="Ask about data assets…"
            />
            <button
              onClick={() => setInput("")}
              className="btn btn-primary btn-sm !px-3"
            >
              <SendIcon />
            </button>
          </div>
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
