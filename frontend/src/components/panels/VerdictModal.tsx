import { motion } from 'framer-motion'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type VerdictModalProps = {
  open: boolean
  title: string
  verdict: string
  scoreLabel: string
  score: number
  pressure: number
  jurorVotes: string[]
  onClose: () => void
}

export function VerdictModal({
  open,
  title,
  verdict,
  scoreLabel,
  score,
  pressure,
  jurorVotes,
  onClose,
}: VerdictModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl">
        <Card className="border-amber-200/20 bg-zinc-950/95">
          <CardHeader>
            <CardTitle className="text-2xl text-amber-100">{title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-lg font-semibold text-zinc-100">{verdict}</p>
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <p className="rounded-md border border-zinc-700 bg-zinc-900/70 p-2">{scoreLabel}: {Math.round(score * 100)}%</p>
              <p className="rounded-md border border-zinc-700 bg-zinc-900/70 p-2">Conviction Pressure: {Math.round(pressure * 100)}%</p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {jurorVotes.map((vote, index) => (
                <p key={`vote-${index}`} className="rounded-md border border-zinc-700 bg-zinc-900/70 p-2 text-sm">
                  Juror {index + 1}: {vote}
                </p>
              ))}
            </div>
            <Button onClick={onClose}>Close</Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
