"""
FastAPI application for the Jury Consultant Environment.

Uses a singleton environment instance so state persists between
reset() and step() HTTP calls. Follows the OpenEnv API contract:
  GET  /health  → {"status": "healthy"}
  POST /reset   → ResetResponse (observation, reward, done)
  POST /step    → StepResponse  (observation, reward, done)
  GET  /state   → State

Usage:
    uvicorn server.app:app --host 0.0.0.0 --port 7860
"""

from __future__ import annotations

import logging
import time
from uuid import uuid4
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from fastapi import Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from openenv.core.env_server.types import (
        ResetRequest,
        ResetResponse,
        StepRequest,
        StepResponse,
    )
    from openenv.core.env_server.serialization import (
        deserialize_action,
        serialize_observation,
    )
except ImportError:
    from core.env_server.types import (
        ResetRequest,
        ResetResponse,
        StepRequest,
        StepResponse,
    )
    from core.env_server.serialization import (
        deserialize_action,
        serialize_observation,
    )

try:
    from ..models import JuryAction, JuryObservation
    from .jury_environment import JuryEnvironment
    from .jury_environment import _PHASE_ACTIONS
except ImportError:
    from models import JuryAction, JuryObservation
    from server.jury_environment import JuryEnvironment
    from server.jury_environment import _PHASE_ACTIONS


# ---------------------------------------------------------------------------
# Singleton environment
# ---------------------------------------------------------------------------

_env = JuryEnvironment()
logger = logging.getLogger("jury_env.api")
if not logger.handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

app = FastAPI(
    title="Jury Consultant Environment",
    description=(
        "An AI agent acts as a defense consultant in a jury trial simulation. "
        "12 jurors have hidden psychological states. The agent observes only "
        "mood labels and fatigue, and must reduce average jury conviction."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def request_logging_middleware(request: Request, call_next) -> Response:
    request_id = str(uuid4())[:8]
    started = time.perf_counter()
    try:
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "request_id=%s method=%s path=%s status=%s elapsed_ms=%.2f",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception:
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.exception(
            "request_id=%s method=%s path=%s status=500 elapsed_ms=%.2f",
            request_id,
            request.method,
            request.url.path,
            elapsed_ms,
        )
        raise


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "healthy"}


@app.post("/reset", response_model=ResetResponse)
def reset(request: ResetRequest = None) -> ResetResponse:
    """Reset the environment. Pass task_id in the request body."""
    kwargs: Dict[str, Any] = {}
    if request is not None:
        raw = request.model_dump(exclude_unset=True)
        if "seed" in raw:
            kwargs["seed"] = raw["seed"]
        if "episode_id" in raw:
            kwargs["episode_id"] = raw["episode_id"]
        # task_id comes through as extra fields (ResetRequest uses extra="allow")
        if "task_id" in raw:
            kwargs["task_id"] = raw["task_id"]

    obs = _env.reset(**kwargs)
    serialized = serialize_observation(obs)
    return ResetResponse(
        observation=serialized["observation"],
        reward=None,
        done=False,
    )


@app.post("/step", response_model=StepResponse)
def step(request: StepRequest) -> StepResponse:
    """Execute one action in the current episode."""
    try:
        action = deserialize_action(request.action, JuryAction)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    obs = _env.step(action)
    serialized = serialize_observation(obs)
    return StepResponse(
        observation=serialized["observation"],
        reward=obs.reward,
        done=obs.done,
    )


@app.get("/state")
def state() -> Dict[str, Any]:
    """
    Return current state plus visible observation.

    Backward compatible keys:
      - episode_id
      - step_count
    """
    state_data = _env.state.model_dump()
    obs = _env.current_observation()
    serialized = serialize_observation(obs)
    return {
        **state_data,
        "task_id": obs.task_id,
        "phase": obs.phase,
        "done": obs.done,
        "observation": serialized["observation"],
        "valid_actions": obs.valid_actions,
    }


@app.get("/schema")
def schema() -> Dict[str, Any]:
    """Return JSON schemas for action and observation."""
    return {
        "action": JuryAction.model_json_schema(),
        "observation": JuryObservation.model_json_schema(),
    }


@app.get("/valid_actions")
def valid_actions() -> Dict[str, Any]:
    """Return actions valid in the current phase."""
    phase = _env._phase
    return {"phase": phase, "valid_actions": _PHASE_ACTIONS.get(phase, [])}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main(host: str = "0.0.0.0", port: int = 7860) -> None:
    import uvicorn
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=7860)
    args = parser.parse_args()
    main(port=args.port)
