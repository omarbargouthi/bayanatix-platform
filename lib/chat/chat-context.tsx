"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export type ChatAsset = { assetType: string; assetId: number; assetName: string };
export type ChatAssetContext = ChatAsset | null;

type StackEntry = { key: number; asset: ChatAsset };
type Ctx = { contextAsset: ChatAssetContext; push: (asset: ChatAsset) => number; pop: (key: number) => void };

const ChatAssetCtx = createContext<Ctx>({ contextAsset: null, push: () => 0, pop: () => {} });

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

  return <ChatAssetCtx.Provider value={{ contextAsset, push, pop }}>{children}</ChatAssetCtx.Provider>;
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
