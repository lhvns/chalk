import type { DateKey, ExerciseKind, Settings, WorkoutSet } from './types'

// ---------- dates (always local calendar days) ----------

const pad = (n: number) => String(n).padStart(2, '0')

export const toKey = (d: Date): DateKey => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayKey = (): DateKey => toKey(new Date())

export function fromKey(k: DateKey): Date {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(k: DateKey, n: number): DateKey {
  const d = fromKey(k)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

/** Monday of the week containing `k`. */
export function weekStart(k: DateKey): DateKey {
  const d = fromKey(k)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return toKey(d)
}

export const daysBetween = (a: DateKey, b: DateKey) =>
  Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86_400_000)

export function dayLabel(k: DateKey, today = todayKey()): string {
  const diff = daysBetween(k, today)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff === -1) return 'Tomorrow'
  const d = fromKey(k)
  const sameYear = d.getFullYear() === fromKey(today).getFullYear()
  return d.toLocaleDateString(undefined, {
    weekday: diff > 0 && diff < 7 ? 'long' : 'short',
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })
}

export const shortDate = (k: DateKey) =>
  fromKey(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function clockTime(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function duration(min: number): string {
  if (!isFinite(min) || min <= 0) return '0m'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h}h ${pad(m)}m` : `${m}m`
}

export function stopwatch(sec: number): string {
  sec = Math.max(0, Math.round(sec))
  const m = Math.floor(sec / 60)
  return `${m}:${pad(sec % 60)}`
}

// ---------- numbers & units ----------

/** Rounds to `dp` decimals and drops trailing zeros: 62.50 → "62.5", 60.0 → "60". */
export function num(n: number | null | undefined, dp = 1): string {
  if (n == null || !isFinite(n)) return '–'
  const f = 10 ** dp
  return (Math.round(n * f) / f).toLocaleString(undefined, { maximumFractionDigits: dp })
}

export const int = (n: number) => Math.round(n).toLocaleString()

const LB = 2.2046226218
const MI = 1.609344
const IN = 2.54

export const units = (s: Settings) => ({
  w: s.weightUnit,
  d: s.distanceUnit,
  l: s.lengthUnit,
  /** kg → display unit */
  wOut: (kg: number) => (s.weightUnit === 'lb' ? kg * LB : kg),
  /** display unit → kg */
  wIn: (v: number) => (s.weightUnit === 'lb' ? v / LB : v),
  dOut: (km: number) => (s.distanceUnit === 'mi' ? km / MI : km),
  dIn: (v: number) => (s.distanceUnit === 'mi' ? v * MI : v),
  lOut: (cm: number) => (s.lengthUnit === 'in' ? cm / IN : cm),
  lIn: (v: number) => (s.lengthUnit === 'in' ? v * IN : v),
})

/** Parses user input like "62,5" or " 80 " — returns null for blank/invalid. */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return isFinite(n) ? n : null
}

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** "1 set", "3 sets" */
export const plural = (n: number, word: string, many = `${word}s`) => `${n.toLocaleString()} ${n === 1 ? word : many}`

type Units = ReturnType<typeof units>

/** One set as text: "135 × 8", "+25 × 6", "8 reps", "45s". */
export function setText(kind: ExerciseKind, s: WorkoutSet, u: Units): string {
  if (kind === 'time') return `${s.reps ?? 0}s`
  if (kind === 'reps') return s.weight ? `+${num(u.wOut(s.weight))} × ${s.reps}` : `${s.reps} reps`
  return `${num(u.wOut(s.weight ?? 0))} × ${s.reps}`
}

/** A whole session compactly: "135 lb × 8, 8, 7" when the weight held, else each set. */
export function setsCompact(kind: ExerciseKind, sets: WorkoutSet[], u: Units): string {
  if (!sets.length) return ''
  if (kind === 'time') return sets.map((s) => `${s.reps ?? 0}s`).join(', ')
  const w0 = sets[0].weight ?? 0
  const reps = sets.map((s) => s.reps ?? 0).join(', ')
  if (sets.every((s) => Math.abs((s.weight ?? 0) - w0) < 0.01)) {
    if (kind === 'reps') return w0 ? `+${num(u.wOut(w0))} ${u.w} × ${reps}` : `${reps} reps`
    return `${num(u.wOut(w0))} ${u.w} × ${reps}`
  }
  return sets.map((s) => setText(kind, s, u)).join(', ')
}
