import { dictionaries } from '@/i18n/dictionaries'
import type { AppLanguage } from '@/store/simulation'

type Vars = Record<string, string | number>

export function dictionary(language: AppLanguage) {
  return dictionaries[language]
}

export function tPhase(language: AppLanguage, phase: string) {
  return dictionaries[language].phases[phase] ?? phase
}

export function tAction(language: AppLanguage, action: string) {
  return dictionaries[language].actions[action] ?? action
}

export function tMood(language: AppLanguage, mood: string) {
  return dictionaries[language].mood[mood] ?? mood
}

export function template(language: AppLanguage, key: keyof typeof dictionaries.en.transcriptTemplates, vars: Vars) {
  const raw = dictionaries[language].transcriptTemplates[key]
  return Object.entries(vars).reduce(
    (acc, [name, value]) => acc.replace(`{${name}}`, String(value)),
    raw,
  )
}
