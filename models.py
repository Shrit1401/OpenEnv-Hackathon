"""
Data models for the Jury Consultant Environment.

Each juror has a hidden guilt score (0–1). The agent can only see
mood labels and fatigue levels — never raw conviction numbers.
The agent's job is to push average hidden conviction down through
courtroom strategy decisions.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import Field

try:
    from openenv.core.env_server.types import Action, Observation
except ImportError:
    from core.env_server.types import Action, Observation


# ---------------------------------------------------------------------------
# Action
# ---------------------------------------------------------------------------


class JuryAction(Action):
    """
    One strategic decision by the defense consultant.

    action_type choices by phase:
      voir_dire:        probe_bias | challenge_juror | accept_panel
      witness_exam:     call_witness | request_recess
      cross_examination: gentle_cross | aggressive_cross | impeach_witness | request_recess
      closing:          closing_emotional | closing_reasonable_doubt | closing_procedural

    target_index:
      challenge_juror  → 0-based juror seat index (0–11)
      call_witness     → 0-based witness index from remaining_witnesses list
    """

    action_type: str = Field(..., description="Type of legal action to take")
    target_index: Optional[int] = Field(
        default=None,
        description="Juror index (for challenge) or witness index (for call_witness)",
    )
    task_id: Optional[str] = Field(
        default=None,
        description="Task to load on reset: reasonable_doubt | poisoned_panel | the_impossible_case",
    )


# ---------------------------------------------------------------------------
# Observation
# ---------------------------------------------------------------------------


class JuryObservation(Observation):
    """
    What the agent can observe — no raw conviction probabilities.

    conviction_pressure is a noisy aggregate signal (~avg conviction),
    not the true hidden value. juror_moods and juror_fatigue are
    coarse-grained labels derived from hidden state.
    """

    phase: str = Field(
        default="voir_dire",
        description="Current trial phase: voir_dire | witness_exam | cross_examination | closing | verdict",
    )
    step_index: int = Field(default=0, description="Steps taken so far")
    conviction_pressure: float = Field(
        default=0.5,
        description="Visible aggregate jury conviction signal (0=strong doubt, 1=certain guilty)",
    )
    juror_moods: List[str] = Field(
        default_factory=lambda: ["neutral"] * 12,
        description="Visible mood label per juror: hostile | neutral | receptive | disengaged",
    )
    juror_fatigue: List[str] = Field(
        default_factory=lambda: ["low"] * 12,
        description="Visible fatigue label per juror: low | medium | high",
    )
    remaining_challenges: int = Field(
        default=6, description="Peremptory challenges left"
    )
    remaining_witnesses: List[str] = Field(
        default_factory=list, description="Witness names still available to call"
    )
    current_witness: Optional[str] = Field(
        default=None, description="Witness currently on the stand"
    )
    last_event: str = Field(
        default="Trial begins.",
        description="Narrative description of what just happened in the courtroom",
    )
    task_score: float = Field(
        default=0.0,
        description="Current task grade (0.0–1.0) based on task-specific grader",
    )
    valid_actions: List[str] = Field(
        default_factory=list,
        description="Actions that are legal to take right now given the current phase",
    )
    task_id: str = Field(
        default="reasonable_doubt",
        description="Which task is currently running",
    )
