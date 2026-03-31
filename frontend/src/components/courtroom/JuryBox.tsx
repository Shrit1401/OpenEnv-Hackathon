import { JurorCard } from '@/components/courtroom/JurorCard'

type JuryBoxProps = {
  title: string
  moods: string[]
  fatigue: string[]
  moodLabel: (mood: string) => string
  revealedVotes?: string[]
  emphasized?: boolean
}

export function JuryBox({ title, moods, fatigue, moodLabel, revealedVotes = [], emphasized = false }: JuryBoxProps) {
  return (
    <section className={`rounded-2xl bg-zinc-900/70 p-5 ${emphasized ? 'courtroom-focus' : 'border border-zinc-700/40'}`}>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-zinc-400">{title}</p>
        <p className="text-sm font-medium text-amber-100">12 Jurors Live</p>
      </div>
      <div className="grid grid-cols-3 gap-3 xl:grid-cols-4">
        {moods.map((mood, index) => (
          <JurorCard
            key={`juror-${index}-${mood}-${fatigue[index] ?? 'low'}`}
            index={index}
            mood={mood}
            fatigue={fatigue[index] ?? 'low'}
            moodLabel={moodLabel(mood)}
            revealVote={revealedVotes[index]}
          />
        ))}
      </div>
    </section>
  )
}
