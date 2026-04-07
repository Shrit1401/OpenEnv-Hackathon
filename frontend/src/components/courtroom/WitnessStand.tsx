import { motion } from 'framer-motion'

import { Badge } from '@/components/ui/badge'

type WitnessStandProps = {
  title: string
  witnessName: string | null
  phaseLabel: string
}

export function WitnessStand({ title, witnessName, phaseLabel }: WitnessStandProps) {
  const active = Boolean(witnessName)
  return (
    <motion.section
      initial={false}
      animate={{
        boxShadow: active
          ? '0 0 0 1px rgba(245, 158, 11, 0.45), 0 18px 36px rgba(0, 0, 0, 0.35)'
          : '0 0 0 1px rgba(82, 82, 91, 0.2)',
      }}
      className="rounded-2xl bg-zinc-900/55 p-5"
    >
      <p className="text-xs uppercase tracking-widest text-amber-200/70">{title}</p>
      <div className="mt-2 flex items-center justify-between">
        <h3 className="text-base font-semibold">{witnessName ?? 'No witness on stand'}</h3>
        <Badge variant="secondary" className="bg-zinc-800 text-zinc-100">
          {phaseLabel}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        {active ? 'Testimony is active; jurors react to credibility and tone.' : 'Awaiting witness call from defense.'}
      </p>
    </motion.section>
  )
}
