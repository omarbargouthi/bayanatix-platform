"use client";

import { useRef, useState } from "react";
import { MentionPicker } from "./MentionPicker";

interface Props {
  onSubmit:    (body: string) => Promise<void>;
  placeholder?: string;
  rows?:        number;
}

// Detects an active # trigger: # followed by non-whitespace that is NOT already
// a completed token like #asset[...] or #user[...].
const TRIGGER_RE = /#(?!(?:asset|user)\[)([^#\s]*)$/;

export function CollabComposer({ onSubmit, placeholder, rows = 4 }: Props) {
  const taRef      = useRef<HTMLTextAreaElement>(null);
  const [body,        setBody]        = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [triggerPos,  setTriggerPos]  = useState(0);
  const [pickerOpen,  setPickerOpen]  = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val    = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);

    setBody(val);

    const m = TRIGGER_RE.exec(before);
    if (m) {
      setPickerQuery(m[1]);
      setTriggerPos(cursor - m[0].length);
      setPickerOpen(true);
    } else {
      setPickerOpen(false);
    }
  }

  function insertToken(token: string) {
    const ta = taRef.current;
    if (!ta) return;
    const cursor   = ta.selectionStart ?? body.length;
    const newBody  = body.slice(0, triggerPos) + token + " " + body.slice(cursor);
    const newCursor = triggerPos + token.length + 1;
    setBody(newBody);
    setPickerOpen(false);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
    });
  }

  async function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      setBody("");
      setPickerOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={body}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setPickerOpen(false); return; }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
        }}
        placeholder={placeholder ?? "Write a message… Use # to reference an asset or user"}
        rows={rows}
        className="w-full border border-line rounded-lg px-4 py-3 text-sm
                   focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple
                   resize-none font-mono text-[13px] leading-relaxed"
      />

      {pickerOpen && (
        <MentionPicker
          query={pickerQuery}
          onSelect={insertToken}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-muted">
          <kbd className="border border-line rounded px-1 py-0.5 font-mono">#</kbd> asset &nbsp;
          <kbd className="border border-line rounded px-1 py-0.5 font-mono">#user.</kbd> person &nbsp;·&nbsp;
          <kbd className="border border-line rounded px-1 py-0.5 font-mono">Ctrl+↵</kbd> send
        </span>
        <button
          onClick={handleSubmit}
          disabled={!body.trim() || submitting}
          className="btn btn-primary btn-sm"
        >
          {submitting ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
