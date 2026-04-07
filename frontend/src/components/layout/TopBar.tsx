import { Badge } from '@/components/ui/badge'
import { tPhase } from '@/i18n/translate'
import type { AppLanguage } from '@/store/simulation'

type TopBarProps = {
  productTitle: string
  caseName: string
  language: AppLanguage
  health: string
  phase: string
  pressure: number
  running: boolean
  onTaskChange: (value: string) => void
  onLanguageChange: (value: AppLanguage) => void
  selectedTask: string
  labels: {
    case: string
    phase: string
    language: string
    pressure: string
    runStatus: string
    running: string
    idle: string
    online: string
    offline: string
  }
}

const TASKS = [
  { id: 'reasonable_doubt', label: 'State v. Callahan' },
  { id: 'poisoned_panel', label: 'State v. Whitmore' },
  { id: 'the_impossible_case', label: 'State v. Blackwood' },
] as const

export function TopBar({
  productTitle,
  caseName,
  language,
  health,
  phase,
  pressure,
  running,
  onTaskChange,
  onLanguageChange,
  selectedTask,
  labels,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-amber-100/10 bg-zinc-950/90 px-4 py-3 backdrop-blur md:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <p className="mr-1 text-xs uppercase tracking-[0.18em] text-amber-200/80">{productTitle}</p>
        <Badge variant="secondary" className="bg-amber-900/30 text-amber-100">
          {labels.case}: {caseName}
        </Badge>
        <select
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
          value={selectedTask}
          onChange={(event) => onTaskChange(event.target.value)}
        >
          {TASKS.map((task) => (
            <option key={task.id} value={task.id}>
              {task.label}
            </option>
          ))}
        </select>
        <Badge className="bg-zinc-800 text-zinc-100">{labels.phase}: {tPhase(language, phase)}</Badge>
        <span className="text-sm text-zinc-300">{labels.pressure}: {Math.round(pressure * 100)}%</span>
        <span className="text-sm text-zinc-300">{labels.runStatus}: {running ? labels.running : labels.idle}</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-zinc-300">{labels.language}</label>
          <select
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
            value={language}
            onChange={(event) => onLanguageChange(event.target.value as AppLanguage)}
          >
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="kn">Kannada</option>
            <option value="te">Telugu</option>
          </select>
          <Badge variant={health === 'healthy' ? 'secondary' : 'destructive'}>
            API: {health === 'healthy' ? labels.online : labels.offline}
          </Badge>
        </div>
      </div>
    </header>
  )
}
