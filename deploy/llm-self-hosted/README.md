# Bayanatix Self-Hosted LLM (bundled default profile)

Scaffold for the self-hosted open-weights deployment described in *Bayanatix — LLM
Provider Configuration Feature Spec* §4. **Not yet run against real GPU hardware** —
treat this as a documented starting point, not a validated deployment.

## What's here

- `Dockerfile` — vLLM (`vllm/vllm-openai` base image) serving an OpenAI-compatible
  `/v1/chat/completions` endpoint.
- `docker-compose.yml` — two services matching the two placeholder profiles already
  seeded in the app's database:
  - `bayanatix-llm-32b` → `Qwen2.5-32B-Instruct-AWQ` (int4 quantized), port `8000`
  - `bayanatix-llm-7b` → `Qwen2.5-7B-Instruct`, port `8001`, opt-in via
    `docker compose --profile fallback up`
- `health-check.sh` — the canary check baked into the image's `HEALTHCHECK` (a real
  chat-completion call, not just a TCP ping — vLLM accepts connections before the
  model has finished loading).

## Hardware tiers

| Tier | Model | Minimum hardware | Notes |
|---|---|---|---|
| Default | Qwen2.5-32B-Instruct (AWQ int4) | Single 48GB-class GPU (L40S, A6000) or one A100/H100 | Strongest bilingual (AR/EN) quality among the license-clean open-weights options; recommended for production |
| Fallback | Qwen2.5-7B-Instruct | Small GPU (12-16GB) or CPU-only | Reduced quality, still schema-reliable per spec AC8's ≥95% target |

## Bringing one online

1. `docker compose up bayanatix-llm-32b` (add `--build` on first run). First start
   pulls the model weights from Hugging Face (~20GB for the AWQ 32B tier) unless
   you've pre-populated the `hf-cache-32b` volume for an air-gapped install:
   ```bash
   huggingface-cli download Qwen/Qwen2.5-32B-Instruct-AWQ --local-dir ./hf-cache-32b
   docker compose run --rm -v ./hf-cache-32b:/root/.cache/huggingface -e HF_HUB_OFFLINE=1 bayanatix-llm-32b
   ```
2. Wait for `Uvicorn running on http://0.0.0.0:8000` in the logs, then confirm
   directly: `curl -s localhost:8000/v1/models`.
3. In the app: **Admin → AI Providers**, find "Bayanatix Local — Qwen2.5-32B",
   click **Test Connection**. If it reports latency + token count, click **Enable**.
4. Optional: **Set Default**, or route specific capabilities to it under
   **Capability Routing** (e.g. keep `DQ_SEMANTIC` on a stronger managed profile
   while `DESCRIBE`/`REPHRASE` run locally).
5. If the container isn't on `localhost` (e.g. a separate GPU host), edit the
   profile's Base URL in the admin UI to match before enabling it.

## Not implemented here

- Hardware auto-detection / 32B-vs-7B recommendation at install time — this repo has
  no installer; pick the tier that matches your hardware manually.
- systemd unit / Kubernetes manifests — `docker-compose.yml` covers the common case;
  port a `Restart=always` systemd service or a Deployment+Service manifest from it if
  your target environment doesn't run Docker Compose directly.
- Automated hourly canary polling from inside the app — the Provider Router
  (`lib/enrichment/provider-router.ts`) health-checks lazily (on next use, cached 5
  minutes) rather than on a background schedule, since this app has no persistent
  worker process to run one.
