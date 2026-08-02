# Bayanatix bundled self-hosted LLM (spec §4): vLLM serving Qwen2.5 as an
# OpenAI-compatible endpoint, air-gapped-friendly. Layers a thin, documented config
# on top of the official vLLM image rather than reinventing the serving stack.
#
# NOT tested against real GPU hardware in this repo — this is a starting scaffold,
# not a validated deployment artifact. See README.md for the hardware tiers and
# what to verify before treating this as production-ready.
#
# Build:
#   docker build --build-arg MODEL_NAME="Qwen/Qwen2.5-32B-Instruct-AWQ" -t bayanatix-llm:32b .
#   docker build --build-arg MODEL_NAME="Qwen/Qwen2.5-7B-Instruct" --build-arg QUANTIZATION="" -t bayanatix-llm:7b .

FROM vllm/vllm-openai:latest

ARG MODEL_NAME="Qwen/Qwen2.5-32B-Instruct-AWQ"
ARG QUANTIZATION="awq"
ARG MAX_MODEL_LEN="8192"
ARG GPU_MEMORY_UTILIZATION="0.90"

ENV MODEL_NAME=${MODEL_NAME}
ENV QUANTIZATION=${QUANTIZATION}
ENV MAX_MODEL_LEN=${MAX_MODEL_LEN}
ENV GPU_MEMORY_UTILIZATION=${GPU_MEMORY_UTILIZATION}

# Air-gapped installs: pre-populate this with `huggingface-cli download <MODEL_NAME>
# --local-dir /models/<name>` and mount it as a volume instead of pulling at start
# (see docker-compose.yml's commented HF_HUB_OFFLINE block).
VOLUME ["/root/.cache/huggingface"]

COPY health-check.sh /usr/local/bin/health-check.sh
RUN chmod +x /usr/local/bin/health-check.sh

EXPOSE 8000

HEALTHCHECK --interval=5m --timeout=15s --start-period=10m --retries=3 \
  CMD /usr/local/bin/health-check.sh || exit 1

# vllm/vllm-openai's ENTRYPOINT already runs `python -m vllm.entrypoints.openai.api_server`;
# these are its arguments (quantization is empty for unquantized/fp16 models like the 7B tier).
ENTRYPOINT ["sh", "-c", "python3 -m vllm.entrypoints.openai.api_server \
  --model \"$MODEL_NAME\" \
  --served-model-name \"$MODEL_NAME\" \
  --host 0.0.0.0 --port 8000 \
  --max-model-len \"$MAX_MODEL_LEN\" \
  --gpu-memory-utilization \"$GPU_MEMORY_UTILIZATION\" \
  $( [ -n \"$QUANTIZATION\" ] && echo --quantization \"$QUANTIZATION\" )"]
