"""
Jury Consultant Environment — Core Implementation.

Hidden state: each juror has a conviction score (0–1), fatigue,
emotional temperature, procedural trust, aggression sensitivity,
influence power, and a bias flag.

The agent never sees these directly. It observes only coarse mood
labels, fatigue categories, and a noisy conviction_pressure signal.

Three tasks with different difficulty levels and jury configurations.
"""

from __future__ import annotations

import random
import statistics
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from uuid import uuid4

try:
    from openenv.core.env_server.interfaces import Environment
    from openenv.core.env_server.types import State
except ImportError:
    from core.env_server.interfaces import Environment
    from core.env_server.types import State

try:
    from ..models import JuryAction, JuryObservation
except ImportError:
    from models import JuryAction, JuryObservation


# ---------------------------------------------------------------------------
# Internal hidden state types (never serialized to agent)
# ---------------------------------------------------------------------------


@dataclass
class JurorHidden:
    conviction: float         # 0.0–1.0: guilt belief
    fatigue: float            # 0.0–1.0: accumulates each step
    emotional_temp: float     # 0.0–1.0: reactivity
    procedural_trust: float   # 0.0–1.0: belief in legal process
    aggression_sensitivity: float  # 0.0–1.0: punishes aggressive lawyers
    influence_power: float    # 0.0–1.0: how much this juror moves others
    bias_triggered: bool = False


@dataclass
class WitnessHidden:
    name: str
    witness_type: str         # expert | eyewitness | character | alibi
    credibility: float        # 0.0–1.0
    emotional_impact: float   # 0.0–1.0: moves emotional jurors more
    cross_vulnerability: float  # 0.0–1.0: how well impeachment lands
    used: bool = False


@dataclass
class TaskConfig:
    name: str
    juror_convictions: List[float]       # initial conviction per juror
    juror_aggression_sensitivities: List[float]
    juror_procedural_trusts: List[float]
    juror_influence_powers: List[float]
    influence_matrix: List[List[float]]  # 12x12, how much i pulls j
    witnesses: List[WitnessHidden]
    max_challenges: int
    fatigue_growth_rate: float           # added per step
    max_steps: int


# ---------------------------------------------------------------------------
# Task factory
# ---------------------------------------------------------------------------


def _make_task(task_id: str) -> TaskConfig:
    """Build a fully deterministic task config from a fixed seed."""
    rng = random.Random({"reasonable_doubt": 42, "poisoned_panel": 99, "the_impossible_case": 137}.get(task_id, 42))

    def jitter(base: float, spread: float = 0.05) -> float:
        return max(0.0, min(1.0, base + rng.uniform(-spread, spread)))

    if task_id == "reasonable_doubt":
        convictions = [jitter(0.50) for _ in range(11)] + [jitter(0.75)]
        agg_sens = [jitter(0.35) for _ in range(12)]
        proc_trust = [jitter(0.55) for _ in range(12)]
        influence_powers = [jitter(0.20) for _ in range(12)]
        influence_powers[0] = 0.60   # juror 0 is a leader
        influence_powers[6] = 0.55   # juror 6 is co-leader
        matrix = [[0.0] * 12 for _ in range(12)]
        for j in [0, 6]:
            for k in range(12):
                if k != j:
                    matrix[j][k] = 0.12
        witnesses = [
            WitnessHidden("Dr. Chen", "expert", 0.75, 0.40, 0.55),
            WitnessHidden("Maria Santos", "eyewitness", 0.60, 0.70, 0.65),
            WitnessHidden("Tom Mercer Sr.", "character", 0.55, 0.65, 0.45),
            WitnessHidden("Dr. Kim", "alibi", 0.70, 0.35, 0.50),
        ]
        return TaskConfig("reasonable_doubt", convictions, agg_sens, proc_trust,
                          influence_powers, matrix, witnesses, 6, 0.03, 25)

    elif task_id == "poisoned_panel":
        convictions = [0.90, 0.90, 0.90] + [jitter(0.50) for _ in range(9)]
        agg_sens = [jitter(0.45) for _ in range(12)]
        proc_trust = [jitter(0.45) for _ in range(12)]
        influence_powers = [jitter(0.25) for _ in range(12)]
        influence_powers[0] = 0.70
        influence_powers[1] = 0.65
        influence_powers[2] = 0.60
        matrix = [[0.0] * 12 for _ in range(12)]
        # tight cluster: 0/1/2 pull each other hard
        for a in [0, 1, 2]:
            for b in [0, 1, 2]:
                if a != b:
                    matrix[a][b] = 0.25
        # moderate outward influence from cluster
        for a in [0, 1, 2]:
            for b in range(3, 12):
                matrix[a][b] = 0.10
        witnesses = [
            WitnessHidden("Prof. Hammond", "expert", 0.80, 0.30, 0.60),
            WitnessHidden("Rachel Thorn", "eyewitness", 0.55, 0.75, 0.70),
            WitnessHidden("James Aldridge Sr.", "character", 0.50, 0.70, 0.50),
            WitnessHidden("Dr. Osei", "alibi", 0.65, 0.40, 0.55),
        ]
        return TaskConfig("poisoned_panel", convictions, agg_sens, proc_trust,
                          influence_powers, matrix, witnesses, 6, 0.04, 25)

    else:  # the_impossible_case
        convictions = [jitter(0.75) for _ in range(9)] + [jitter(0.45), jitter(0.40), jitter(0.35)]
        agg_sens = [jitter(0.60) for _ in range(12)]
        proc_trust = [jitter(0.35) for _ in range(12)]
        influence_powers = [jitter(0.30) for _ in range(12)]
        # chain topology: each juror pulls next one
        matrix = [[0.0] * 12 for _ in range(12)]
        for i in range(11):
            matrix[i][i + 1] = 0.15
        witnesses = [
            WitnessHidden("Dr. Patel", "expert", 0.70, 0.50, 0.65),
        ]
        return TaskConfig("the_impossible_case", convictions, agg_sens, proc_trust,
                          influence_powers, matrix, witnesses, 3, 0.06, 25)


