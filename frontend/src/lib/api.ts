export type EvidenceItem = {
  id: string;
  kind: string;
  strength: number;
  summary: string;
};

export type WitnessProfile = {
  name: string;
  type: string;
  theme: string;
  used: boolean;
};

export type Goal = {
  id: string;
  description: string;
  priority: number;
  completed: boolean;
};

export type CoalitionHint = {
  size: number;
  seats: number[];
  influence_style: string;
};

export type JurorProfileVisible = {
  index: number;
  mood: string;
  fatigue: string;
  notes: string;
};

export type RewardBreakdown = {
  avg_conviction: number;
  conviction_pressure_component: number;
  fatigue_penalty_component: number;
  trust_bonus_component: number;
  goal_completion_rate?: number;
};

export type JuryObservation = {
  phase: string;
  step_index: number;
  conviction_pressure: number;
  juror_moods: string[];
  juror_fatigue: string[];
  remaining_challenges: number;
  remaining_witnesses: string[];
  current_witness: string | null;
  last_event: string;
  task_score: number;
  valid_actions: string[];
  task_id: string;
  done?: boolean;
  reward?: number;
  // Round-2 casework artifact fields (optional for backwards compat)
  case_summary?: string;
  charges?: string[];
  evidence?: EvidenceItem[];
  witness_profiles?: WitnessProfile[];
  goals?: Goal[];
  pending_goals?: Goal[];
  coalition_hint?: CoalitionHint | null;
  cross_actions_remaining?: number;
  jury_patience?: number;
  juror_profiles_visible?: JurorProfileVisible[];
  reward_breakdown?: RewardBreakdown;
  phase_deadline_steps_remaining?: number | null;
};

export type StepResponse = {
  observation: JuryObservation;
  reward: number | null;
  done: boolean;
};

type StateResponse = {
  episode_id: string | null;
  step_count: number;
};

type ValidActionsResponse = {
  phase: string;
  valid_actions: string[];
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    throw new Error(`API request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function getHealth() {
  return request<{ status: string }>("/health");
}

export function resetSimulation(taskId: string, seed = 42) {
  return request<StepResponse>("/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id: taskId, seed }),
  });
}

export function stepSimulation(actionType: string, targetIndex?: number) {
  const action: { action_type: string; target_index?: number } = {
    action_type: actionType,
  };
  if (typeof targetIndex === "number" && !Number.isNaN(targetIndex)) {
    action.target_index = targetIndex;
  }
  return request<StepResponse>("/step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

export function getSimulationState() {
  return request<StateResponse>("/state");
}

export function getValidActions() {
  return request<ValidActionsResponse>("/valid_actions");
}
