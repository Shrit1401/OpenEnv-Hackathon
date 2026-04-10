import { create } from 'zustand'

import {
  type JuryObservation,
  getHealth,
  getSimulationState,
  getValidActions,
  resetSimulation,
  stepSimulation,
} from '@/lib/api'

export type AppLanguage = 'en' | 'hi' | 'kn' | 'te'

export type TranscriptEntry = {
  id: string
  step: number
  text: string
  tone: 'neutral' | 'positive' | 'warning'
}

type SimulationStore = {
  caseName: string
  selectedTask: string
  language: AppLanguage
  health: 'checking' | 'healthy' | 'offline'
  isRunning: boolean
  isAutoplay: boolean
  isVerdictOpen: boolean
  verdictRevealIndex: number
  observation: JuryObservation | null
  validActions: string[]
  transcript: TranscriptEntry[]
  actionReasoning: string
  lastError: string
  targetIndex: number
  setLanguage: (language: AppLanguage) => void
  setTask: (task: string, caseName: string) => void
  setTargetIndex: (value: number) => void
  setVerdictOpen: (open: boolean) => void
  setAutoplay: (isAutoplay: boolean) => void
  setVerdictRevealIndex: (index: number) => void
  checkHealth: () => Promise<void>
  reset: () => Promise<void>
  syncState: () => Promise<void>
  step: (actionType?: string) => Promise<void>
  pushTranscript: (entry: TranscriptEntry) => void
}

const chooseFallbackAction = (observation: JuryObservation | null, actions: string[]) => {
  if (!observation) return actions[0] ?? 'request_recess'

  const has = (name: string) => actions.includes(name)
  const phase = observation.phase

  if (phase === 'voir_dire') {
    // Move forward after early probing/challenges; otherwise the run gets stuck.
    if (observation.step_index >= 2 && has('accept_panel')) return 'accept_panel'
    if (has('challenge_juror') && observation.remaining_challenges > 0) {
      const hostile = observation.juror_moods.find((mood) => mood === 'hostile')
      if (hostile) return 'challenge_juror'
    }
    if (has('probe_bias')) return 'probe_bias'
    if (has('accept_panel')) return 'accept_panel'
  }

  if (phase === 'witness_exam') {
    if (has('call_witness')) return 'call_witness'
    if (has('request_recess')) return 'request_recess'
  }

  if (phase === 'cross_examination') {
    if (has('impeach_witness')) return 'impeach_witness'
    if (has('gentle_cross')) return 'gentle_cross'
    if (has('aggressive_cross')) return 'aggressive_cross'
    if (has('request_recess')) return 'request_recess'
  }

  if (phase === 'closing') {
    if (has('closing_reasonable_doubt')) return 'closing_reasonable_doubt'
    if (has('closing_procedural')) return 'closing_procedural'
    if (has('closing_emotional')) return 'closing_emotional'
  }

  return actions[0] ?? 'request_recess'
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  caseName: 'State v. Cotton',
  selectedTask: 'reasonable_doubt',
  language: 'en',
  health: 'checking',
  isRunning: false,
  isAutoplay: false,
  isVerdictOpen: false,
  verdictRevealIndex: -1,
  observation: null,
  validActions: [],
  transcript: [],
  actionReasoning: '',
  lastError: '',
  targetIndex: 0,

  setLanguage: (language) => set({ language }),
  setTask: (task, caseName) => set({ selectedTask: task, caseName }),
  setTargetIndex: (value) => set({ targetIndex: value }),
  setVerdictOpen: (open) => set({ isVerdictOpen: open }),
  setAutoplay: (isAutoplay) => set({ isAutoplay }),
  setVerdictRevealIndex: (index) => set({ verdictRevealIndex: index }),

  checkHealth: async () => {
    const attempt = async () => {
      try {
        const health = await getHealth()
        if (health.status === 'healthy') {
          set({ health: 'healthy' })
          return true
        }
      } catch {
        // will retry
      }
      set({ health: 'offline' })
      return false
    }

    // Retry every 3s until healthy (up to 20 attempts = 60s)
    for (let i = 0; i < 20; i++) {
      const ok = await attempt()
      if (ok) return
      await new Promise((r) => setTimeout(r, 3000))
    }
  },

  reset: async () => {
    const { selectedTask } = get()
    set({ isRunning: true, lastError: '', isVerdictOpen: false, verdictRevealIndex: -1 })
    try {
      const response = await resetSimulation(selectedTask)
      set({
        observation: response.observation,
        validActions: response.observation.valid_actions,
        transcript: [],
        actionReasoning: '',
      })
      await get().syncState()
    } catch (error) {
      set({ lastError: error instanceof Error ? error.message : 'Reset failed' })
    } finally {
      set({ isRunning: false })
    }
  },

  syncState: async () => {
    try {
      const [state, valid] = await Promise.all([getSimulationState(), getValidActions()])
      const current = get().observation
      if (!current) return
      set({
        observation: { ...current, step_index: state.step_count, phase: valid.phase, valid_actions: valid.valid_actions },
        validActions: valid.valid_actions,
      })
    } catch {
      // Non-fatal sync operation.
    }
  },

  step: async (actionType) => {
    const { validActions, targetIndex, observation } = get()
    if (!observation) return
    // Don't step into a completed episode — nothing valid to send
    if (observation.done || observation.valid_actions.length === 0) {
      set({ isAutoplay: false, isVerdictOpen: true })
      return
    }
    const chosen = actionType ?? chooseFallbackAction(observation, validActions)
    set({ isRunning: true, lastError: '' })
    try {
      const response = await stepSimulation(
        chosen,
        chosen === 'challenge_juror' || chosen === 'call_witness' ? targetIndex : undefined,
      )
      const nextObs = response.observation
      const justFinished = response.done || nextObs.done || nextObs.valid_actions.length === 0
      set({
        observation: nextObs,
        validActions: nextObs.valid_actions,
        ...(justFinished ? { isAutoplay: false, isVerdictOpen: true } : {}),
      })
      if (!justFinished) await get().syncState()
    } catch (error) {
      set({ lastError: error instanceof Error ? error.message : 'Step failed' })
    } finally {
      set({ isRunning: false })
    }
  },

  pushTranscript: (entry) => {
    set((state) => ({ transcript: [entry, ...state.transcript].slice(0, 80) }))
  },
}))
