#!/usr/bin/env python3
"""
Jury Consultant — Baseline Inference Script.

An LLM agent acts as a defense consultant, making sequential courtroom
strategy decisions to reduce jury conviction across 3 trial scenarios.

Required environment variables:
  API_BASE_URL   LLM API endpoint (OpenAI-compatible)
  MODEL_NAME     Model identifier
  HF_TOKEN       API key / HuggingFace token
Optional:
  LOCAL_IMAGE_NAME  Docker image name (if using from_docker_image())
  TASK_ID        Run a single task id instead of all three
  N_STEPS        Max steps per episode (default: 20)
  ENV_URL        Environment server URL (default: http://localhost:7860)

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

API_BASE_URL = os.environ.get("API_BASE_URL", "https://router.huggingface.co/v1")
MODEL_NAME = os.environ.get("MODEL_NAME", "Qwen/Qwen2.5-72B-Instruct")
HF_TOKEN = os.environ.get("HF_TOKEN")
LOCAL_IMAGE_NAME = os.environ.get("LOCAL_IMAGE_NAME")
SERVER_URL = os.environ.get("ENV_URL", "http://localhost:7860")
BENCHMARK = os.environ.get("BENCHMARK_NAME", "jury_env")
TASK_ID = os.environ.get("TASK_ID")
N_STEPS = int(os.environ.get("N_STEPS", "20"))
_ = LOCAL_IMAGE_NAME  # consumed by runners using from_docker_image()

TASKS = ["reasonable_doubt", "poisoned_panel", "the_impossible_case"]
SEED = 42
SCORE_MIN = 0.02
SCORE_MAX = 0.98

SYSTEM_PROMPT = """\
You are an expert trial consultant advising the defense.

Your job is to choose the best legal strategy action each step.
You only see partial information — juror moods and fatigue labels,
not their actual conviction probabilities.

Key observation fields to use:
- case_summary + charges: understand what you're defending against
- evidence: assess which evidence is strongest (check strength 0.0–1.0)
- goals / pending_goals: check what objectives are not yet completed each step
- coalition_hint: if set, shows hostile cluster structure — challenge those seats first
- cross_actions_remaining: countdown until phase auto-advances; plan your cross actions
- phase_deadline_steps_remaining: for the_impossible_case — call witnesses before it hits 0
- juror_profiles_visible: per-juror notes on mood, fatigue, and strategic priority
- reward_breakdown: shows current conviction/fatigue/trust/goal_completion_rate state
- jury_patience: 0.0–1.0 meter — VARY your actions. Repeating the same action decays patience
  and multiplies your final score by (0.70 + 0.30 * patience). patience=0.20 → ×0.76 penalty.

Rules:
- You MUST choose from the valid_actions list provided
- If the action requires target_index (challenge_juror or call_witness),
  include an appropriate integer
- challenge_juror: index 0–11 (prefer hostile jurors, especially coalition_hint seats)
- call_witness: index into the remaining_witnesses list (0 = first)
- Think about: removing biased jurors early, calling credible witnesses,
  choosing cross style based on juror receptivity, checking pending_goals
- NEVER repeat the same action consecutively — vary your strategy to keep jury_patience high

