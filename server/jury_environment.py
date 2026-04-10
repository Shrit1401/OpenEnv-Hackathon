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
# Named constants — single source of truth for all thresholds and weights.
# Centralizing these makes tuning and code review much easier.
# ---------------------------------------------------------------------------

# Mood label thresholds (used in _mood_label)
HOSTILE_THRESHOLD: float = 0.65          # conviction > this → hostile
RECEPTIVE_THRESHOLD: float = 0.35        # conviction < this → receptive
DISENGAGED_FATIGUE_THRESHOLD: float = 0.70  # fatigue >= this (when hostile) → disengaged

# Fatigue label thresholds (used in _fatigue_label)
FATIGUE_LOW_MAX: float = 0.35            # fatigue < this → "low"
FATIGUE_MEDIUM_MAX: float = 0.65         # fatigue < this → "medium", else "high"

# Reward formula weights — mirror _step_reward_base() exactly (no behavior change)
REWARD_CONVICTION_WEIGHT: float = 2.0
REWARD_FATIGUE_WEIGHT: float = 0.30
REWARD_TRUST_WEIGHT: float = 0.20

# Cross-examination: number of actions before phase auto-advances
CROSS_ACTIONS_PER_WITNESS: int = 2       # matches existing `>= 2` check in _maybe_advance_from_cross

# Informational deadline for the_impossible_case: alibi witness context label
# NOTE (Tier A): this constant is used only for display/goals — NOT to gate transitions.
IMPOSSIBLE_CASE_DEADLINE: int = 12


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
    # ---- casework artifact fields (all have defaults so existing callers work unchanged) ----
    case_summary: str = ""               # 1–3 sentence case description for agent context
    charges: List[str] = field(default_factory=list)        # formal charges
    evidence: List[dict] = field(default_factory=list)      # [{"id","kind","strength","summary"}]
    witness_profiles_static: List[dict] = field(default_factory=list)  # static witness metadata
    goals_static: List[dict] = field(default_factory=list)  # template goals (completed=False)
    coalition_hint: Optional[dict] = None                   # poisoned_panel cluster hint


# ---------------------------------------------------------------------------
# Task factory
# ---------------------------------------------------------------------------


