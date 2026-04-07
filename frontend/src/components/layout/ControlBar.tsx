import { Pause, Play, RotateCcw, SkipForward, Scale } from 'lucide-react'

import { Button } from '@/components/ui/button'

type ControlBarProps = {
  labels: {
    reset: string
    step: string
    autoplay: string
    pause: string
    revealVerdict: string
  }
  busy: boolean
  isAutoplay: boolean
  onReset: () => void
  onStep: () => void
  onAutoplayToggle: () => void
  onRevealVerdict: () => void
}

export function ControlBar({
  labels,
  busy,
  isAutoplay,
  onReset,
  onStep,
  onAutoplayToggle,
  onRevealVerdict,
}: ControlBarProps) {
  return (
    <footer className="sticky bottom-0 z-20 border-t border-amber-100/10 bg-zinc-950/95 px-4 py-3 backdrop-blur md:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap gap-2">
        <Button variant="secondary" onClick={onReset} disabled={busy}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {labels.reset}
        </Button>
        <Button onClick={onStep} disabled={busy}>
          <SkipForward className="mr-2 h-4 w-4" />
          {labels.step}
        </Button>
        <Button variant="outline" onClick={onAutoplayToggle} disabled={busy}>
          {isAutoplay ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
          {isAutoplay ? labels.pause : labels.autoplay}
        </Button>
        <Button variant="secondary" onClick={onRevealVerdict}>
          <Scale className="mr-2 h-4 w-4" />
          {labels.revealVerdict}
        </Button>
      </div>
    </footer>
  )
}