# ---------------------------------------------------------------------------
# Visible signal mapping
# ---------------------------------------------------------------------------


def _mood_label(conviction: float, fatigue: float) -> str:
    if conviction > 0.65:
        return "disengaged" if fatigue >= 0.7 else "hostile"
    elif conviction < 0.35:
        return "receptive"
    else:
        return "neutral"


def _fatigue_label(fatigue: float) -> str:
    if fatigue < 0.35:
        return "low"
    elif fatigue < 0.65:
        return "medium"
    else:
        return "high"


def _conviction_pressure(jurors: List[JurorHidden]) -> float:
    """Noisy visible aggregate — rounds to nearest 0.01 to feel like a meter."""
    raw = sum(j.conviction for j in jurors) / len(jurors)
    return round(raw, 2)


# ---------------------------------------------------------------------------
# Graders (0.0–1.0 per task)
# ---------------------------------------------------------------------------


def _grade_reasonable_doubt(jurors: List[JurorHidden], initial_avg: float) -> float:
    avg = sum(j.conviction for j in jurors) / 12
    return max(0.0, min(1.0, 1.0 - avg / 0.5))


def _grade_poisoned_panel(jurors: List[JurorHidden], initial_avg: float) -> float:
    cluster = jurors[:3]
    cluster_below = sum(1 for j in cluster if j.conviction < 0.55) / 3
    avg_reduction = max(0.0, initial_avg - sum(j.conviction for j in jurors) / 12)
    reduction_score = min(1.0, avg_reduction / 0.35)
    return cluster_below * 0.60 + reduction_score * 0.40


def _grade_impossible_case(jurors: List[JurorHidden], initial_avg: float) -> float:
    convictions = [j.conviction for j in jurors]
    if len(set(convictions)) < 2:
        stdev = 0.0
    else:
        stdev = statistics.stdev(convictions)
    holdouts = sum(1 for c in convictions if c < 0.40)
    stdev_score = min(1.0, stdev / 0.28)
    holdout_score = min(1.0, holdouts / 3)
    return stdev_score * 0.50 + holdout_score * 0.50


# ---------------------------------------------------------------------------
# Phase-valid action lists
# ---------------------------------------------------------------------------

_PHASE_ACTIONS: Dict[str, List[str]] = {
    "voir_dire": ["probe_bias", "challenge_juror", "accept_panel"],
    "witness_exam": ["call_witness", "request_recess"],
    "cross_examination": ["gentle_cross", "aggressive_cross", "impeach_witness", "request_recess"],
    "closing": ["closing_emotional", "closing_reasonable_doubt", "closing_procedural"],
    "verdict": [],
}


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------


