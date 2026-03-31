import { useEffect, useMemo } from 'react'

import { CourtroomScene } from '@/components/courtroom/CourtroomScene'
import { ControlBar } from '@/components/layout/ControlBar'
import { TopBar } from '@/components/layout/TopBar'
import { TranscriptPanel } from '@/components/panels/TranscriptPanel'
import { VerdictModal } from '@/components/panels/VerdictModal'
import { dictionary, tAction, tMood, template } from '@/i18n/translate'
import { useSimulationStore } from '@/store/simulation'

const CASES: Record<string, string> = {
  reasonable_doubt: 'State v. Mercer',
  poisoned_panel: 'State v. Aldridge',
  the_impossible_case: 'State v. Harmon',
}

function App() {
  const {
    caseName,
    selectedTask,
    language,
    health,
    isRunning,
    isAutoplay,
    isVerdictOpen,
    verdictRevealIndex,
    observation,
    transcript,
    lastError,
    checkHealth,
    setLanguage,
    setTask,
    reset,
    step,
    pushTranscript,
    setAutoplay,
    setVerdictOpen,
    setVerdictRevealIndex,
  } = useSimulationStore()

  const d = dictionary(language)

  useEffect(() => {
    void checkHealth()
  }, [checkHealth])

  useEffect(() => {
    if (!observation) return
    const action = tAction(language, observation.valid_actions[0] ?? 'probe_bias')
    pushTranscript({
      id: `${observation.step_index}-${Date.now()}`,
      step: observation.step_index,
      text: observation.last_event || template(language, 'actionApplied', { action }),
      tone: 'neutral',
    })
  }, [language, observation, pushTranscript])

  useEffect(() => {
    if (!isAutoplay || !observation || observation.done) return
    const timer = window.setTimeout(() => {
      void step()
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [isAutoplay, observation, step])

  useEffect(() => {
    if (!isVerdictOpen || !observation) return
    let idx = -1
    const timer = window.setInterval(() => {
      idx += 1
      setVerdictRevealIndex(idx)
      if (idx >= 11) {
        window.clearInterval(timer)
      }
    }, 170)
    return () => window.clearInterval(timer)
  }, [isVerdictOpen, observation, setVerdictRevealIndex])

  const revealedVotes = useMemo(() => {
    if (!observation) return []
    return observation.juror_moods.map((mood, idx) => {
      if (idx > verdictRevealIndex) return ''
      return mood === 'hostile' ? d.verdict.guilty : d.verdict.notGuilty
    })
  }, [d.verdict.guilty, d.verdict.notGuilty, observation, verdictRevealIndex])

  const verdictLabel = useMemo(() => {
    if (!observation) return ''
    if (observation.conviction_pressure < 0.4) return d.verdict.established
    if (observation.conviction_pressure > 0.65) return d.verdict.secured
    return d.verdict.hung
  }, [d.verdict.established, d.verdict.hung, d.verdict.secured, observation])

  const reasoning = useMemo(() => {
    if (!observation) return 'Awaiting reset.'
    const lastAction = tAction(language, observation.valid_actions[0] ?? 'probe_bias')
    return `${template(language, 'actionApplied', { action: lastAction })} ${template(language, 'pressureShift', { value: Math.round(observation.conviction_pressure * 100) })}`
  }, [language, observation])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(120,53,15,0.20),transparent_40%),radial-gradient(circle_at_bottom,rgba(120,53,15,0.12),transparent_42%),#0e0b08] text-zinc-100">
      <TopBar
        productTitle="Courtroom Simulation"
        caseName={caseName}
        selectedTask={selectedTask}
        language={language}
        health={health}
        phase={observation?.phase ?? 'voir_dire'}
        pressure={observation?.conviction_pressure ?? 0}
        running={isRunning}
        onTaskChange={(task) => setTask(task, CASES[task] ?? CASES.reasonable_doubt)}
        onLanguageChange={setLanguage}
        labels={{
          case: d.ui.case,
          phase: d.ui.phase,
          language: d.ui.language,
          pressure: d.ui.pressure,
          runStatus: d.ui.runStatus,
          running: d.ui.running,
          idle: d.ui.idle,
          online: d.ui.online,
          offline: d.ui.offline,
        }}
      />

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 md:grid-cols-[1fr_340px] md:px-8">
        <section className="space-y-4">
          <div className="rounded-2xl bg-black/20 p-4">
            <div className="mb-2 flex items-end justify-between">
              <p className="text-sm font-medium tracking-wide text-zinc-300">{d.ui.pressure}</p>
              <p className="text-4xl font-bold text-amber-100">{Math.round((observation?.conviction_pressure ?? 0) * 100)}%</p>
            </div>
            <div className="h-4 overflow-hidden rounded-full bg-zinc-900/85">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-400 transition-all duration-700"
                style={{ width: `${Math.round((observation?.conviction_pressure ?? 0) * 100)}%` }}
              />
            </div>
          </div>
          <CourtroomScene
            labels={{
              judgeBench: d.ui.judgeBench,
              witnessStand: d.ui.witnessStand,
              defenseTable: d.ui.defenseTable,
              prosecutionTable: d.ui.prosecutionTable,
              juryBox: d.ui.juryBox,
            }}
            language={language}
            observation={observation}
            revealedVotes={revealedVotes}
            moodLabel={(mood) => tMood(language, mood)}
          />
        </section>

        <TranscriptPanel
          labels={{
            transcript: d.ui.transcript,
            reasoning: d.ui.reasoning,
            events: d.ui.events,
            noEvents: d.ui.noEvents,
            lastAction: d.ui.lastAction,
          }}
          actionReasoning={reasoning}
          lastAction={observation ? tAction(language, observation.valid_actions[0] ?? 'probe_bias') : '-'}
          entries={transcript}
          error={lastError}
        />
      </main>

      <ControlBar
        labels={{
          reset: d.ui.reset,
          step: d.ui.step,
          autoplay: d.ui.autoplay,
          pause: d.ui.pause,
          revealVerdict: d.ui.revealVerdict,
        }}
        busy={isRunning}
        isAutoplay={isAutoplay}
        onReset={() => void reset()}
        onStep={() => void step()}
        onAutoplayToggle={() => setAutoplay(!isAutoplay)}
        onRevealVerdict={() => setVerdictOpen(true)}
      />

      <VerdictModal
        open={isVerdictOpen}
        title={d.ui.finalVerdict}
        verdict={verdictLabel}
        scoreLabel={d.ui.score}
        score={observation?.task_score ?? 0}
        pressure={observation?.conviction_pressure ?? 0}
        jurorVotes={revealedVotes.map((vote) => vote || '...')}
        onClose={() => setVerdictOpen(false)}
      />
    </div>
  )
}

export default App
