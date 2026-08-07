"use client";
import { useState } from "react";

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

export function ChatComposer({
  onSend,
  disabled,
  placeholder,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function submit() {
    if (!input.trim() || disabled) return;
    onSend(input);
    setInput("");
  }

  return (
    <div className="p-3 border-t border-line flex gap-2 shrink-0">
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        className="flex-1 field-input text-sm py-2"
        placeholder={placeholder ?? "Ask about data assets…"}
        disabled={disabled}
      />
      <button onClick={submit} disabled={disabled || !input.trim()} className="btn btn-primary btn-sm !px-3 disabled:opacity-50">
        <SendIcon />
      </button>
    </div>
  );
}
