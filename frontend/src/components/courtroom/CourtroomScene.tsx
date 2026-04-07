import { motion } from 'framer-motion'

import { CounselTables } from '@/components/courtroom/CounselTables'
import { JudgeBench } from '@/components/courtroom/JudgeBench'
import { JuryBox } from '@/components/courtroom/JuryBox'
import { WitnessStand } from '@/components/courtroom/WitnessStand'
import { tAction, tPhase } from '@/i18n/translate'
import type { AppLanguage } from '@/store/simulation'
import type { JuryObservation } from '@/lib/api'

type CourtroomSceneProps = {
  labels: {
    judgeBench: string
    witnessStand: string
    defenseTable: string
    prosecutionTable: string
    juryBox: string
  }
  language: AppLanguage
  observation: JuryObservation | null
  revealedVotes?: string[]
  moodLabel: (mood: string) => string
}

const judgeStatusByPhase: Record<string, 'Observing' | 'Sustained' | 'Overruled' | 'Proceed'> = {
  voir_dire: 'Observing',
  witness_exam: 'Proceed',
  cross_examination: 'Sustained',
  closing: 'Overruled',
  verdict: 'Proceed',
}

export function CourtroomScene({ labels, language, observation, revealedVotes, moodLabel }: CourtroomSceneProps) {
  if (!observation) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-sm text-zinc-400">
        Reset simulation to initialize the courtroom scene.
      </section>
    )
  }

  const strategy = tAction(language, observation.valid_actions[0] ?? 'probe_bias')
  const isWitnessFocus = observation.phase === 'cross_examination' || observation.phase === 'witness_exam'
  const isJuryFocus = observation.phase === 'closing' || observation.phase === 'verdict'
  return (
    <motion.section
      layout
      className="courtroom-stage relative space-y-8 overflow-hidden rounded-3xl p-7 shadow-2xl shadow-black/40"
    >
      <div className="mx-auto max-w-md">
        <JudgeBench title={labels.judgeBench} status={judgeStatusByPhase[observation.phase] ?? 'Observing'} />
      </div>

      <span className="pointer-events-none absolute left-1/2 top-[26%] -translate-x-1/2 rounded-full border border-amber-200/25 bg-black/35 px-4 py-1 text-xs uppercase tracking-widest text-amber-100/90">
        {tPhase(language, observation.phase)}
      </span>

      <div className="grid items-end gap-5 lg:grid-cols-[0.9fr_1.25fr_0.9fr]">
        <div className="pt-10">
          <CounselTables title={labels.defenseTable} side="defense" strategy={strategy} />
        </div>
        <motion.div
          animate={isWitnessFocus ? { scale: 1.01 } : { scale: 1 }}
          className={isWitnessFocus ? 'courtroom-focus rounded-2xl' : ''}
        >
          <WitnessStand title={labels.witnessStand} witnessName={observation.current_witness} phaseLabel={tPhase(language, observation.phase)} />
        </motion.div>
        <div className="pt-10">
          <CounselTables title={labels.prosecutionTable} side="prosecution" strategy={strategy} />
        </div>
      </div>

      <JuryBox
        title={labels.juryBox}
        moods={observation.juror_moods}
        fatigue={observation.juror_fatigue}
        moodLabel={moodLabel}
        revealedVotes={revealedVotes}
        emphasized={isJuryFocus}
      />
    </motion.section>
  )
}
