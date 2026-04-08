#!/usr/bin/env python3
"""
Jury Consultant — Baseline Inference Script.

An LLM agent acts as a defense consultant, making sequential courtroom
strategy decisions to reduce jury conviction across 3 trial scenarios.

The agent only observes:
  - Current trial phase
  - Juror mood labels (hostile / neutral / receptive / disengaged)
  - Juror fatigue labels (low / medium / high)
  - Conviction pressure (aggregate visible signal, not raw probabilities)
  - Which actions are currently valid

Required environment variables:
  API_BASE_URL   LLM API endpoint (OpenAI-compatible)
  MODEL_NAME     Model identifier
  HF_TOKEN       API key
Optional:
  LOCAL_IMAGE_NAME  Optional image id for from_docker_image()
  TASK_ID        Run a single task id instead of all tasks
  N_STEPS        Max interaction steps per episode

Usage:
  python3 inference.py
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict, List, Optional

import requests
from openai import OpenAI


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

API_BASE_URL = os.environ.get("API_BASE_URL", "https://api.openai.com/v1")
MODEL_NAME = os.environ.get("MODEL_NAME", "gpt-4o")
HF_TOKEN = os.environ.get("HF_TOKEN")
LOCAL_IMAGE_NAME = os.environ.get("LOCAL_IMAGE_NAME")
SERVER_URL = os.environ.get("ENV_URL", "http://localhost:7860")
BENCHMARK = os.environ.get("BENCHMARK_NAME", "jury_env")
TASK_ID = os.environ.get("TASK_ID")
N_STEPS = int(os.environ.get("N_STEPS", "20"))
# Optional knob for runners using from_docker_image(); intentionally read from env.
_ = LOCAL_IMAGE_NAME

TASKS = ["reasonable_doubt", "poisoned_panel", "the_impossible_case"]
SEED = 42

TASK_DESCRIPTIONS = {
    "reasonable_doubt": "Standard trial. Reduce average jury conviction below 35%.",
    "poisoned_panel": "3 jurors start at 90% conviction, tightly coordinated. Break the cluster.",
    "the_impossible_case": "Evidence is stacked against client. Force a hung jury — split the panel.",
}

SYSTEM_PROMPT = """\
You are an expert trial consultant advising the defense.

Your job is to choose the best legal strategy action each step.
You only see partial information — juror moods and fatigue labels,
not their actual conviction probabilities.

Rules:
- You MUST choose from the valid_actions list provided
- If action requires target_index (challenge_juror or call_witness),
  include an appropriate index number
- challenge_juror: index 0–11 (pick a hostile juror when possible)
- call_witness: index into the remaining_witnesses list (0 = first)
- Think about: removing biased jurors early, calling credible witnesses,
  choosing cross style based on juror receptivity

