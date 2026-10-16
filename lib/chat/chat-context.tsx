"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ChatRecord } from "./page-context";

export type ChatAsset = { assetType: string; assetId: number; assetName: string };
export type ChatAssetContext = ChatAsset | null;

type StackEntry = { key: number; asset: ChatAsset };
type Ctx = {
  contextAsset: ChatAssetContext; push: (asset: ChatAsset) => number; pop: (key: number) => void;
  record: ChatRecord | null; setRecord: (key: number, record: ChatRecord | null) => void;
};

const ChatAssetCtx = createContext<Ctx>({ contextAsset: null, push: () => 0, pop: () => {}, record: null, setRecord: () => {} });

// External consumers only ever read the current asset — pushing/popping is the
// exclusive job of useSetChatAssetContext below.
export const useChatAssetContext = () => {
  const { contextAsset } = useContext(ChatAssetCtx);
  return { contextAsset };
};

let nextKey = 1;

// A LIFO stack, not a single value: table and column detail can both be mounted at
// once (e.g. a table page with an expanded column row), each calling
// useSetChatAssetContext independently. A single shared value would have the
// column's unmount clobber the table's still-active context back to null instead
// of restoring it — the stack makes "current context" always the most specific
// (innermost) asset still mounted, and popping one entry correctly reveals
// whichever was pushed before it.
export function ChatAssetContextProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<StackEntry[]>([]);

  const push = (asset: ChatAsset) => {
    const key = nextKey++;
    setStack((prev) => [...prev, { key, asset }]);
    return key;
  };
  const pop = (key: number) => {
    setStack((prev) => prev.filter((e) => e.key !== key));
  };

  const contextAsset = stack.length > 0 ? stack[stack.length - 1].asset : null;

  // The record the current page shows, with the facts it shares (useSetChatRecord).
  const [records, setRecords] = useState<{ key: number; record: ChatRecord }[]>([]);
  const setRecord = (key: number, record: ChatRecord | null) =>
    setRecords((prev) => [...prev.filter((e) => e.key !== key), ...(record ? [{ key, record }] : [])]);
  const record = records.length > 0 ? records[records.length - 1].record : null;

  return <ChatAssetCtx.Provider value={{ contextAsset, push, pop, record, setRecord }}>{children}</ChatAssetCtx.Provider>;
}

/** The record shown on the current page, for Ask Bayanis. */
export const useChatRecord = () => useContext(ChatAssetCtx).record;

/**
 * Call from a record page with the facts it displays, so Ask Bayanis can answer "why is
 * this overdue?" about it. Share statuses, dates, codes and counts the user can see;
 * never names, contact details or free text that may hold personal data, since the
 * facts are sent to the AI provider. Pass null while the record is loading.
 */
export function useSetChatRecord(record: ChatRecord | null) {
  const ctx = useContext(ChatAssetCtx);
  const keyRef = useRef<number>(0);
  if (!keyRef.current) keyRef.current = nextKey++;
  const json = record ? JSON.stringify(record) : "";
  useEffect(() => {
    ctx.setRecord(keyRef.current, json ? (JSON.parse(json) as ChatRecord) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json]);
  useEffect(() => () => ctx.setRecord(keyRef.current, null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
}

// Call from an asset detail page (or a nested expandable row) so a NEW chat
// conversation opened while it's mounted picks up its type/id as conversation
// context (spec FR-1.2).
export function useSetChatAssetContext(asset: ChatAsset | null) {
  const ctx = useContext(ChatAssetCtx);
  const keyRef = useRef<number | null>(null);

  useEffect(() => {
    if (!asset) return;
    const key = ctx.push(asset);
    keyRef.current = key;
    return () => {
      ctx.pop(key);
      keyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.assetType, asset?.assetId, asset?.assetName]);
}
