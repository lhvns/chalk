import { addDays, daysBetween, weekStart } from './format'
import { live } from './store'
import type { Cardio, DB, DateKey, Exercise, ExerciseKind, FoodLog, Nutrition, Workout, WorkoutSet } from './types'

/** Estimated one-rep max (Epley). Beyond ~12 reps the estimate is unreliable, so it's capped there. */
export function e1rm(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + Math.min(reps, 12) / 30)
}

export const doneSets = (sets: WorkoutSet[]) => sets.filter((s) => s.done && (s.reps ?? 0) > 0)

export function workoutVolume(w: Workout): number {
  let v = 0
  for (const e of w.entries) for (const s of doneSets(e.sets)) v += (s.weight ?? 0) * (s.reps ?? 0)
  return v
}

export const workoutSetCount = (w: Workout) => w.entries.reduce((n, e) => n + doneSets(e.sets).length, 0)

export const workoutMinutes = (w: Workout) =>
  w.finishedAt ? Math.max(1, Math.round((w.finishedAt - w.startedAt) / 60_000)) : 0

/** Workouts, newest first. */
export function sortedWorkouts(db: DB): Workout[] {
  return live(db, 'workouts').sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt)
}

export interface Session {
  workout: Workout
  date: DateKey
  sets: WorkoutSet[]
  best: number
  top: WorkoutSet | null
  volume: number
}

/** Every session that included an exercise, oldest first. */
export function exerciseSessions(db: DB, exerciseId: string, exercise?: Exercise): Session[] {
  const out: Session[] = []
  for (const w of sortedWorkouts(db).reverse()) {
    const sets = w.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => doneSets(e.sets))
    if (!sets.length) continue
    let best = 0
    let top: WorkoutSet | null = null
    let volume = 0
    for (const s of sets) {
      // Weighted lifts rank by estimated 1RM; bodyweight and timed ones by reps/seconds.
      const score = (exercise?.kind ?? 'weight') === 'weight' ? e1rm(s.weight ?? 0, s.reps ?? 0) : (s.reps ?? 0)
      if (score > best) {
        best = score
        top = s
      }
      volume += (s.weight ?? 0) * (s.reps ?? 0)
    }
    out.push({ workout: w, date: w.date, sets, best, top, volume })
  }
  return out
}

export interface LastSession {
  workout: Workout
  date: DateKey
  sets: WorkoutSet[]
  targetReps?: number
}

/** The most recent session of this exercise before `beforeWorkout` — the reference point while logging. */
export function lastSession(db: DB, exerciseId: string, beforeWorkout: Workout): LastSession | null {
  for (const w of sortedWorkouts(db)) {
    if (w.id === beforeWorkout.id) continue
    if (w.date > beforeWorkout.date || (w.date === beforeWorkout.date && w.startedAt > beforeWorkout.startedAt)) continue
    const entries = w.entries.filter((e) => e.exerciseId === exerciseId)
    const sets = entries.flatMap((e) => doneSets(e.sets))
    if (sets.length) return { workout: w, date: w.date, sets, targetReps: entries.find((e) => e.targetReps)?.targetReps }
  }
  return null
}

export const previousSets = (db: DB, exerciseId: string, beforeWorkout: Workout): WorkoutSet[] =>
  lastSession(db, exerciseId, beforeWorkout)?.sets ?? []

export type Trend = 'up' | 'down' | 'same'

const sign = (d: number, eps = 0): Trend => (d > eps ? 'up' : d < -eps ? 'down' : 'same')
const epley = (w: number, r: number) => w * (1 + r / 30)

/**
 * Did this set beat the same set last time? Same weight → more reps wins;
 * same reps → more weight wins; heavier-for-fewer (or lighter-for-more)
 * is judged by estimated 1RM.
 */
export function compareSet(kind: ExerciseKind, cur: WorkoutSet, prev: WorkoutSet): Trend {
  const cw = cur.weight ?? 0
  const pw = prev.weight ?? 0
  const cr = cur.reps ?? 0
  const pr = prev.reps ?? 0
  if (kind === 'time' || Math.abs(cw - pw) < 0.01) return sign(cr - pr)
  if (cr === pr) return sign(cw - pw, 0.01)
  return sign(epley(cw, cr) - epley(pw, pr), 0.005 * epley(pw, pr))
}

