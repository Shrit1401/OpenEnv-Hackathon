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

from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
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
except ImportError:
    from models import JuryAction, JuryObservation
    from server.jury_environment import JuryEnvironment


# ---------------------------------------------------------------------------
# Singleton environment
# ---------------------------------------------------------------------------

_env = JuryEnvironment()

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
    """Return current environment state (episode_id, step_count)."""
    return _env.state.model_dump()


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
    from server.jury_environment import _PHASE_ACTIONS
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
