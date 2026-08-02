#!/bin/sh
# Canary health check matching what the Provider Router (lib/enrichment/provider-router.ts)
# does over HTTP: a minimal chat-completions call, not just a TCP/HTTP liveness ping —
# vLLM can accept connections before the model has finished loading, so a plain
# `curl /health` isn't sufficient to know it can actually serve a request yet.

set -eu

HOST="${HEALTH_CHECK_HOST:-localhost}"
PORT="${HEALTH_CHECK_PORT:-8000}"
MODEL="${MODEL_NAME:-Qwen/Qwen2.5-32B-Instruct-AWQ}"

response=$(curl -sf -m 15 -X POST "http://${HOST}:${PORT}/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"${MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with OK.\"}],\"max_tokens\":5}")

echo "$response" | grep -q '"choices"' || { echo "Health check failed: unexpected response: $response" >&2; exit 1; }

echo "OK"
