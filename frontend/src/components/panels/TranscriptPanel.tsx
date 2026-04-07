import { AnimatePresence, motion } from 'framer-motion'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TranscriptEntry } from '@/store/simulation'

type TranscriptPanelProps = {
  labels: {
    transcript: string
    reasoning: string
    events: string
    noEvents: string
    lastAction: string
  }
  actionReasoning: string
  lastAction: string
  entries: TranscriptEntry[]
  error: string
}

export function TranscriptPanel({ labels, actionReasoning, lastAction, entries, error }: TranscriptPanelProps) {
  const compact = (text: string) => {
    if (text.length <= 68) return text
    return `${text.slice(0, 65)}...`
  }

  return (
    <aside className="space-y-3">
      <Card className="bg-zinc-900/45">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{labels.transcript}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-zinc-950/45 p-3">
            <p className="mb-1 text-xs uppercase text-zinc-500">{labels.lastAction}</p>
            <p className="text-sm text-zinc-200">{compact(lastAction)}</p>
          </div>
          <div className="rounded-md bg-zinc-950/45 p-3">
            <p className="mb-1 text-xs uppercase text-zinc-500">{labels.reasoning}</p>
            <p className="text-sm text-zinc-300">{compact(actionReasoning)}</p>
          </div>
          {error && <p className="rounded-md border border-red-500/40 bg-red-950/40 p-2 text-sm text-red-200">{error}</p>}
        </CardContent>
      </Card>
      <Card className="bg-zinc-900/45">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{labels.events}</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[48vh] space-y-2 overflow-y-auto">
          <AnimatePresence initial={false}>
            {entries.length === 0 && <p className="text-sm text-zinc-400">{labels.noEvents}</p>}
            {entries.map((entry) => (
              <motion.article
                key={entry.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-md bg-zinc-950/50 p-2"
              >
                <p className="mb-1 text-xs uppercase text-zinc-500">Step {entry.step}</p>
                <p className="text-sm text-zinc-200">{compact(entry.text)}</p>
              </motion.article>
            ))}
          </AnimatePresence>
        </CardContent>
      </Card>
    </aside>
  )
}
