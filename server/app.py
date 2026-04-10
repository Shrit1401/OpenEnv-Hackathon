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

import os
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
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
    from .jury_environment import JuryEnvironment, _PHASE_ACTIONS
except ImportError:
    from models import JuryAction, JuryObservation
    from server.jury_environment import JuryEnvironment, _PHASE_ACTIONS


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

_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
_FRONTEND_ASSETS = _FRONTEND_DIST / "assets"
if _FRONTEND_ASSETS.exists():
    app.mount("/assets", StaticFiles(directory=_FRONTEND_ASSETS), name="assets")


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
    if "task_id" not in kwargs and os.environ.get("TASK_ID"):
        kwargs["task_id"] = os.environ["TASK_ID"]

    _VALID_TASKS = {"reasonable_doubt", "poisoned_panel", "the_impossible_case"}
    task_id_val = kwargs.get("task_id")
    if task_id_val and task_id_val not in _VALID_TASKS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown task_id '{task_id_val}'. Valid: {sorted(_VALID_TASKS)}",
        )

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

    all_actions = {a for actions in _PHASE_ACTIONS.values() for a in actions}
    if action.action_type not in all_actions:
        raise HTTPException(status_code=422, detail=f"Unknown action type: {action.action_type}")
    # API rejects invalid actions with HTTP 422 before they reach the environment.
    # Direct Python usage (e.g., benchmark.py) receives a -0.5 penalty reward instead.
    if action.action_type not in _env.valid_actions():
        raise HTTPException(
            status_code=422,
            detail=(
                f"Action '{action.action_type}' not allowed in phase '{_env.phase}'. "
                f"Valid actions: {_env.valid_actions()}"
            ),
        )

    obs = _env.step(action)
    serialized = serialize_observation(obs)
    return StepResponse(
        observation=serialized["observation"],
        reward=obs.reward,
        done=obs.done,
    )


@app.get("/state")
def state() -> Dict[str, Any]:
    """Return current visible state only."""
    return _env.visible_state()


@app.get("/grade")
def grade() -> Dict[str, float]:
    """Return deterministic normalized score in strict open interval (0.02, 0.98)."""
    return {"score": _env.grade()}


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
    phase = _env.phase
    return {"phase": phase, "valid_actions": _env.valid_actions()}


@app.get("/")
def index() -> Response:
    index_file = _FRONTEND_DIST / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return Response(content='{"status":"healthy"}', media_type="application/json")


@app.get("/{path:path}")
def spa_fallback(path: str) -> Response:
    # Leave API/docs routes to FastAPI handlers.
    if path.startswith(("health", "reset", "step", "state", "grade", "schema", "valid_actions", "docs", "openapi.json", "redoc", "assets")):
        raise HTTPException(status_code=404, detail="Not Found")
    index_file = _FRONTEND_DIST / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="Not Found")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def run(host: str = "0.0.0.0", port: int = 7860) -> None:
    import uvicorn
    uvicorn.run(app, host=host, port=port)


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=7860)
    args = parser.parse_args()
    run(port=args.port)


if __name__ == "__main__":
    main()
