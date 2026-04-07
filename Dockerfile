# Jury Consultant Environment — Dockerfile
# Follows the same multi-stage pattern as the OpenEnv echo_env example.

ARG BASE_IMAGE=python:3.12-slim
FROM ${BASE_IMAGE} AS builder

WORKDIR /app

# Install uv
RUN pip install uv --quiet

# Copy environment code
COPY . /app/env

WORKDIR /app/env

# Install dependencies
RUN uv pip install --system \
    "openenv-core[core]>=0.2.1,<0.2.2" \
    "fastapi>=0.115.0" \
    "pydantic>=2.0.0" \
    "uvicorn>=0.24.0" \
    "requests>=2.31.0" \
    "openai>=1.0.0"

# Final stage
FROM ${BASE_IMAGE}

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /usr/local/lib /usr/local/lib
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy source
COPY . /app/env

WORKDIR /app/env

ENV PYTHONPATH="/app/env:$PYTHONPATH"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:7860/health')" || exit 1

EXPOSE 7860

CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "7860"]