Respond with JSON only, no markdown:
{"action_type": "...", "target_index": null}
"""


# ---------------------------------------------------------------------------
# Logging helpers — strict Scaler format
# ---------------------------------------------------------------------------

def log_start(task: str, env: str, model: str) -> None:
    print(f"[START] task={task} env={env} model={model}", flush=True)


def log_step(step: int, action: str, reward: float, done: bool, error: Optional[str]) -> None:
    error_val = error if error else "null"
    print(
        f"[STEP] step={step} action={action} reward={reward:.2f} "
        f"done={str(done).lower()} error={error_val}",
        flush=True,
    )


def log_end(success: bool, steps: int, score: float, rewards: List[float]) -> None:
    rewards_csv = ",".join(f"{r:.2f}" for r in rewards)
    print(
        f"[END] success={str(success).lower()} steps={steps} "
        f"score={score:.2f} rewards={rewards_csv}",
        flush=True,
    )


# ---------------------------------------------------------------------------
# Score helper
# ---------------------------------------------------------------------------

def strict_unit_interval(value: float) -> float:
    return max(SCORE_MIN, min(SCORE_MAX, float(value)))


# ---------------------------------------------------------------------------
# Log-safe action string formatter
# ---------------------------------------------------------------------------

def _format_action_str(action_type: str, target_index: Optional[int]) -> str:
    """Produce a log-safe action string for [STEP] lines.

    No spaces or special characters that could break stdout line parsing.
    Format: 'action_type' or 'action_type:N' when target_index is set.
    """
    if target_index is not None:
        return f"{action_type}:{target_index}"
    return action_type


# ---------------------------------------------------------------------------
# Server communication
# ---------------------------------------------------------------------------

def reset_task(task_id: str) -> Dict[str, Any]:
    resp = requests.post(
        f"{SERVER_URL}/reset",
        json={"task_id": task_id, "seed": SEED, "episode_id": f"{task_id}-baseline"},
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get("observation", data)


def step_env(action_type: str, target_index: Optional[int] = None) -> Dict[str, Any]:
    action: Dict[str, Any] = {"action_type": action_type}
    if target_index is not None:
        action["target_index"] = target_index
    resp = requests.post(
        f"{SERVER_URL}/step",
        json={"action": action},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Agent decision
# ---------------------------------------------------------------------------

def choose_action(obs: Dict[str, Any], client: OpenAI, history: List[Dict]) -> Dict[str, Any]:
    valid_actions = obs.get("valid_actions", [])
    if not valid_actions:
        return {"action_type": "closing_reasonable_doubt", "target_index": None}

    patience = obs.get("jury_patience", 1.0)
    patience_warning = (
        f" ⚠ PATIENCE LOW ({patience:.0%}) — switch actions now!"
        if patience < 0.6
        else f" ({patience:.0%})"
    )
    user_msg = (
        f"Phase: {obs.get('phase')}\n"
        f"Step: {obs.get('step_index')}\n"
        f"Conviction pressure: {obs.get('conviction_pressure', 0.5):.0%}\n"
        f"Jury patience: {patience:.2f}{patience_warning}\n"
        f"Juror moods: {obs.get('juror_moods', [])}\n"
        f"Juror fatigue: {obs.get('juror_fatigue', [])}\n"
        f"Remaining challenges: {obs.get('remaining_challenges', 0)}\n"
        f"Remaining witnesses: {obs.get('remaining_witnesses', [])}\n"
        f"Current witness: {obs.get('current_witness')}\n"
        f"Last event: {obs.get('last_event', '')}\n"
        f"Cross actions remaining: {obs.get('cross_actions_remaining', 2)}\n"
        f"Phase deadline remaining: {obs.get('phase_deadline_steps_remaining')}\n"
        f"Coalition hint: {obs.get('coalition_hint')}\n"
        f"Pending goals: {obs.get('pending_goals', [])}\n"
        f"Juror profiles: {obs.get('juror_profiles_visible', [])}\n"
        f"Valid actions: {valid_actions}\n\n"
        "Choose the best action. Respond with JSON only, no markdown."
    )

    history.append({"role": "user", "content": user_msg})

    raw = ""  # ensure raw is defined for error logging even if LLM call fails
    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[{"role": "system", "content": SYSTEM_PROMPT}] + history[-6:],
            max_tokens=100,
            temperature=0.0,
        )
        raw = response.choices[0].message.content.strip()
        # Strip markdown fences if model wraps response in ```json ... ```
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        decision = json.loads(raw)
        history.append({"role": "assistant", "content": raw})

        action_type = decision.get("action_type", valid_actions[0])
        if action_type not in valid_actions:
            print(f"[DEBUG] Model returned invalid action '{action_type}', falling back to heuristic.", flush=True)
            action_type = valid_actions[0]
        target = decision.get("target_index")
        return {"action_type": action_type, "target_index": target}

    except json.JSONDecodeError as jde:
        # Model returned non-JSON — log for debugging and use deterministic fallback
        print(f"[DEBUG] JSON parse failed: {jde}. Raw: {raw!r:.80}. Using heuristic.", flush=True)
        return _heuristic_action(obs)
    except Exception as exc:
        # LLM API call failed — use deterministic fallback to keep episode running
        print(f"[DEBUG] LLM call failed ({type(exc).__name__}: {exc}). Using heuristic.", flush=True)
        return _heuristic_action(obs)


def _heuristic_action(obs: Dict[str, Any]) -> Dict[str, Any]:
    valid = obs.get("valid_actions", [])
    phase = obs.get("phase", "voir_dire")
    moods = obs.get("juror_moods", [])

    if phase == "voir_dire":
        hostile = [i for i, m in enumerate(moods) if m == "hostile"]
        if hostile and obs.get("remaining_challenges", 0) > 0:
            return {"action_type": "challenge_juror", "target_index": hostile[0]}
        return {"action_type": "accept_panel", "target_index": None}

    elif phase == "witness_exam":
        if obs.get("remaining_witnesses"):
            return {"action_type": "call_witness", "target_index": 0}
        return {"action_type": "request_recess", "target_index": None}

    elif phase == "cross_examination":
        receptive = sum(1 for m in moods if m == "receptive")
        if receptive >= 6:
            return {"action_type": "gentle_cross", "target_index": None}
        return {"action_type": "impeach_witness", "target_index": None}

    elif phase == "closing":
        return {"action_type": "closing_reasonable_doubt", "target_index": None}

    return {"action_type": valid[0] if valid else "accept_panel", "target_index": None}


# ---------------------------------------------------------------------------
# Run one task
# ---------------------------------------------------------------------------

def run_task(task_id: str, client: OpenAI) -> Dict[str, Any]:
    log_start(task=task_id, env=BENCHMARK, model=MODEL_NAME)

    history: List[Dict] = []
    rewards: List[float] = []
    steps = 0
    final_score = SCORE_MIN
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
            action_repr = _format_action_str(action_type, target_index)

            resp = step_env(action_type, target_index)
            obs = resp.get("observation", resp)
            reward = float(resp.get("reward", 0.0) or 0.0)
            done = bool(resp.get("done", obs.get("done", False)))
            error_val = obs.get("last_action_error") if isinstance(obs, dict) else None
            error_str = str(error_val) if error_val else "null"

            rewards.append(reward)
            steps = step
            final_score = strict_unit_interval(float(obs.get("task_score", final_score)))

            log_step(step=step, action=action_repr, reward=reward, done=done, error=error_str)

            if done:
                break

        success = bool(steps > 0 and final_score >= 0.5)

    except Exception as exc:
        print(f"[DEBUG] Task {task_id} error: {exc}", flush=True)
        success = False

    finally:
        final_score = strict_unit_interval(final_score)
        # Always emitted — even on exception (finally: block)
        # score formatted to 2 decimal places per hackathon spec (log_end uses :.2f)
        log_end(success=success, steps=steps, score=final_score, rewards=rewards)

    return {"task_id": task_id, "steps": steps, "score": final_score, "success": success}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    if not HF_TOKEN:
        print("ERROR: Set HF_TOKEN environment variable.")
        sys.exit(1)

    try:
        health = requests.get(f"{SERVER_URL}/health", timeout=30)
        health.raise_for_status()
    except Exception as e:
        print(f"ERROR: Cannot reach server at {SERVER_URL}: {e}")
        sys.exit(1)

    client = OpenAI(base_url=API_BASE_URL, api_key=HF_TOKEN)

    tasks = [TASK_ID] if TASK_ID else TASKS
    for task_id in tasks:
        run_task(task_id, client)


if __name__ == "__main__":
    main()
