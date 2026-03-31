import { Scale, Shield } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

type CounselTablesProps = {
  title: string
  side: 'defense' | 'prosecution'
  strategy: string
}

export function CounselTables({ title, side, strategy }: CounselTablesProps) {
  const isDefense = side === 'defense'
  return (
    <section className="rounded-2xl bg-zinc-900/45 p-4 shadow-lg shadow-black/20">
      <p className={`mb-2 text-xs uppercase tracking-widest ${isDefense ? 'text-amber-200/70' : 'text-zinc-400'}`}>{title}</p>
      <div className="flex items-center justify-between">
        <p className="font-medium text-zinc-100">{isDefense ? 'Defense Strategy' : 'Prosecution Position'}</p>
        {isDefense ? <Shield className="h-4 w-4 text-amber-200/80" /> : <Scale className="h-4 w-4 text-zinc-300" />}
      </div>
      {isDefense ? (
        <Badge variant="secondary" className="mt-3 bg-amber-950/35 text-amber-100">
          {strategy}
        </Badge>
      ) : (
        <p className="mt-3 text-sm text-zinc-400">Holding prosecution narrative under adversarial pressure.</p>
      )}
    </section>
  )
}
