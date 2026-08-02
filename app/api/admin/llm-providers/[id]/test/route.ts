import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProfileById, getDecryptedCredential, updateHealthStatus, logUsage } from "@/lib/queries/llm-providers";
import { callProfile } from "@/lib/enrichment/llm-adapters";

// Test Connection (spec §6.1): canary prompt, reports latency + token count. Always
// runs live (bypasses the router's 5-minute health-check cache) since this is an
// explicit admin action, and updates the persisted health status either way.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const profileId = Number(params.id);
  if (!Number.isFinite(profileId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const profile = await getProfileById(profileId);
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const apiKey = await getDecryptedCredential(profileId);
  const startedAt = Date.now();
  try {
    const { text, inputTokens, outputTokens } = await callProfile(profile, apiKey, "Reply with the single word OK.", 10);
    const latencyMs = Date.now() - startedAt;
    await updateHealthStatus(profileId, "HEALTHY", null);
    await logUsage(profileId, "TEST_CONNECTION", inputTokens, outputTokens, true);
    return NextResponse.json({ ok: true, latencyMs, inputTokens, outputTokens, sample: text.slice(0, 100) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Test connection failed";
    const latencyMs = Date.now() - startedAt;
    await updateHealthStatus(profileId, "UNHEALTHY", message);
    await logUsage(profileId, "TEST_CONNECTION", 0, 0, false, message);
    return NextResponse.json({ ok: false, error: message, latencyMs }, { status: 502 });
  }
}
