// AI Chat Assistant orchestrator (spec §1, §5). Runs the tool-calling loop: call the
// LLM → if it asks for tools, execute them as the session user → feed results back →
// repeat, hard-capped at 5 tool-enabled rounds (spec §5), then one final forced
// no-tools round so the model must answer with whatever it has gathered.
//
// Contract: the caller (the messages API route) persists the USER message to
// bayanat.chat_messages BEFORE calling runChatTurn — this function loads the full
// prior history (including that just-persisted turn) via getMessages() rather than
// taking the new text as a separate parameter, so there's exactly one place a
// message can enter the conversation history.

import { resolveProviderForCapability } from "@/lib/enrichment/provider-router";
import { callProfileChat, type ChatMessage, type ContentBlock } from "@/lib/enrichment/llm-adapters";
import { logUsage } from "@/lib/queries/llm-providers";
import { getMessages } from "@/lib/queries/chat";
import { TOOL_REGISTRY, TOOL_DEFS_FOR_LLM } from "./tools";
import { buildSystemPrompt, type ChatContextAsset } from "./system-prompt";
import { progressLabelForTool } from "./progress-labels";
import type { SourceRef, ToolExecContext } from "./types";
import type { SessionUser } from "@/lib/types";

const TOOL_ROUND_CAP = 5;

// "complete" isn't a streamed event — it's the function's return value, since the
// caller needs the persisted messageId before it can tell the client the turn is
// done, and only the caller (the messages API route) does that persistence.
export type OrchestratorEvent = { type: "progress"; label: string };

export type ToolTraceEntry = { tool: string; args: Record<string, unknown>; resultRefs: SourceRef[]; error?: string };

export type ChatTurnResult =
  | { ok: true; text: string; sources: SourceRef[]; toolTrace: ToolTraceEntry[]; modelRef: string; tokenCount: number }
  | { ok: false; error: string };

function textFromBlocks(blocks: ContentBlock[]): string {
  return blocks.filter((c): c is Extract<ContentBlock, { type: "text" }> => c.type === "text").map((c) => c.text).join("\n").trim();
}

// postgres.js returns bigint/numeric columns (e.g. row_count_estimate) as JS
// BigInt, which plain JSON.stringify cannot serialize (it throws) — that failure
// was previously swallowed into a generic tool error, silently breaking any tool
// whose data touched such a column. Coerce BigInt -> Number before it ever reaches
// JSON.stringify, here and nowhere else, so every tool is covered without each
// adapter having to remember to do it.
function stringifySafe(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? Number(v) : v));
}

export async function runChatTurn(
  conversationId: number,
  session: SessionUser,
  contextAsset: ChatContextAsset,
  onEvent?: (e: OrchestratorEvent) => void,
): Promise<ChatTurnResult> {
  const resolved = await resolveProviderForCapability("CHAT");
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const { profile, apiKey } = resolved;

  const priorRows = await getMessages(conversationId);
  const messages: ChatMessage[] = priorRows.map((r) => ({
    role: r.roleCode === "USER" ? "user" : "assistant",
    content: r.contentText,
  }));

  const system = buildSystemPrompt({ contextAsset });
  const ctx: ToolExecContext = { session };

  const toolTrace: ToolTraceEntry[] = [];
  const sourcesByKey = new Map<string, SourceRef>();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let round = 0; round <= TOOL_ROUND_CAP; round++) {
    const forcedFinal = round === TOOL_ROUND_CAP;
    let result;
    try {
      result = await callProfileChat(profile, apiKey, system, messages, forcedFinal ? [] : TOOL_DEFS_FOR_LLM, profile.maxTokens);
    } catch (err) {
      const message = err instanceof Error ? err.message : "LLM call failed";
      await logUsage(profile.profileId, "CHAT", totalInputTokens, totalOutputTokens, false, message).catch(() => {});
      return { ok: false, error: message };
    }
    totalInputTokens += result.inputTokens;
    totalOutputTokens += result.outputTokens;

    if (result.stopReason !== "tool_use") {
      const text = textFromBlocks(result.content) || "I wasn't able to compose an answer for that — could you rephrase?";
      await logUsage(profile.profileId, "CHAT", totalInputTokens, totalOutputTokens, true).catch(() => {});
      return { ok: true, text, sources: [...sourcesByKey.values()], toolTrace, modelRef: profile.modelName, tokenCount: totalInputTokens + totalOutputTokens };
    }

    messages.push({ role: "assistant", content: result.content });
    const toolUseBlocks = result.content.filter((c): c is Extract<ContentBlock, { type: "tool_use" }> => c.type === "tool_use");
    const resultBlocks: ContentBlock[] = [];

    for (const tu of toolUseBlocks) {
      onEvent?.({ type: "progress", label: progressLabelForTool(tu.name) });
      const tool = TOOL_REGISTRY[tu.name];
      if (!tool) {
        resultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content: `Unknown tool "${tu.name}"`, is_error: true });
        toolTrace.push({ tool: tu.name, args: tu.input, resultRefs: [], error: "unknown tool" });
        continue;
      }
      try {
        const r = await tool.run(tu.input, ctx);
        if (r.ok) {
          for (const s of r.sources) sourcesByKey.set(`${s.assetType}:${s.assetId}`, s);
          resultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content: stringifySafe(r.data) });
          toolTrace.push({ tool: tu.name, args: tu.input, resultRefs: r.sources });
        } else {
          resultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content: r.error, is_error: true });
          toolTrace.push({ tool: tu.name, args: tu.input, resultRefs: [], error: r.error });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Tool execution failed";
        resultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content: message, is_error: true });
        toolTrace.push({ tool: tu.name, args: tu.input, resultRefs: [], error: message });
      }
    }
    messages.push({ role: "user", content: resultBlocks });
  }

  // Unreachable in practice — the forced-final round passes tools:[] so the model
  // cannot return stop_reason "tool_use" there. Kept as a safety net regardless.
  await logUsage(profile.profileId, "CHAT", totalInputTokens, totalOutputTokens, true).catch(() => {});
  const text = "I wasn't able to fully answer within the allotted tool calls — could you narrow your question?";
  return { ok: true, text, sources: [...sourcesByKey.values()], toolTrace, modelRef: profile.modelName, tokenCount: totalInputTokens + totalOutputTokens };
}