class JuryEnvironment(Environment):
    """
    Jury Consultant Strategy Environment.

    The agent reduces hidden jury conviction by choosing legal strategy actions.
    Juror psychology is hidden; only mood labels and fatigue are observable.
    """

    SUPPORTS_CONCURRENT_SESSIONS: bool = False

    def __init__(self) -> None:
        self._state = State(episode_id=str(uuid4()), step_count=0)
        self._jurors: List[JurorHidden] = []
        self._witnesses: List[WitnessHidden] = []
        self._task: Optional[TaskConfig] = None
        self._task_id: str = "reasonable_doubt"
        self._phase: str = "voir_dire"
        self._challenges_left: int = 6
        self._current_witness_idx: Optional[int] = None
        self._cross_actions_taken: int = 0
        self._initial_avg_conviction: float = 0.5
        self._last_event: str = "Trial begins."
        self._rng = random.Random(42)

    # ------------------------------------------------------------------
    # Reset
    # ------------------------------------------------------------------

    def reset(self, seed: Optional[int] = None, episode_id: Optional[str] = None,
              task_id: Optional[str] = None, **kwargs) -> JuryObservation:
        task_id = task_id or "reasonable_doubt"
        self._task_id = task_id
        self._task = _make_task(task_id)
        seed_val = seed if seed is not None else 42
        self._rng = random.Random(seed_val)

        self._jurors = [
            JurorHidden(
                conviction=self._task.juror_convictions[i],
                fatigue=0.0,
                emotional_temp=self._rng.uniform(0.3, 0.7),
                procedural_trust=self._task.juror_procedural_trusts[i],
                aggression_sensitivity=self._task.juror_aggression_sensitivities[i],
                influence_power=self._task.juror_influence_powers[i],
            )
            for i in range(12)
        ]
        self._witnesses = [
            WitnessHidden(
                name=w.name,
                witness_type=w.witness_type,
                credibility=w.credibility,
                emotional_impact=w.emotional_impact,
                cross_vulnerability=w.cross_vulnerability,
            )
            for w in self._task.witnesses
        ]

        self._phase = "voir_dire"
        self._challenges_left = self._task.max_challenges
        self._current_witness_idx = None
        self._cross_actions_taken = 0
        self._initial_avg_conviction = sum(j.conviction for j in self._jurors) / 12
        self._last_event = f"Case begins: {task_id.replace('_', ' ').title()}."
        self._state = State(episode_id=episode_id or str(uuid4()), step_count=0)

        return self._build_obs(reward=0.0, done=False)

    # ------------------------------------------------------------------
    # Step
    # ------------------------------------------------------------------

    def step(self, action: JuryAction) -> JuryObservation:  # type: ignore[override]
        self._state.step_count += 1

        if self._phase == "verdict":
            return self._build_obs(reward=0.0, done=True)

        valid = _PHASE_ACTIONS.get(self._phase, [])
        action_type = action.action_type

        if action_type not in valid:
            self._last_event = f"Invalid action '{action_type}' in phase '{self._phase}'."
            reward = -0.5
            return self._build_obs(reward=reward, done=False)

        reward = self._apply_action(action_type, action.target_index)
        self._apply_social_influence()
        self._grow_fatigue()

        done = (self._phase == "verdict") or (self._state.step_count >= self._task.max_steps)
        if self._state.step_count >= self._task.max_steps and self._phase != "verdict":
            self._phase = "verdict"
            self._last_event += " Time limit reached. Jury deliberates."

        return self._build_obs(reward=reward, done=done)

    # ------------------------------------------------------------------
    # Internal action dispatcher
    # ------------------------------------------------------------------

    def _apply_action(self, action_type: str, target_index: Optional[int]) -> float:
        reward = self._step_reward_base()

        if action_type == "probe_bias":
            biased = [i for i, j in enumerate(self._jurors) if j.bias_triggered]
            for j in self._jurors:
                j.procedural_trust = min(1.0, j.procedural_trust + 0.03)
            if biased:
                self._last_event = f"Bias probe reveals tension from jurors {biased[:3]}."
            else:
                self._last_event = "No obvious bias detected. Jury appears composed."

        elif action_type == "challenge_juror":
            idx = target_index if target_index is not None else 0
            idx = max(0, min(11, idx))
            if self._challenges_left <= 0:
                self._last_event = "No challenges remaining."
                reward -= 0.2
            else:
                old_conv = self._jurors[idx].conviction
                # Replace with a fresh neutral juror
                self._jurors[idx] = JurorHidden(
                    conviction=self._rng.uniform(0.35, 0.55),
                    fatigue=0.0,
                    emotional_temp=self._rng.uniform(0.3, 0.6),
                    procedural_trust=self._rng.uniform(0.5, 0.7),
                    aggression_sensitivity=self._rng.uniform(0.25, 0.50),
                    influence_power=self._rng.uniform(0.10, 0.30),
                )
                self._challenges_left -= 1
                delta = old_conv - self._jurors[idx].conviction
                reward += delta * 0.5
                self._last_event = f"Juror {idx} challenged and replaced. Conviction change: {delta:+.2f}."

        elif action_type == "accept_panel":
            self._phase = "witness_exam"
            self._last_event = "Defense accepts the jury panel. Trial moves to witness examination."

        elif action_type == "call_witness":
            available = [i for i, w in enumerate(self._witnesses) if not w.used]
            if not available:
                self._last_event = "No witnesses remain. Proceeding to closing."
                self._phase = "closing"
                return reward
            idx = target_index if target_index is not None else available[0]
            if idx not in available:
                idx = available[0]
            self._witnesses[idx].used = True
            self._current_witness_idx = idx
            self._cross_actions_taken = 0
            self._phase = "cross_examination"
            w = self._witnesses[idx]
            # Witness testimony shifts conviction based on type
            for j in self._jurors:
                base_shift = -w.credibility * 0.12
                if w.witness_type == "expert":
                    shift = base_shift * (0.8 + j.procedural_trust * 0.4)
                elif w.witness_type == "eyewitness":
                    shift = base_shift * (0.8 + j.emotional_temp * 0.4)
                elif w.witness_type == "character":
                    shift = base_shift * (0.6 + j.emotional_temp * 0.6)
                else:  # alibi
                    shift = base_shift * (0.9 + j.procedural_trust * 0.2)
                j.conviction = max(0.0, min(1.0, j.conviction + shift))
                reward += -shift * 0.3
            self._last_event = f"{w.name} ({w.witness_type}) takes the stand. Jury attention sharpens."

        elif action_type == "gentle_cross":
            w = self._witnesses[self._current_witness_idx] if self._current_witness_idx is not None else None
            for j in self._jurors:
                shift = -0.03 - j.procedural_trust * 0.02
                j.conviction = max(0.0, min(1.0, j.conviction + shift))
                reward += -shift * 0.4
            self._cross_actions_taken += 1
            self._last_event = "Gentle cross-examination plants subtle doubt without antagonizing the jury."
            self._maybe_advance_from_cross()

        elif action_type == "aggressive_cross":
            w = self._witnesses[self._current_witness_idx] if self._current_witness_idx is not None else None
            cross_vuln = w.cross_vulnerability if w else 0.4
            for j in self._jurors:
                if cross_vuln >= 0.5:
                    shift = -0.10 - j.procedural_trust * 0.04
                else:
                    shift = -0.04
                if j.aggression_sensitivity > 0.5:
                    # Backfire: juror pushes back against aggressive lawyer
                    shift = abs(shift) * 0.5
                    j.bias_triggered = True
                j.conviction = max(0.0, min(1.0, j.conviction + shift))
                reward += -shift * 0.5
            self._cross_actions_taken += 1
            self._last_event = "Aggressive cross-examination. High-risk, high-reward. Some jurors flinch."
            self._maybe_advance_from_cross()

        elif action_type == "impeach_witness":
            w = self._witnesses[self._current_witness_idx] if self._current_witness_idx is not None else None
            if w:
                impeach_effect = w.cross_vulnerability * 0.15
                w.credibility = max(0.0, w.credibility - 0.20)
                for j in self._jurors:
                    shift = -impeach_effect * (0.5 + j.procedural_trust * 0.5)
                    j.conviction = max(0.0, min(1.0, j.conviction + shift))
                    reward += -shift * 0.4
                self._last_event = f"{w.name}'s credibility damaged. Jury appears less certain."
            self._cross_actions_taken += 1
            self._maybe_advance_from_cross()

        elif action_type == "request_recess":
            for j in self._jurors:
                j.fatigue = max(0.0, j.fatigue - 0.30)
            # Slight confidence penalty
            reward -= 0.10
            self._last_event = "Recess called. Fatigue drops but brief weakness is shown."

        elif action_type in ("closing_emotional", "closing_reasonable_doubt", "closing_procedural"):
            for j in self._jurors:
                if action_type == "closing_emotional":
                    shift = -0.08 - j.emotional_temp * 0.10
                elif action_type == "closing_procedural":
                    shift = -0.08 - j.procedural_trust * 0.10
                else:  # reasonable_doubt
                    shift = -0.10
                j.conviction = max(0.0, min(1.0, j.conviction + shift))
                reward += -shift * 0.5
            avg = sum(j.conviction for j in self._jurors) / 12
            if avg < 0.35:
                reward += 1.0
            elif avg < 0.50:
                reward += 0.30
            self._phase = "verdict"
            self._last_event = f"Closing argument delivered ({action_type.replace('closing_', '')}). Jury retires to deliberate."

        return reward

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _maybe_advance_from_cross(self) -> None:
        """After enough cross actions, return to witness_exam or closing."""
        if self._cross_actions_taken >= 2:
            remaining = [w for w in self._witnesses if not w.used]
            if remaining:
                self._phase = "witness_exam"
                self._current_witness_idx = None
            else:
                self._phase = "closing"

    def _apply_social_influence(self) -> None:
        """Jurors pull each other toward their conviction levels."""
        if self._task is None:
            return
        matrix = self._task.influence_matrix
        new_convictions = [j.conviction for j in self._jurors]
        for i, juror_i in enumerate(self._jurors):
            for k, juror_k in enumerate(self._jurors):
                if matrix[i][k] > 0:
                    delta = matrix[i][k] * (juror_i.conviction - juror_k.conviction) * 0.1
                    new_convictions[k] = max(0.0, min(1.0, new_convictions[k] + delta))
        for i, j in enumerate(self._jurors):
            j.conviction = new_convictions[i]

    def _grow_fatigue(self) -> None:
        rate = self._task.fatigue_growth_rate if self._task else 0.03
        for j in self._jurors:
            j.fatigue = min(1.0, j.fatigue + rate)

    def _step_reward_base(self) -> float:
        avg_conviction = sum(j.conviction for j in self._jurors) / 12
        mean_fatigue = sum(j.fatigue for j in self._jurors) / 12
        mean_trust = sum(j.procedural_trust for j in self._jurors) / 12
        return (
            (0.5 - avg_conviction) * 2.0
            - mean_fatigue * 0.30
            + mean_trust * 0.20
        )

    def _compute_task_score(self) -> float:
        if not self._jurors or self._task is None:
            return 0.0
        if self._task_id == "reasonable_doubt":
            return _grade_reasonable_doubt(self._jurors, self._initial_avg_conviction)
        elif self._task_id == "poisoned_panel":
            return _grade_poisoned_panel(self._jurors, self._initial_avg_conviction)
        else:
            return _grade_impossible_case(self._jurors, self._initial_avg_conviction)

    def _remaining_witness_names(self) -> List[str]:
        return [w.name for w in self._witnesses if not w.used]

    def _build_obs(self, reward: float, done: bool) -> JuryObservation:
        valid = _PHASE_ACTIONS.get(self._phase, [])
        return JuryObservation(
            phase=self._phase,
            step_index=self._state.step_count,
            conviction_pressure=_conviction_pressure(self._jurors) if self._jurors else 0.5,
            juror_moods=[_mood_label(j.conviction, j.fatigue) for j in self._jurors] if self._jurors else ["neutral"] * 12,
            juror_fatigue=[_fatigue_label(j.fatigue) for j in self._jurors] if self._jurors else ["low"] * 12,
            remaining_challenges=self._challenges_left,
            remaining_witnesses=self._remaining_witness_names(),
            current_witness=(self._witnesses[self._current_witness_idx].name
                             if self._current_witness_idx is not None else None),
            last_event=self._last_event,
            task_score=self._compute_task_score(),
            valid_actions=valid,
            task_id=self._task_id,
            done=done,
            reward=reward,
        )

    # ------------------------------------------------------------------
    # State property
    # ------------------------------------------------------------------

    @property
    def state(self) -> State:
        return self._state
