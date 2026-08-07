// LLM Provider Configuration — request adapters (spec §2.2). Every provider speaks
// through one of these two working adapters (OPENAI_COMPAT covers vLLM/Ollama/Azure
// OpenAI/most gateways; ANTHROPIC covers the Claude-native API). BEDROCK/VERTEX are
// schema-supported for future profiles but not yet wired to a real SDK — calling one
// fails loudly rather than silently misbehaving.

import { listProfiles, type ProviderProfile } from "../queries/llm-providers";

export type AdapterResult = { text: string; inputTokens: number; outputTokens: number };

/** Egress guard (spec §5, AC7): refuse to call any URL that isn't a registered
 *  profile's base_url, even though every call site here only ever passes a
 *  profile's own stored base_url — defense in depth against a future regression. */
async function assertUrlAllowed(url: string): Promise<void> {
  const allProfiles = await listProfiles();
  const allowed = allProfiles.some((p) => url === p.baseUrl || url.startsWith(`${p.baseUrl.replace(/\/$/, "")}/`));
  if (!allowed) throw new Error(`Egress blocked: "${url}" is not a registered LLM provider base_url`);
}

export async function callOpenAiCompat(profile: ProviderProfile, apiKey: string | null, prompt: string, maxTokens: number): Promise<AdapterResult> {
  await assertUrlAllowed(profile.baseUrl);
  const url = `${profile.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), profile.timeoutSeconds * 1000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({
        model: profile.modelName,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: profile.temperature,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${profile.profileName}: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    return {
      text,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function callAnthropicNative(profile: ProviderProfile, apiKey: string | null, prompt: string, maxTokens: number): Promise<AdapterResult> {
  await assertUrlAllowed(profile.baseUrl);
  if (!apiKey) throw new Error(`${profile.profileName}: no credential configured`);
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey, baseURL: profile.baseUrl, timeout: profile.timeoutSeconds * 1000 });
  const response = await client.messages.create({
    model: profile.modelName,
    max_tokens: maxTokens,
    temperature: profile.temperature,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content[0];
  const text = block.type === "text" ? block.text.trim() : "";
  return { text, inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 };
}

export async function callProfile(profile: ProviderProfile, apiKey: string | null, prompt: string, maxTokens: number): Promise<AdapterResult> {
  switch (profile.apiFlavor) {
    case "OPENAI_COMPAT":
      return callOpenAiCompat(profile, apiKey, prompt, maxTokens);
    case "ANTHROPIC":
      return callAnthropicNative(profile, apiKey, prompt, maxTokens);
    case "BEDROCK":
    case "VERTEX":
      throw new Error(`${profile.profileName}: ${profile.apiFlavor} adapter is not implemented yet — use OPENAI_COMPAT or ANTHROPIC`);
    default:
      throw new Error(`${profile.profileName}: unknown api_flavor_code "${profile.apiFlavor}"`);
  }
}

// ── Chat / tool-calling adapters (AI Chat Assistant spec §1) ───────────────────
// Sibling to the single-prompt functions above — every existing enrichment call
// site (description suggest/rephrase, DQ semantic rules) keeps using callProfile()
// unchanged. These support multi-turn message history + tool-calling, modeled on
// Anthropic's native content-block shape since that's the richer of the two APIs;
// the OpenAI-compat adapter translates to/from it.

export type ChatRole = "user" | "assistant";
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type ChatMessage = { role: ChatRole; content: string | ContentBlock[] };
export type ToolDef = { name: string; description: string; input_schema: object };
export type ChatStopReason = "end_turn" | "tool_use" | "max_tokens";
export type ChatAdapterResult = {
  stopReason: ChatStopReason;
  content: ContentBlock[];
  inputTokens: number;
  outputTokens: number;
};

export async function callAnthropicChat(
  profile: ProviderProfile, apiKey: string | null, system: string,
  messages: ChatMessage[], tools: ToolDef[], maxTokens: number,
): Promise<ChatAdapterResult> {
  await assertUrlAllowed(profile.baseUrl);
  if (!apiKey) throw new Error(`${profile.profileName}: no credential configured`);
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey, baseURL: profile.baseUrl, timeout: profile.timeoutSeconds * 1000 });
  const response = await client.messages.create({
    model: profile.modelName,
    max_tokens: maxTokens,
    temperature: profile.temperature,
    system,
    messages: messages as any,
    tools: tools.length > 0 ? (tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })) as any) : undefined,
  });

  const content: ContentBlock[] = response.content.map((b): ContentBlock => {
    if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input as Record<string, unknown> };
    if (b.type === "text") return { type: "text", text: b.text };
    return { type: "text", text: "" };
  });
  const stopReason: ChatStopReason =
    response.stop_reason === "tool_use" ? "tool_use" : response.stop_reason === "max_tokens" ? "max_tokens" : "end_turn";
  return { stopReason, content, inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 };
}

export async function callOpenAiCompatChat(
  profile: ProviderProfile, apiKey: string | null, system: string,
  messages: ChatMessage[], tools: ToolDef[], maxTokens: number,
): Promise<ChatAdapterResult> {
  await assertUrlAllowed(profile.baseUrl);
  const url = `${profile.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), profile.timeoutSeconds * 1000);
  try {
    const oaMessages: Array<Record<string, unknown>> = [{ role: "system", content: system }];
    for (const m of messages) {
      if (typeof m.content === "string") {
        oaMessages.push({ role: m.role, content: m.content });
        continue;
      }
      const textParts = m.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n");
      const toolUses = m.content.filter((c): c is Extract<ContentBlock, { type: "tool_use" }> => c.type === "tool_use");
      const toolResults = m.content.filter((c): c is Extract<ContentBlock, { type: "tool_result" }> => c.type === "tool_result");
      if (toolUses.length > 0) {
        oaMessages.push({
          role: "assistant",
          content: textParts || null,
          tool_calls: toolUses.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.input) } })),
        });
      } else if (toolResults.length > 0) {
        for (const tr of toolResults) oaMessages.push({ role: "tool", tool_call_id: tr.tool_use_id, content: tr.content });
      } else if (textParts) {
        oaMessages.push({ role: m.role, content: textParts });
      }
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({
        model: profile.modelName,
        messages: oaMessages,
        max_tokens: maxTokens,
        temperature: profile.temperature,
        tools: tools.length > 0 ? tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })) : undefined,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${profile.profileName}: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const choice = data.choices?.[0];
    const msg = choice?.message ?? {};
    const content: ContentBlock[] = [];
    if (msg.content) content.push({ type: "text", text: msg.content });
    for (const tc of msg.tool_calls ?? []) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.function?.arguments || "{}"); } catch { input = {}; }
      content.push({ type: "tool_use", id: tc.id, name: tc.function?.name, input });
    }
    const stopReason: ChatStopReason =
      choice?.finish_reason === "tool_calls" ? "tool_use" : choice?.finish_reason === "length" ? "max_tokens" : "end_turn";
    return { stopReason, content, inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function callProfileChat(
  profile: ProviderProfile, apiKey: string | null, system: string,
  messages: ChatMessage[], tools: ToolDef[], maxTokens: number,
): Promise<ChatAdapterResult> {
  switch (profile.apiFlavor) {
    case "OPENAI_COMPAT":
      return callOpenAiCompatChat(profile, apiKey, system, messages, tools, maxTokens);
    case "ANTHROPIC":
      return callAnthropicChat(profile, apiKey, system, messages, tools, maxTokens);
    case "BEDROCK":
    case "VERTEX":
      throw new Error(`${profile.profileName}: ${profile.apiFlavor} adapter is not implemented yet — use OPENAI_COMPAT or ANTHROPIC`);
    default:
      throw new Error(`${profile.profileName}: unknown api_flavor_code "${profile.apiFlavor}"`);
  }
}