def _make_task(task_id: str) -> TaskConfig:
    """
    Build a fully deterministic TaskConfig from a per-task fixed seed.

    WHY fixed seeds: The task structure (juror convictions, influence matrix,
    witness pool) must be identical across all episode seeds so that difficulty
    is a property of the task, not randomness. Only emotional_temp varies by
    episode seed (set in reset()).

    Each task is designed to test a different challenge:
      - reasonable_doubt: standard persuasion under uncertainty (easy)
      - poisoned_panel: coordination / cluster disruption (medium)
      - the_impossible_case: resource-limited hung-jury creation (hard, intentionally unwinnable)
    """
    rng = random.Random({"reasonable_doubt": 42, "poisoned_panel": 99, "the_impossible_case": 137}.get(task_id, 42))

    def jitter(base: float, spread: float = 0.05) -> float:
        return max(0.0, min(1.0, base + rng.uniform(-spread, spread)))

    if task_id == "reasonable_doubt":
        # Easy task: neutral jury, two leader jurors, 4 witnesses, 6 challenges.
        # Goal: drive avg conviction below 35% through witness examination + strategic challenges.
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
        return TaskConfig(
            name="reasonable_doubt",
            juror_convictions=convictions,
            juror_aggression_sensitivities=agg_sens,
            juror_procedural_trusts=proc_trust,
            juror_influence_powers=influence_powers,
            influence_matrix=matrix,
            witnesses=witnesses,
            max_challenges=6,
            fatigue_growth_rate=0.03,
            max_steps=25,
            case_summary=(
                "State v. Mercer: armed robbery at a convenience store. "
                "Prosecution relies on eyewitness ID and partial fingerprints. "
                "Defense argues mistaken identity and a strong alibi."
            ),
            charges=["Armed Robbery (Penal Code § 211)", "Assault with a Deadly Weapon"],
            evidence=[
                {"id": "ev1", "kind": "eyewitness", "strength": 0.60,
                 "summary": "Store clerk identified defendant from ~8 feet away, under stress."},
                {"id": "ev2", "kind": "forensics", "strength": 0.40,
                 "summary": "Partial fingerprint on register — inconclusive match."},
                {"id": "ev3", "kind": "alibi", "strength": 0.70,
                 "summary": "Employer confirms defendant was clocked in at work during the robbery."},
                {"id": "ev4", "kind": "motive", "strength": 0.30,
                 "summary": "No prior record; prosecution claims financial desperation."},
            ],
            witness_profiles_static=[
                {"name": "Dr. Chen", "type": "expert", "theme": "forensics analysis — disputes fingerprint reliability", "used": False},
                {"name": "Maria Santos", "type": "eyewitness", "theme": "store clerk — primary prosecution witness", "used": False},
                {"name": "Tom Mercer Sr.", "type": "character", "theme": "character reference for defendant", "used": False},
                {"name": "Dr. Kim", "type": "alibi", "theme": "alibis the defendant at workplace", "used": False},
            ],
            goals_static=[
                {"id": "g1", "description": "Use at least one peremptory challenge to remove a biased juror", "priority": 1, "required_phase": "voir_dire", "completed": False, "completed_at_step": None},
                {"id": "g2", "description": "Call Dr. Kim (alibi witness) before closing", "priority": 2, "completed": False, "completed_at_step": None},
                {"id": "g3", "description": "Drive average jury conviction below 0.35 by closing", "priority": 1, "deadline_step": 20, "completed": False, "completed_at_step": None},
                {"id": "g4", "description": "Impeach Maria Santos to damage prosecution eyewitness credibility", "priority": 3, "required_phase": "cross_examination", "completed": False, "completed_at_step": None},
                {"id": "g5", "description": "Advance through all 4 phases without skipping witness examination", "priority": 2, "completed": False, "completed_at_step": None},
                {"id": "g6", "description": "Keep jury fatigue low — no juror in 'high' fatigue at verdict", "priority": 4, "completed": False, "completed_at_step": None},
            ],
            coalition_hint=None,
        )

    elif task_id == "poisoned_panel":
        # Medium task: 3 highly biased jurors (seats 0-2) forming a tight influence cluster.
        # Challenge: cluster reinforces itself AND pulls neutral jurors upward.
        # Must break or neutralize the cluster before it contaminates everyone.
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
        # moderate outward influence from cluster to neutral jurors
        for a in [0, 1, 2]:
            for b in range(3, 12):
                matrix[a][b] = 0.10
        witnesses = [
            WitnessHidden("Prof. Hammond", "expert", 0.80, 0.30, 0.60),
            WitnessHidden("Rachel Thorn", "eyewitness", 0.55, 0.75, 0.70),
            WitnessHidden("James Aldridge Sr.", "character", 0.50, 0.70, 0.50),
            WitnessHidden("Dr. Osei", "alibi", 0.65, 0.40, 0.55),
        ]
        return TaskConfig(
            name="poisoned_panel",
            juror_convictions=convictions,
            juror_aggression_sensitivities=agg_sens,
            juror_procedural_trusts=proc_trust,
            juror_influence_powers=influence_powers,
            influence_matrix=matrix,
            witnesses=witnesses,
            max_challenges=6,
            fatigue_growth_rate=0.04,
            max_steps=25,
            case_summary=(
                "State v. Aldridge: financial fraud and embezzlement. "
                "Three jurors are strongly biased toward conviction and "
                "actively pull the rest of the panel toward a guilty verdict."
            ),
            charges=["Wire Fraud (18 U.S.C. § 1343)", "Embezzlement (Penal Code § 503)"],
            evidence=[
                {"id": "ev1", "kind": "forensics", "strength": 0.75,
                 "summary": "Bank records show systematic transfers to an offshore account."},
                {"id": "ev2", "kind": "eyewitness", "strength": 0.55,
                 "summary": "Whistleblower claims to have witnessed defendant approving the transfers."},
                {"id": "ev3", "kind": "alibi", "strength": 0.50,
                 "summary": "Defendant claims signature was forged; handwriting expert disputed."},
                {"id": "ev4", "kind": "motive", "strength": 0.65,
                 "summary": "Defendant had significant gambling debts at the time of the alleged fraud."},
            ],
            witness_profiles_static=[
                {"name": "Prof. Hammond", "type": "expert", "theme": "financial forensics — disputes bank record interpretation", "used": False},
                {"name": "Rachel Thorn", "type": "eyewitness", "theme": "whistleblower — prosecution's key witness", "used": False},
                {"name": "James Aldridge Sr.", "type": "character", "theme": "character witness for defendant", "used": False},
                {"name": "Dr. Osei", "type": "alibi", "theme": "handwriting expert — disputes signature authenticity", "used": False},
            ],
            goals_static=[
                {"id": "g1", "description": "Break the 3-juror hostile cluster — all below 0.55 conviction", "priority": 1, "completed": False, "completed_at_step": None},
                {"id": "g2", "description": "Call Prof. Hammond (expert) to counter financial forensics narrative", "priority": 2, "completed": False, "completed_at_step": None},
                {"id": "g3", "description": "Prevent cluster from contaminating neutral jurors (none above 0.70)", "priority": 1, "completed": False, "completed_at_step": None},
                {"id": "g4", "description": "Challenge at least 2 of the 3 cluster jurors (seats 0/1/2) directly", "priority": 2, "required_phase": "voir_dire", "completed": False, "completed_at_step": None},
                {"id": "g5", "description": "Call Dr. Osei (alibi/handwriting expert) to contest signature authenticity", "priority": 3, "completed": False, "completed_at_step": None},
                {"id": "g6", "description": "Complete cross-examination of Rachel Thorn to damage whistleblower credibility", "priority": 3, "required_phase": "cross_examination", "completed": False, "completed_at_step": None},
            ],
            coalition_hint={
                "size": 3,
                "seats": [0, 1, 2],
                "influence_style": "tight cluster — each member reinforces the others and pulls neutral jurors upward",
            },
        )

    else:  # the_impossible_case
        # Hard task: 9 jurors start above 70% conviction. Almost no path to acquittal.
        # Scoring rewards variance + holdouts (hung jury pattern), NOT uniform reduction.
        # Only 1 witness, 3 challenges, and fast fatigue growth (0.06/step).
        # IMPOSSIBLE to optimize all metrics simultaneously — intentional benchmark design.
        convictions = [jitter(0.75) for _ in range(9)] + [jitter(0.45), jitter(0.40), jitter(0.35)]
        agg_sens = [jitter(0.60) for _ in range(12)]
        proc_trust = [jitter(0.35) for _ in range(12)]
        influence_powers = [jitter(0.30) for _ in range(12)]
        # chain topology: each juror pulls the next one in sequence
        matrix = [[0.0] * 12 for _ in range(12)]
        for i in range(11):
            matrix[i][i + 1] = 0.15
        witnesses = [
            WitnessHidden("Dr. Patel", "expert", 0.70, 0.50, 0.65),
        ]
        return TaskConfig(
            name="the_impossible_case",
            juror_convictions=convictions,
            juror_aggression_sensitivities=agg_sens,
            juror_procedural_trusts=proc_trust,
            juror_influence_powers=influence_powers,
            influence_matrix=matrix,
            witnesses=witnesses,
            max_challenges=3,
            fatigue_growth_rate=0.06,
            max_steps=25,
            case_summary=(
                "State v. Harmon: first-degree murder with strong physical evidence. "
                "Nine jurors begin firmly convinced of guilt. "
                "Acquittal is near-impossible; the goal is a hung jury."
            ),
            charges=["First-Degree Murder (Penal Code § 187)", "Use of a Deadly Weapon"],
            evidence=[
                {"id": "ev1", "kind": "forensics", "strength": 0.85,
                 "summary": "Defendant's DNA found at the scene — prosecution's strongest evidence."},
                {"id": "ev2", "kind": "eyewitness", "strength": 0.80,
                 "summary": "Two independent eyewitnesses place defendant at the scene."},
                {"id": "ev3", "kind": "alibi", "strength": 0.45,
                 "summary": f"Alibi witness claims defendant was elsewhere — credibility disputed. Context: informational only."},
                {"id": "ev4", "kind": "motive", "strength": 0.70,
                 "summary": "Defendant had documented conflict with victim spanning three years."},
            ],
            witness_profiles_static=[
                {"name": "Dr. Patel", "type": "expert",
                 "theme": "forensics expert — creates reasonable doubt about DNA collection procedure", "used": False},
            ],
            goals_static=[
                {"id": "g1", "description": f"Call Dr. Patel before step {IMPOSSIBLE_CASE_DEADLINE} (only witness)", "priority": 1, "deadline_step": IMPOSSIBLE_CASE_DEADLINE, "completed": False, "completed_at_step": None},
                {"id": "g2", "description": "Create at least 3 holdout jurors with conviction below 0.40", "priority": 1, "completed": False, "completed_at_step": None},
                {"id": "g3", "description": "Achieve conviction variance ≥ 0.20 stdev across the panel", "priority": 2, "completed": False, "completed_at_step": None},
                {"id": "g4", "description": "Use aggressive cross at least once to maximize the split", "priority": 3, "required_phase": "cross_examination", "completed": False, "completed_at_step": None},
                {"id": "g5", "description": "End with at least 4 jurors below 0.50 conviction (force genuine split)", "priority": 2, "completed": False, "completed_at_step": None},
                {"id": "g6", "description": "Preserve at least 1 challenge — don't waste all 3 on non-leaders", "priority": 4, "completed": False, "completed_at_step": None},
            ],
            coalition_hint=None,
        )


