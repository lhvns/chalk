import { describe, expect, it } from 'vitest'
import { merge, normalize, sameDB } from './merge'
import { emptyDB } from './defaults'
import { e1rm, trend } from './stats'
import type { Cardio, DB } from './types'

const cardio = (id: string, updatedAt: number, extra: Partial<Cardio> = {}): Cardio => ({
  id,
  updatedAt,
  date: '2026-10-01',
  type: 'run',
  durationMin: 30,
  ...extra,
})

const withCardio = (...rows: Cardio[]): DB => {
  const db = emptyDB()
  for (const r of rows) db.cardio[r.id] = r
  return db
}

describe('merge', () => {
  it('keeps records that only exist on one side', () => {
    const m = merge(withCardio(cardio('a', 1)), withCardio(cardio('b', 1)))
    expect(Object.keys(m.cardio).sort()).toEqual(['a', 'b'])
  })

  it('keeps the newer edit of the same record', () => {
    const m = merge(withCardio(cardio('a', 5, { durationMin: 50 })), withCardio(cardio('a', 9, { durationMin: 90 })))
    expect(m.cardio.a.durationMin).toBe(90)
  })

  it('lets a newer delete win over an older edit', () => {
    const m = merge(withCardio(cardio('a', 5)), withCardio(cardio('a', 6, { deleted: true })))
    expect(m.cardio.a.deleted).toBe(true)
  })

  it('is commutative, even on timestamp ties', () => {
    const a = withCardio(cardio('a', 7, { durationMin: 10 }), cardio('b', 1))
    const b = withCardio(cardio('a', 7, { durationMin: 20 }), cardio('c', 2))
    expect(merge(a, b)).toEqual(merge(b, a))
  })

  it('is idempotent', () => {
    const a = withCardio(cardio('a', 3))
    const once = merge(a, a)
    expect(merge(once, a)).toEqual(once)
    expect(sameDB(once, a)).toBe(true)
  })

  it('merges settings last-writer-wins', () => {
    const a = emptyDB()
    const b = emptyDB()
    a.settings = { ...a.settings, calorieGoal: 1800, updatedAt: 10 }
    b.settings = { ...b.settings, calorieGoal: 2500, updatedAt: 20 }
    expect(merge(a, b).settings.calorieGoal).toBe(2500)
  })

  it('never duplicates the built-in exercises across devices', () => {
    const m = merge(emptyDB(), emptyDB())
    expect(Object.keys(m.exercises).length).toBe(Object.keys(emptyDB().exercises).length)
  })

  it('normalizes partial or missing data', () => {
    expect(normalize(undefined).schema).toBe(1)
    const n = normalize({ cardio: { a: cardio('a', 1) } } as Partial<DB>)
    expect(n.cardio.a.durationMin).toBe(30)
    expect(n.settings.calorieGoal).toBeGreaterThan(0)
    expect(Object.keys(n.exercises).length).toBeGreaterThan(10)
  })
})

describe('stats', () => {
  it('estimates 1RM with Epley', () => {
    expect(e1rm(100, 1)).toBe(100)
    expect(e1rm(100, 10)).toBeCloseTo(133.33, 1)
    expect(e1rm(0, 5)).toBe(0)
  })

  it('averages weigh-ins over a trailing 7-day window', () => {
    const t = trend([
      { date: '2026-10-01', value: 80 },
      { date: '2026-10-03', value: 82 },
      { date: '2026-10-09', value: 78 },
    ])
    expect(t.map((p) => p.value)).toEqual([80, 81, 80])
  })
})
