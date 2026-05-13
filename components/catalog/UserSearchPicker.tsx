"use client";

import { useState, useEffect, useRef } from "react";

type UserResult = { userId: string; fullName: string | null; email: string };

type Props = {
  onSelect:    (user: UserResult) => void;
  excludeIds?: string[];
  placeholder?: string;
};

export function UserSearchPicker({ onSelect, excludeIds = [], placeholder = "Search users…" }: Props) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
        const data: UserResult[] = await r.json();
        setResults(data.filter((u) => !excludeIds.includes(u.userId)));
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, excludeIds.join(",")]);

  function select(u: UserResult) {
    onSelect(u);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function initials(u: UserResult) {
    if (!u.fullName) return u.userId.slice(0, 2).toUpperCase();
    const parts = u.fullName.trim().split(" ");
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 border border-line rounded-lg px-3 py-1.5 bg-white focus-within:border-brand-purple focus-within:ring-2 focus-within:ring-brand-purple/20">
        <svg className="w-3.5 h-3.5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          className="flex-1 text-[13px] outline-none bg-transparent text-ink placeholder:text-muted/60 min-w-0"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading && (
          <span className="w-3 h-3 border-2 border-brand-purple border-t-transparent rounded-full animate-spin shrink-0" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-line rounded-xl shadow-xl overflow-hidden">
          {results.map((u) => (
            <button
              key={u.userId}
              onMouseDown={() => select(u)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-canvas-soft text-left border-b border-line-soft last:border-b-0"
            >
              <div className="w-7 h-7 rounded-full bg-brand-purple/10 text-brand-purple text-[11px] font-bold flex items-center justify-center shrink-0">
                {initials(u)}
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-ink truncate">{u.fullName ?? u.userId}</div>
                <div className="text-[11px] text-muted truncate">{u.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && query.trim() && !loading && results.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-line rounded-xl shadow-xl px-4 py-3 text-[13px] text-muted">
          No users found
        </div>
      )}
    </div>
  );
}