# ---------------------------------------------------------------------------
# Visible signal mapping
# ---------------------------------------------------------------------------


def _mood_label(conviction: float, fatigue: float) -> str:
    """Coarse mood label derived from hidden conviction + fatigue.
    Hostile/disengaged = high conviction; receptive = low conviction.
    Disengaged is a special case of hostile with high fatigue."""
    if conviction > HOSTILE_THRESHOLD:
        return "disengaged" if fatigue >= DISENGAGED_FATIGUE_THRESHOLD else "hostile"
    elif conviction < RECEPTIVE_THRESHOLD:
        return "receptive"
    else:
        return "neutral"


def _fatigue_label(fatigue: float) -> str:
    """Coarse fatigue label. High fatigue makes jurors less persuadable."""
    if fatigue < FATIGUE_LOW_MAX:
        return "low"
    elif fatigue < FATIGUE_MEDIUM_MAX:
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

_SCORE_MIN = 0.02
_SCORE_MAX = 0.98


def _strict_unit_interval(value: float) -> float:
    """Clamp score to [0.02, 0.98] to avoid float precision issues at boundaries."""
    return max(_SCORE_MIN, min(_SCORE_MAX, value))


def _grade_reasonable_doubt(jurors: List[JurorHidden], initial_avg: float) -> float:
    avg = sum(j.conviction for j in jurors) / 12
    return _strict_unit_interval(1.0 - avg / 0.5)


