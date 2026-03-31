import { Badge } from '@/components/ui/badge'

type JudgeBenchProps = {
  title: string
  status: 'Observing' | 'Sustained' | 'Overruled' | 'Proceed'
}

export function JudgeBench({ title, status }: JudgeBenchProps) {
  return (
    <section className="rounded-2xl bg-zinc-900/45 px-5 py-4 shadow-lg shadow-black/30">
      <p className="text-xs uppercase tracking-widest text-amber-200/70">{title}</p>
      <div className="mt-2 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-100">Hon. Bench</h3>
        <Badge variant="secondary" className="bg-amber-900/35 text-amber-100">
          {status}
        </Badge>
      </div>
    </section>
  )
}
