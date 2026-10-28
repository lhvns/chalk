import { describe, expect, it } from 'vitest'
import { emptyDB } from './defaults'
import { setsCompact, units } from './format'
import { compareSet, lastSession, progression, setTotals } from './stats'
import type { DB, Workout, WorkoutSet } from './types'

const set = (weight: number | null, reps: number, done = true): WorkoutSet => ({ id: `${weight}-${reps}-${Math.random()}`, weight, reps, done })

function workout(id: string, date: string, startedAt: number, sets: WorkoutSet[], exerciseId = 'ex-bench-press'): Workout {
  return { id, updatedAt: 1, date, name: id, startedAt, finishedAt: startedAt + 3_600_000, entries: [{ id: `${id}-e`, exerciseId, sets }] }
}

function dbWith(...ws: Workout[]): DB {
  const db = emptyDB()
  for (const w of ws) db.workouts[w.id] = w
  return db
}

describe('compareSet', () => {
  it('same weight: more reps is up, fewer is down, equal is same', () => {
    expect(compareSet('weight', set(60, 9), set(60, 8))).toBe('up')
    expect(compareSet('weight', set(60, 7), set(60, 8))).toBe('down')
    expect(compareSet('weight', set(60, 8), set(60, 8))).toBe('same')
  })

  it('same reps: more weight is up', () => {
    expect(compareSet('weight', set(62.5, 8), set(60, 8))).toBe('up')
    expect(compareSet('weight', set(57.5, 8), set(60, 8))).toBe('down')
  })

  it('heavier for fewer reps is judged by estimated 1RM', () => {
    // 65×6 ≈ 78 e1RM vs 60×8 = 76 → up; 65×3 ≈ 71.5 → down.
    expect(compareSet('weight', set(65, 6), set(60, 8))).toBe('up')
    expect(compareSet('weight', set(65, 3), set(60, 8))).toBe('down')
  })

  it('treats lb↔kg round-trips as the same weight', () => {
    const lb135 = 135 / 2.2046226218
    expect(compareSet('weight', set(lb135 + 1e-9, 8), set(lb135, 8))).toBe('same')
  })

  it('timed and bodyweight work compare seconds or reps', () => {
    expect(compareSet('time', set(null, 75), set(null, 60))).toBe('up')
    expect(compareSet('reps', set(null, 10), set(null, 12))).toBe('down')
  })
})

describe('lastSession', () => {
  const today = workout('today', '2026-10-15', 3000, [set(null, 0, false)])

  it('finds the most recent earlier session with done sets', () => {
    const db = dbWith(
      workout('old', '2026-10-01', 1000, [set(60, 8)]),
      workout('recent', '2026-10-08', 2000, [set(62.5, 8), set(62.5, 7)]),
      workout('skipped', '2026-10-10', 2500, [set(70, 5, false)]),
      today,
    )
    const last = lastSession(db, 'ex-bench-press', today)
    expect(last?.workout.id).toBe('recent')
    expect(last?.sets.map((s) => s.reps)).toEqual([8, 7])
  })

  it('ignores later sessions and other exercises', () => {
    const db = dbWith(
      workout('later', '2026-10-20', 9000, [set(80, 5)]),
      workout('squat', '2026-10-12', 2000, [set(100, 5)], 'ex-back-squat'),
      today,
    )
    expect(lastSession(db, 'ex-bench-press', today)).toBeNull()
  })
})

describe('session summaries', () => {
  it('totals sets, reps and volume', () => {
    expect(setTotals([set(60, 8), set(60, 8), set(60, 7)])).toEqual({ sets: 3, reps: 23, volume: 1380 })
  })

  it('formats compactly when the weight held', () => {
    const lb = units({ ...emptyDB().settings, weightUnit: 'lb' })
    const kg = units({ ...emptyDB().settings, weightUnit: 'kg' })
    const w = lb.wIn(135)
    expect(setsCompact('weight', [set(w, 8), set(w, 8), set(w, 7)], lb)).toBe('135 lb × 8, 8, 7')
    expect(setsCompact('weight', [set(60, 8), set(65, 5)], kg)).toBe('60 × 8, 65 × 5')
    expect(setsCompact('reps', [set(null, 12), set(null, 10)], kg)).toBe('12, 10 reps')
    expect(setsCompact('time', [set(null, 60), set(null, 45)], kg)).toBe('60s, 45s')
  })
})

describe('progression (linear)', () => {
  it('suggests one step up once every set hits the target at one weight', () => {
    const p = progression('weight', 8, [set(60, 8), set(60, 8), set(60, 9)], 2.5)
    expect(p).toMatchObject({ hit: 3, total: 3, all: true, weight: 60, next: 62.5 })
  })

  it('stays put while any set falls short', () => {
    const p = progression('weight', 8, [set(60, 8), set(60, 7), set(60, 6)], 2.5)
    expect(p).toMatchObject({ hit: 1, all: false, weight: 60 })
    expect(p.next).toBeUndefined()
  })

  it('makes no weight suggestion when sets used different weights or no weight', () => {
    expect(progression('weight', 5, [set(60, 5), set(65, 5)], 2.5).next).toBeUndefined()
    expect(progression('reps', 10, [set(null, 10), set(null, 12)], 2.5)).toMatchObject({ all: true, next: undefined })
  })
})

describe('targets carry forward', () => {
  it('lastSession reports the target used last time', () => {
    const w = workout('prev', '2026-10-08', 1000, [set(60, 8)])
    w.entries[0].targetReps = 8
    const today = workout('today', '2026-10-15', 3000, [])
    expect(lastSession(dbWith(w, today), 'ex-bench-press', today)?.targetReps).toBe(8)
  })
})