def _grade_poisoned_panel(jurors: List[JurorHidden], initial_avg: float) -> float:
    cluster = jurors[:3]
    cluster_below = sum(1 for j in cluster if j.conviction < 0.55) / 3
    avg_reduction = max(0.0, initial_avg - sum(j.conviction for j in jurors) / 12)
    reduction_score = min(1.0, avg_reduction / 0.35)
    return _strict_unit_interval(cluster_below * 0.60 + reduction_score * 0.40)


def _grade_impossible_case(jurors: List[JurorHidden], initial_avg: float) -> float:
    convictions = [j.conviction for j in jurors]
    if len(set(convictions)) < 2:
        stdev = 0.0
    else:
        stdev = statistics.stdev(convictions)
    holdouts = sum(1 for c in convictions if c < 0.40)
    stdev_score = min(1.0, stdev / 0.28)
    holdout_score = min(1.0, holdouts / 3)
    return _strict_unit_interval(stdev_score * 0.50 + holdout_score * 0.50)


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
        # --- exploit resistance & goal tracking ---
        self._jury_patience: float = 1.0
        self._last_action_type: Optional[str] = None
        self._consecutive_same_action: int = 0
        self._challenged_seats: set = set()
        self._aggressive_cross_used: bool = False
        self._phases_visited: set = set()

    # ------------------------------------------------------------------
    # Reset
    # ------------------------------------------------------------------

    def reset(self, seed: Optional[int] = None, episode_id: Optional[str] = None,
              task_id: Optional[str] = None, **kwargs) -> JuryObservation:
        """
        Start a new episode from scratch.

        WHY this design: All juror convictions, witness pool, and influence topology
        are fixed per task_id (loaded from TaskConfig). Only `emotional_temp` is
        randomized per seed. This means two episodes of the same task with different
        seeds will feel slightly different but have identical structural difficulty.

        Execution order:
          1. Validate task_id, load TaskConfig
          2. Seed the episode RNG (controls emotional_temp + replacement jurors)
          3. Construct 12 JurorHidden objects (conviction from task, emotional_temp from RNG)
          4. Copy WitnessHidden pool from task (fresh copy, used=False for all)
          5. Reset phase to voir_dire, reset all counters
          6. Return initial observation
        """
        _VALID_TASKS = {"reasonable_doubt", "poisoned_panel", "the_impossible_case"}
        task_id = task_id or "reasonable_doubt"
        if task_id not in _VALID_TASKS:
            raise ValueError(
                f"Unknown task_id '{task_id}'. Valid tasks: {sorted(_VALID_TASKS)}"
            )
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
        # Reset exploit-resistance and goal-tracking state
        self._jury_patience = 1.0
        self._last_action_type = None
        self._consecutive_same_action = 0
        self._challenged_seats = set()
        self._aggressive_cross_used = False
        self._phases_visited = {"voir_dire"}

        return self._build_obs(reward=0.0, done=False)

    # ------------------------------------------------------------------
    # Step
    # ------------------------------------------------------------------

    def step(self, action: JuryAction) -> JuryObservation:  # type: ignore[override]
        """
        Execute one action and advance the environment by one timestep.

        Execution order (WHY this order matters):
          1. Increment step counter
          2. Early-return if already in verdict (episode is over)
          3. Check action validity; penalize invalid actions for direct Python usage
             (HTTP API already rejects invalid actions with 422 before reaching here)
          4. Apply the action — modifies juror state, returns reward
          5. Apply social influence — jurors pull each other based on influence_matrix
          6. Grow fatigue — all jurors accumulate fatigue at task rate
          7. Check terminal conditions — verdict phase or step limit
          8. Build and return observation

        The ordering of (4)→(5)→(6) means the agent's action takes effect before
        social influence propagates, which is intentional: the action should affect
        what influence the jurors feel, not be diluted by it.
        """
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

    def valid_actions(self) -> List[str]:
        return list(_PHASE_ACTIONS.get(self._phase, []))

    def grade(self) -> float:
        return self._compute_task_score()

    def visible_state(self) -> Dict[str, object]:
        """Return the public subset of episode state for the /state endpoint.

        Intentionally omits all hidden juror attributes (conviction scores,
        emotional_temp, procedural_trust, aggression_sensitivity, influence_power).
        The agent must infer those from the coarse mood/fatigue labels.

        This method is called by app.py's GET /state handler, NOT by step() —
        step() calls _build_obs() which produces the richer JuryObservation.
        """
        return {
            "episode_id": self._state.episode_id,
            "step_count": self._state.step_count,
            "phase": self._phase,
            "task_id": self._task_id,
            "conviction_pressure": _conviction_pressure(self._jurors) if self._jurors else 0.5,
            "juror_moods": [_mood_label(j.conviction, j.fatigue) for j in self._jurors] if self._jurors else ["neutral"] * 12,
            "juror_fatigue": [_fatigue_label(j.fatigue) for j in self._jurors] if self._jurors else ["low"] * 12,
            "remaining_challenges": self._challenges_left,
            "remaining_witnesses": self._remaining_witness_names(),
            "valid_actions": self.valid_actions(),
            "done": self._phase == "verdict",
            "score": self._compute_task_score(),
        }

    # ------------------------------------------------------------------
    # Internal action dispatcher
    # ------------------------------------------------------------------

    def _apply_action(self, action_type: str, target_index: Optional[int]) -> float:
        """
        Main action dispatcher — handles all 11 action types.

        WHY base reward is computed first: `_step_reward_base()` captures the
        pre-action jury state as a baseline. Each action then adds or subtracts
        from this base, making action_effect = (total reward - base reward).
        This keeps reward components interpretable and separable.

        Returns the total step reward (base + action-specific delta).
        """
        # --- patience decay / recovery ---
        if action_type == self._last_action_type:
            self._consecutive_same_action += 1
            self._jury_patience = max(0.20, self._jury_patience - 0.10 * self._consecutive_same_action)
        else:
            self._consecutive_same_action = 0
            self._jury_patience = min(1.0, self._jury_patience + 0.05)
        self._last_action_type = action_type

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
                self._challenged_seats.add(idx)
                delta = old_conv - self._jurors[idx].conviction
                reward += delta * 0.5
                self._last_event = f"Juror {idx} challenged and replaced. Conviction change: {delta:+.2f}."

        elif action_type == "accept_panel":
            self._phase = "witness_exam"
            self._phases_visited.add("witness_exam")
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
            self._phases_visited.add("cross_examination")
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
            self._aggressive_cross_used = True
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
            self._phases_visited.add("closing")
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
                self._phases_visited.add("witness_exam")
                self._current_witness_idx = None
            else:
                self._phase = "closing"
                self._phases_visited.add("closing")

    def _apply_social_influence(self) -> None:
        """
        Apply peer influence: jurors pull each other's convictions via the task's influence matrix.

        WHY this mechanic exists: Real juries deliberate and influence each other.
        Strong jurors (leaders, clusters) push neutral ones toward their position.

        Mechanics: For each pair (i, k) where matrix[i][k] > 0:
          delta = matrix[i][k] * (conviction_i - conviction_k) * 0.1
          new_conviction_k += delta
        The 0.1 damping factor keeps each step's influence small (prevents oscillation).
        All convictions are updated from the same pre-step snapshot (not propagated
        within a single step) to avoid ordering artifacts.
        """
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
        """
        Accumulate fatigue for all jurors every step.

        WHY fatigue matters: High fatigue makes jurors less persuadable and more
        disengaged. It creates time pressure — waiting too long degrades the jury.
        Fatigue is task-specific:
          - reasonable_doubt: 0.03/step (forgiving)
          - poisoned_panel: 0.04/step (moderate pressure)
          - the_impossible_case: 0.06/step (aggressive — 2× faster)
        Fatigue only decreases via request_recess (but recess has costs too).
        """
        rate = self._task.fatigue_growth_rate if self._task else 0.03
        for j in self._jurors:
            j.fatigue = min(1.0, j.fatigue + rate)

    def _step_reward_base(self) -> float:
        """
        Compute the base reward from the current jury state BEFORE the action takes effect.

        Formula: (0.5 - avg_conviction) * 2.0 - mean_fatigue * 0.30 + mean_trust * 0.20

        WHY each term:
          - Conviction term: Core signal. When avg_conviction < 0.5, this is positive.
            At avg_conviction=0.0 (full acquittal), contributes +1.0.
            At avg_conviction=1.0 (certain guilty), contributes -1.0.
          - Fatigue penalty: Soft cost. A tired jury is unpredictable and harder to persuade.
            Capped at -0.30 when mean_fatigue=1.0.
          - Trust bonus: Small reward for building procedural faith in the defense.
            Capped at +0.20 when mean_trust=1.0.

        Typical range: approximately -0.5 to +1.0 before action-specific effects.
        The action_effect then adds to this base (e.g., challenge_juror adds delta*0.5,
        closing adds up to +1.0 bonus).
        """
        avg_conviction = sum(j.conviction for j in self._jurors) / 12
        mean_fatigue = sum(j.fatigue for j in self._jurors) / 12
        mean_trust = sum(j.procedural_trust for j in self._jurors) / 12
        return (
            (0.5 - avg_conviction) * 2.0
            - mean_fatigue * 0.30
            + mean_trust * 0.20
        )

    def _compute_task_score(self) -> float:
        """
        Compute the current normalized task score in [0.02, 0.98].

        WHY [0.02, 0.98] and not [0, 1]: Float precision at exact boundaries can
        cause issues during evaluation. The strict open interval is enforced by
        _strict_unit_interval() to prevent edge cases.

        Score formula (70/30 blend):
          task_score = 0.70 * jury_score + 0.30 * goal_score

        WHY 70/30: The jury outcome (conviction levels) is the core signal.
        Goal completion adds a transparent multi-factor dimension — it rewards
        correct strategy (e.g. calling the alibi witness, breaking the cluster)
        even when conviction hasn't fully moved yet. This makes the grader
        harder to game with a single repeated action and more interpretable:
        judges can see *which* objectives the agent completed.

        jury_score delegates to the task-specific grader:
          - reasonable_doubt: 1.0 - avg_conviction/0.5 (reward uniform reduction)
          - poisoned_panel: 60% cluster_broken + 40% avg_reduction (reward cluster disruption)
          - the_impossible_case: 50% stdev_score + 50% holdout_score (reward hung jury pattern)

        goal_score: priority-weighted completion rate across 3-4 task goals.
        """
        if not self._jurors or self._task is None:
            return _SCORE_MIN
        if self._task_id == "reasonable_doubt":
            jury_score = _grade_reasonable_doubt(self._jurors, self._initial_avg_conviction)
        elif self._task_id == "poisoned_panel":
            jury_score = _grade_poisoned_panel(self._jurors, self._initial_avg_conviction)
        else:
            jury_score = _grade_impossible_case(self._jurors, self._initial_avg_conviction)
        goal_score = self._compute_goal_score()
        raw = 0.70 * jury_score + 0.30 * goal_score
        # Patience multiplier: repeated actions decay patience → penalize exploitative policies
        # patience=1.0 → ×1.0 (unaffected); patience=0.20 → ×0.76
        patience_multiplier = 0.70 + 0.30 * self._jury_patience
        return _strict_unit_interval(raw * patience_multiplier)

    def _remaining_witness_names(self) -> List[str]:
        return [w.name for w in self._witnesses if not w.used]

    def _compute_goals(self) -> List[dict]:
        """
        Return the task's goals with 'completed' updated from current juror state
        and episode history (witness usage, challenge count).
        Purely observational — no side effects on reward or transitions.
        Lets the agent see what objectives are still open each step.

        Completion is based only on visible signals + internal flags that are
        derivable from the agent's action history — never raw hidden convictions,
        except via already-exposed aggregates (avg_conviction < threshold).
        """
        if not self._task or not self._task.goals_static:
            return []
        goals = [dict(g) for g in self._task.goals_static]  # shallow copy; never mutate task

        step = self._state.step_count

        if self._task_id == "reasonable_doubt":
            avg_conv = sum(j.conviction for j in self._jurors) / 12
            alibi_called = any(w.used and w.witness_type == "alibi" for w in self._witnesses)
            hostile_challenged = self._task.max_challenges - self._challenges_left > 0
            eyewitness_impeached = any(
                w.used and w.credibility < 0.55
                for w in self._witnesses
                if w.witness_type == "eyewitness"
            )
            all_phases_visited = {"voir_dire", "witness_exam", "cross_examination", "closing"}.issubset(self._phases_visited)
            no_high_fatigue = all(_fatigue_label(j.fatigue) != "high" for j in self._jurors)
            for g in goals:
                if g["id"] == "g1":
                    completed = hostile_challenged
                elif g["id"] == "g2":
                    completed = alibi_called
                elif g["id"] == "g3":
                    completed = avg_conv < 0.35
                elif g["id"] == "g4":
                    completed = eyewitness_impeached
                elif g["id"] == "g5":
                    completed = all_phases_visited
                elif g["id"] == "g6":
                    completed = no_high_fatigue
                else:
                    completed = g.get("completed", False)
                g["completed"] = completed
                if completed and g.get("completed_at_step") is None:
                    g["completed_at_step"] = step

        elif self._task_id == "poisoned_panel":
            cluster_broken = all(self._jurors[i].conviction < 0.55 for i in range(3))
            expert_called = any(w.used and w.witness_type == "expert" for w in self._witnesses)
            neutral_safe = all(self._jurors[i].conviction <= 0.70 for i in range(3, 12))
            cluster_challenged_2 = len(self._challenged_seats & {0, 1, 2}) >= 2
            alibi_called = any(w.used and w.witness_type == "alibi" for w in self._witnesses)
            # Rachel Thorn is the eyewitness; g6 completed if she was called AND cross was taken
            eyewitness_crossed = any(
                w.used and w.witness_type == "eyewitness" for w in self._witnesses
            ) and "cross_examination" in self._phases_visited
            for g in goals:
                if g["id"] == "g1":
                    completed = cluster_broken
                elif g["id"] == "g2":
                    completed = expert_called
                elif g["id"] == "g3":
                    completed = neutral_safe
                elif g["id"] == "g4":
                    completed = cluster_challenged_2
                elif g["id"] == "g5":
                    completed = alibi_called
                elif g["id"] == "g6":
                    completed = eyewitness_crossed
                else:
                    completed = g.get("completed", False)
                g["completed"] = completed
                if completed and g.get("completed_at_step") is None:
                    g["completed_at_step"] = step

        elif self._task_id == "the_impossible_case":
            holdouts_40 = sum(1 for j in self._jurors if j.conviction < 0.40)
            holdouts_50 = sum(1 for j in self._jurors if j.conviction < 0.50)
            convictions = [j.conviction for j in self._jurors]
            stdev = statistics.stdev(convictions) if len(set(convictions)) > 1 else 0.0
            witness_called = any(w.used for w in self._witnesses)
            for g in goals:
                if g["id"] == "g1":
                    completed = witness_called
                elif g["id"] == "g2":
                    completed = holdouts_40 >= 3
                elif g["id"] == "g3":
                    completed = stdev >= 0.20
                elif g["id"] == "g4":
                    completed = self._aggressive_cross_used
                elif g["id"] == "g5":
                    completed = holdouts_50 >= 4
                elif g["id"] == "g6":
                    completed = self._challenges_left > 0
                else:
                    completed = g.get("completed", False)
                g["completed"] = completed
                if completed and g.get("completed_at_step") is None:
                    g["completed_at_step"] = step

        return goals

    def _compute_goal_score(self) -> float:
        """
        Compute a priority-weighted goal completion rate in [0.0, 1.0].

        WHY: Goals are designed so that completing high-priority objectives
        reliably correlates with task success. Weighting by priority (1=highest)
        means the agent is rewarded more for the strategically critical moves
        (e.g., breaking the cluster in poisoned_panel) than minor ones.

        Formula: sum(priority_weight * completed) / sum(priority_weight)
        where priority_weight = 1 / priority (priority 1 → weight 1.0, priority 3 → weight 0.33).

        Returns 0.0 if no goals are defined.
        """
        goals = self._compute_goals()
        if not goals:
            return 0.0
        total_weight = 0.0
        earned_weight = 0.0
        for g in goals:
            w = 1.0 / g["priority"]
            total_weight += w
            if g["completed"]:
                earned_weight += w
        return earned_weight / total_weight if total_weight > 0 else 0.0

    def _compute_juror_profiles_visible(self) -> List[dict]:
        """
        Build per-juror visible profile with contextual notes.
        Only exposes mood and fatigue labels — hidden conviction is never revealed.
        Notes give the agent strategic guidance without leaking hidden state.
        """
        profiles = []
        for i, j in enumerate(self._jurors):
            mood = _mood_label(j.conviction, j.fatigue)
            fatigue = _fatigue_label(j.fatigue)
            if mood == "hostile":
                notes = "High conviction — priority challenge or persuasion target."
            elif mood == "receptive":
                notes = "Open to defense — reinforce with credible witnesses."
            elif mood == "disengaged":
                notes = "Exhausted and hostile — recess may help, but patience is finite."
            else:
                notes = "Neutral — monitor for shifts after witness testimony."
            profiles.append({"index": i, "mood": mood, "fatigue": fatigue, "notes": notes})
        return profiles

    def _compute_reward_breakdown(self) -> dict:
        """
        Compute informational reward state components from current juror averages.
        PURELY DESCRIPTIVE — these values are not used in reward computation.
        They help the agent understand why conviction pressure is changing.
        """
        if not self._jurors:
            return {}
        avg_conv = sum(j.conviction for j in self._jurors) / 12
        mean_fatigue = sum(j.fatigue for j in self._jurors) / 12
        mean_trust = sum(j.procedural_trust for j in self._jurors) / 12
        return {
            "avg_conviction": round(avg_conv, 4),
            "conviction_pressure_component": round((0.5 - avg_conv) * REWARD_CONVICTION_WEIGHT, 4),
            "fatigue_penalty_component": round(-mean_fatigue * REWARD_FATIGUE_WEIGHT, 4),
            "trust_bonus_component": round(mean_trust * REWARD_TRUST_WEIGHT, 4),
            "goal_completion_rate": round(self._compute_goal_score(), 4),
        }

    def _build_obs(self, reward: float, done: bool) -> JuryObservation:
        """
        Build the full observation for the agent.
        Existing fields are unchanged. New fields are additive — all have defaults
        so existing consumers that don't read them remain unaffected.
        """
        valid = _PHASE_ACTIONS.get(self._phase, [])

        # Compute new fields once to avoid duplicate work
        goals = self._compute_goals() if self._jurors else []
        pending_goals = [g for g in goals if not g["completed"]]

        # Sync witness 'used' flag from live witness state into profiles
        witness_profiles: List[dict] = []
        if self._task and self._task.witness_profiles_static:
            for i, wp in enumerate(self._task.witness_profiles_static):
                if i < len(self._witnesses):
                    witness_profiles.append({**wp, "used": self._witnesses[i].used})

        # Deadline countdown: informational only (no transition gating in Tier A)
        deadline_remaining: Optional[int] = None
        if self._task_id == "the_impossible_case":
            deadline_remaining = max(0, IMPOSSIBLE_CASE_DEADLINE - self._state.step_count)

        return JuryObservation(
            # ---- existing fields (unchanged) ----
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
            # ---- new casework artifact fields ----
            case_summary=self._task.case_summary if self._task else "",
            charges=self._task.charges if self._task else [],
            evidence=self._task.evidence if self._task else [],
            witness_profiles=witness_profiles,
            goals=goals,
            pending_goals=pending_goals,
            coalition_hint=self._task.coalition_hint if self._task else None,
            cross_actions_remaining=max(0, CROSS_ACTIONS_PER_WITNESS - self._cross_actions_taken),
            jury_patience=round(self._jury_patience, 4),
            juror_profiles_visible=self._compute_juror_profiles_visible() if self._jurors else [],
            reward_breakdown=self._compute_reward_breakdown(),
            phase_deadline_steps_remaining=deadline_remaining,
        )

    # ------------------------------------------------------------------
    # State property
    # ------------------------------------------------------------------

    @property
    def state(self) -> State:
        return self._state

    @property
    def phase(self) -> str:
        """Public accessor for current trial phase. Use this instead of _phase."""
        return self._phase
