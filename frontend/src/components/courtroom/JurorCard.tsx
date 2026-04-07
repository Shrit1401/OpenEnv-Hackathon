import { motion } from 'framer-motion'
import { User } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

type JurorCardProps = {
  index: number
  mood: string
  fatigue: string
  moodLabel: string
  revealVote?: string
}

const fatigueLevel = (fatigue: string) => {
  if (fatigue === 'high') return 85
  if (fatigue === 'medium') return 55
  return 25
}

export function JurorCard({ index, mood, fatigue, moodLabel, revealVote }: JurorCardProps) {
  const glow = mood === 'receptive' ? 'rgba(16, 185, 129, 0.25)' : mood === 'hostile' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(161, 161, 170, 0.2)'
  const pulseColor = mood === 'receptive' ? 'bg-emerald-400' : mood === 'hostile' ? 'bg-rose-400' : 'bg-amber-200'
  return (
    <motion.article
      layout
      initial={{ opacity: 0.8, y: 6 }}
      animate={{
        opacity: 1,
        y: [0, -3, 0],
        boxShadow: [`0 0 0 1px ${glow}`, `0 0 0 1px ${glow}, 0 0 0 6px rgba(245, 158, 11, 0.14)`, `0 0 0 1px ${glow}`],
      }}
      transition={{ duration: 0.5, times: [0, 0.4, 1] }}
      whileHover={{ y: -2 }}
      className="rounded-xl border border-zinc-700/40 bg-zinc-900/65 p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-zinc-300">Juror {index + 1}</span>
        <div className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${pulseColor} jury-pulse`} />
          <User className="h-4 w-4 text-zinc-400" />
        </div>
      </div>
      <Badge variant={mood === 'hostile' ? 'destructive' : 'secondary'} className="mb-2">
        {moodLabel}
      </Badge>
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-zinc-400">Attention</p>
        <Progress value={100 - fatigueLevel(fatigue)} />
      </div>
      <div className="mt-2 flex items-center gap-1">
        {[0, 1, 2].map((dot) => (
          <span
            key={`${index}-${dot}`}
            className={`h-1.5 w-1.5 rounded-full ${dot < Math.ceil(fatigueLevel(fatigue) / 34) ? 'bg-amber-300/90' : 'bg-zinc-700'}`}
          />
        ))}
      </div>
      {revealVote && <p className="mt-2 text-xs font-semibold text-amber-100">{revealVote}</p>}
    </motion.article>
  )
}