export interface Progression {
  /** Sets that reached the target last time. */
  hit: number
  total: number
  all: boolean
  /** kg, when every set used the same weight. */
  weight?: number
  /** kg to try next: one step up, once every set hit the target. */
  next?: number
}

/**
 * Linear progression: hit the target reps on every set at one weight, then add
 * a step (5 lb / 2.5 kg); until then, stay put.
 */
export function progression(kind: ExerciseKind, target: number, last: WorkoutSet[], stepKg: number): Progression {
  const hit = last.filter((s) => (s.reps ?? 0) >= target).length
  const all = last.length > 0 && hit === last.length
  const w0 = last[0]?.weight ?? 0
  const sameWeight = last.every((s) => Math.abs((s.weight ?? 0) - w0) < 0.01)
  const weight = kind === 'weight' && w0 > 0 && sameWeight ? w0 : undefined
  return { hit, total: last.length, all, weight, next: all && weight ? weight + stepKg : undefined }
}

export interface SetTotals {
  sets: number
  reps: number
  /** kg × reps */
  volume: number
}

export function setTotals(sets: WorkoutSet[]): SetTotals {
  return sets.reduce((t, s) => ({ sets: t.sets + 1, reps: t.reps + (s.reps ?? 0), volume: t.volume + (s.weight ?? 0) * (s.reps ?? 0) }), {
    sets: 0,
    reps: 0,
    volume: 0,
  })
}

/** Best estimated 1RM from every workout other than `excludeId` — the bar a set has to beat to be a PR. */
export function bestE1rm(db: DB, exerciseId: string, excludeId?: string): number {
  let best = 0
  for (const w of live(db, 'workouts')) {
    if (w.id === excludeId) continue
    for (const e of w.entries)
      if (e.exerciseId === exerciseId)
        for (const s of doneSets(e.sets)) best = Math.max(best, e1rm(s.weight ?? 0, s.reps ?? 0))
  }
  return best
}

// ---------- nutrition ----------

export const ZERO: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

export function totals(entries: FoodLog[]): Nutrition {
  const t = { ...ZERO }
  for (const e of entries) {
    t.kcal += e.kcal * e.servings
    t.protein += e.protein * e.servings
    t.carbs += e.carbs * e.servings
    t.fat += e.fat * e.servings
  }
  return t
}

export function foodByDate(db: DB): Map<DateKey, FoodLog[]> {
  const m = new Map<DateKey, FoodLog[]>()
  for (const f of live(db, 'foodLog')) {
    const list = m.get(f.date)
    if (list) list.push(f)
    else m.set(f.date, [f])
  }
  return m
}

export function cardioOn(db: DB, date: DateKey): Cardio[] {
  return live(db, 'cardio').filter((c) => c.date === date)
}

export function calorieBudget(db: DB, date: DateKey): number {
  const s = db.settings
  if (!s.eatBackCardio) return s.calorieGoal
  return s.calorieGoal + cardioOn(db, date).reduce((n, c) => n + (c.calories ?? 0), 0)
}

// ---------- body ----------

export interface Point {
  date: DateKey
  value: number
}

/** Weigh-ins (kg), oldest first. */
export function weightSeries(db: DB): Point[] {
  return live(db, 'body')
    .filter((b) => b.weight != null)
    .map((b) => ({ date: b.date, value: b.weight! }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Trailing 7-day average at each weigh-in. Daily weight swings by a kilo or two
 * on water alone; the average is the number worth watching.
 */
export function trend(points: Point[], days = 7): Point[] {
  return points.map((p, i) => {
    let sum = 0
    let n = 0
    for (let j = i; j >= 0 && daysBetween(points[j].date, p.date) < days; j--) {
      sum += points[j].value
      n++
    }
    return { date: p.date, value: sum / n }
  })
}

/** The trend value closest to (on or before) `date`. */
export function trendAt(points: Point[], date: DateKey): number | null {
  let v: number | null = null
  for (const p of trend(points)) {
    if (p.date > date) break
    v = p.value
  }
  return v
}

// ---------- weekly rollups ----------

export function weeksBack(today: DateKey, n: number): DateKey[] {
  const start = weekStart(today)
  return Array.from({ length: n }, (_, i) => addDays(start, -7 * (n - 1 - i)))
}

export function inWeek(date: DateKey, week: DateKey) {
  return date >= week && date < addDays(week, 7)
}
