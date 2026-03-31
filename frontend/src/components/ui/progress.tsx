import { cn } from '@/lib/utils'

type ProgressProps = {
  value: number
  className?: string
}

export function Progress({ value, className }: ProgressProps) {
  const bounded = Math.max(0, Math.min(100, value))

  return (
    <div className={cn('relative h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800', className)}>
      <div
        className="h-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 transition-all"
        style={{ width: `${bounded}%` }}
      />
    </div>
  )
}
