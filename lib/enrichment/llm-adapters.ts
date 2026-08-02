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
