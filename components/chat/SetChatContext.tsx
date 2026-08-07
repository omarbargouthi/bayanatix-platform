"use client";
import { useSetChatAssetContext } from "@/lib/chat/chat-context";

// Registers the current page's asset as chat context (spec FR-1.2) so a NEW
// conversation opened from this page starts already scoped to it. Renders nothing.
export function SetChatContext({ assetType, assetId, assetName }: { assetType: string; assetId: number; assetName: string }) {
  useSetChatAssetContext({ assetType, assetId, assetName });
  return null;
}