Respond with JSON only:
{"action_type": "...", "target_index": null_or_int}
"""


# ---------------------------------------------------------------------------
# Server communication
# ---------------------------------------------------------------------------


def reset_task(task_id: str) -> Dict[str, Any]:
    resp = requests.post(
        f"{SERVER_URL}/reset",
        json={"task_id": task_id, "seed": SEED, "episode_id": f"{task_id}-baseline"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    # data = {"observation": {...}, "reward": None, "done": False}
    return data.get("observation", data)


def step_env(action_type: str, target_index: Optional[int] = None) -> Dict[str, Any]:
    action: Dict[str, Any] = {"action_type": action_type}
    if target_index is not None:
        action["target_index"] = target_index
    resp = requests.post(
        f"{SERVER_URL}/step",
        json={"action": action},
        timeout=30,
    )
    resp.raise_for_status()
    # Returns {"observation": {...}, "reward": float, "done": bool}
    return resp.json()


# ---------------------------------------------------------------------------
# Agent decision
# ---------------------------------------------------------------------------


def choose_action(obs: Dict[str, Any], client: OpenAI, history: List[Dict]) -> Dict[str, Any]:
    """Ask the LLM to choose an action given current observation."""
    valid_actions = obs.get("valid_actions", [])
    if not valid_actions:
        return {"action_type": "closing_reasonable_doubt"}

    user_msg = (
        f"Phase: {obs.get('phase')}\n"
        f"Step: {obs.get('step_index')}\n"
        f"Conviction pressure: {obs.get('conviction_pressure', 0.5):.0%}\n"
        f"Juror moods: {obs.get('juror_moods', [])}\n"
        f"Juror fatigue: {obs.get('juror_fatigue', [])}\n"
        f"Remaining challenges: {obs.get('remaining_challenges', 0)}\n"
        f"Remaining witnesses: {obs.get('remaining_witnesses', [])}\n"
        f"Current witness: {obs.get('current_witness')}\n"
        f"Last event: {obs.get('last_event', '')}\n"
        f"Valid actions: {valid_actions}\n\n"
        "Choose the best action. Respond with JSON only."
    )

    history.append({"role": "user", "content": user_msg})

    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[{"role": "system", "content": SYSTEM_PROMPT}] + history[-6:],
            max_tokens=100,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content.strip()
        decision = json.loads(raw)
        history.append({"role": "assistant", "content": raw})

        action_type = decision.get("action_type", valid_actions[0])
        if action_type not in valid_actions:
            action_type = valid_actions[0]

        target = decision.get("target_index")
        return {"action_type": action_type, "target_index": target}

    except Exception:
        # Fallback: deterministic heuristic
        return _heuristic_action(obs)


def _heuristic_action(obs: Dict[str, Any]) -> Dict[str, Any]:
    """Simple fallback heuristic if LLM call fails."""
    valid = obs.get("valid_actions", [])
    phase = obs.get("phase", "voir_dire")
    moods = obs.get("juror_moods", [])

    if phase == "voir_dire":
        hostile = [i for i, m in enumerate(moods) if m == "hostile"]
        if hostile and obs.get("remaining_challenges", 0) > 0:
            return {"action_type": "challenge_juror", "target_index": hostile[0]}
        return {"action_type": "accept_panel"}

    elif phase == "witness_exam":
        witnesses = obs.get("remaining_witnesses", [])
        if witnesses:
            return {"action_type": "call_witness", "target_index": 0}
        return {"action_type": "request_recess"}

    elif phase == "cross_examination":
        receptive = sum(1 for m in moods if m == "receptive")
        if receptive >= 6:
            return {"action_type": "gentle_cross"}
        return {"action_type": "impeach_witness"}

    elif phase == "closing":
        return {"action_type": "closing_reasonable_doubt"}

    return {"action_type": valid[0] if valid else "accept_panel"}


# ---------------------------------------------------------------------------
# Run one task
# ---------------------------------------------------------------------------


def run_task(task_id: str, client: OpenAI) -> Dict[str, Any]:
    print(f"[START] task={task_id} env={BENCHMARK} model={MODEL_NAME}", flush=True)

    history: List[Dict] = []
    rewards: List[float] = []
    steps = 0
    final_score = 0.0
    success = False

    try:
        obs = reset_task(task_id)
        done = False

        for step in range(1, N_STEPS + 1):
            if done:
                break

            decision = choose_action(obs, client, history)
            action_type = decision["action_type"]
            target_index = decision.get("target_index")
            action_repr = (
                f"{action_type}:{target_index}"
                if target_index is not None
                else action_type
            )

            resp = step_env(action_type, target_index)
            obs = resp.get("observation", resp)
            reward = float(resp.get("reward", 0.0) or 0.0)
            done = bool(resp.get("done", obs.get("done", False)))
            error_val = obs.get("last_action_error") if isinstance(obs, dict) else None
            error_str = str(error_val) if error_val else "null"

            rewards.append(reward)
            steps = step
            final_score = float(obs.get("task_score", final_score))

            print(
                f"[STEP] step={step} action={action_repr} reward={reward:.2f} "
                f"done={str(done).lower()} error={error_str}",
                flush=True,
            )

            if done:
                break

        success = bool(steps > 0 and final_score >= 0.5)
    except Exception:
        success = False
    finally:
        rewards_csv = ",".join(f"{r:.2f}" for r in rewards)
        print(
            f"[END] success={str(success).lower()} steps={steps} "
            f"score={final_score:.2f} rewards={rewards_csv}",
            flush=True,
        )

    return {"task_id": task_id, "steps": steps, "score": final_score, "success": success}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    if not HF_TOKEN:
        print("ERROR: Set HF_TOKEN environment variable.")
        sys.exit(1)

    # Health check
    try:
        health = requests.get(f"{SERVER_URL}/health", timeout=10)
        health.raise_for_status()
    except Exception as e:
        print(f"  ERROR: Cannot reach server at {SERVER_URL}: {e}")
        sys.exit(1)

    client = OpenAI(base_url=API_BASE_URL, api_key=HF_TOKEN)

    tasks = [TASK_ID] if TASK_ID else TASKS
    results = []
    for task_id in tasks:
        result = run_task(task_id, client)
        results.append(result)

    _ = results


if __name__ == "__main__":
    main()
