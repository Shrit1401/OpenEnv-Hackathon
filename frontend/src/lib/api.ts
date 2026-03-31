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

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://0.0.0.0:7860";

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
