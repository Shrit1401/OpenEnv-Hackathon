#!/usr/bin/env python3
"""
Deterministic benchmark runner for Round-1 evaluation.

Runs all tasks across a list of seeds using a simple policy and prints
a machine-readable JSON summary.
"""

from __future__ import annotations

import argparse
import json
from statistics import mean
from typing import Any, Dict, List

from models import JuryAction
from server.jury_environment import JuryEnvironment

TASKS = ["reasonable_doubt", "poisoned_panel", "the_impossible_case"]


def choose_action(observation: Dict[str, Any]) -> JuryAction:
    phase = observation.get("phase", "voir_dire")
    valid = observation.get("valid_actions", [])
    moods = observation.get("juror_moods", [])

    if phase == "voir_dire":
        hostile_idx = next((i for i, mood in enumerate(moods) if mood == "hostile"), None)
        if "challenge_juror" in valid and hostile_idx is not None and observation.get("remaining_challenges", 0) > 0:
            return JuryAction(action_type="challenge_juror", target_index=hostile_idx)
        if "probe_bias" in valid and observation.get("step_index", 0) < 2:
            return JuryAction(action_type="probe_bias")
        if "accept_panel" in valid:
            return JuryAction(action_type="accept_panel")

    if phase == "witness_exam":
        if "call_witness" in valid and observation.get("remaining_witnesses"):
            return JuryAction(action_type="call_witness", target_index=0)
        if "request_recess" in valid:
            return JuryAction(action_type="request_recess")

    if phase == "cross_examination":
        if "impeach_witness" in valid:
            return JuryAction(action_type="impeach_witness")
        if "gentle_cross" in valid:
            return JuryAction(action_type="gentle_cross")

    if phase == "closing":
        if "closing_reasonable_doubt" in valid:
            return JuryAction(action_type="closing_reasonable_doubt")
        if "closing_procedural" in valid:
            return JuryAction(action_type="closing_procedural")
        if "closing_emotional" in valid:
            return JuryAction(action_type="closing_emotional")

    return JuryAction(action_type=valid[0] if valid else "accept_panel")


def run_episode(task_id: str, seed: int) -> Dict[str, Any]:
    env = JuryEnvironment()
    obs = env.reset(task_id=task_id, seed=seed).model_dump()
    start_pressure = obs["conviction_pressure"]
    cumulative_reward = 0.0
    steps = 0

    while not obs.get("done", False):
        action = choose_action(obs)
        step_obs = env.step(action).model_dump()
        cumulative_reward += float(step_obs.get("reward", 0.0) or 0.0)
        obs = step_obs
        steps += 1

    return {
        "task_id": task_id,
        "seed": seed,
        "steps": steps,
        "start_pressure": start_pressure,
        "final_pressure": obs["conviction_pressure"],
        "score": obs["task_score"],
        "total_reward": round(cumulative_reward, 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seeds", nargs="+", type=int, default=[42, 43, 44])
    args = parser.parse_args()

    runs: List[Dict[str, Any]] = []
    for seed in args.seeds:
        for task_id in TASKS:
            runs.append(run_episode(task_id, seed))

    by_task: Dict[str, List[Dict[str, Any]]] = {}
    for run in runs:
        by_task.setdefault(run["task_id"], []).append(run)

    summary = {
        "num_runs": len(runs),
        "seeds": args.seeds,
        "per_task": {
            task: {
                "avg_score": round(mean(r["score"] for r in task_runs), 4),
                "avg_final_pressure": round(mean(r["final_pressure"] for r in task_runs), 4),
                "avg_total_reward": round(mean(r["total_reward"] for r in task_runs), 4),
            }
            for task, task_runs in by_task.items()
        },
        "overall_avg_score": round(mean(r["score"] for r in runs), 4),
        "runs": runs,
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
