import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronRight, Copy, Equal, Flag, ListPlus, Minus, Plus, Target, Trash2, Trophy } from 'lucide-react'
import { ConfirmButton, Empty, Field, NumberInput, accent } from '../components/ui'
import { ExercisePicker } from '../components/ExercisePicker'
import { put, remove, useDB } from '../lib/store'
import { navigate } from '../lib/router'
import { clockTime, dayLabel, daysBetween, duration, int, num, plural, setText, stopwatch, todayKey, uid, units } from '../lib/format'
import { bestE1rm, compareSet, doneSets, e1rm, lastSession, progression, setTotals, workoutMinutes, workoutSetCount, workoutVolume, type LastSession, type Trend } from '../lib/stats'
import { startRest } from '../lib/timer'
import { startWorkout } from './Lift'
import type { DB, Exercise, ExerciseKind, Workout, WorkoutEntry, WorkoutSet } from '../lib/types'

export default function WorkoutEditor({ id }: { id: string }) {
  const db = useDB()
  const w = db.workouts[id]
  const [picking, setPicking] = useState(false)

  if (!w || w.deleted)
    return (
      <div className="card">
        <Empty>
          This workout was deleted. <a href="#/lift">Back to Lift</a>
        </Empty>
      </div>
    )

  const save = (next: Workout) => put('workouts', next)
  const setEntry = (entryId: string, fn: (e: WorkoutEntry) => WorkoutEntry | null) =>
    save({
      ...w,
      entries: w.entries.map((e) => (e.id === entryId ? fn(e) : e)).filter(Boolean) as WorkoutEntry[],
    })

  const active = !w.finishedAt

  const finish = () => {
    // Drop sets that were never filled in; keep anything with numbers.
    const entries = w.entries
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done || s.reps != null || s.weight != null) }))
      .filter((e) => e.sets.length)
      .map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, done: s.done || s.reps != null })) }))
    save({ ...w, entries, finishedAt: Date.now() })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="rise" style={accent('lift')}>
      <div className="card">
        <input
          className="input display"
          style={{ fontSize: '1.7rem', border: 0, background: 'transparent', padding: 0, minHeight: 0 }}
          value={w.name}
          aria-label="Workout name"
          onChange={(e) => save({ ...w, name: e.target.value })}
        />
        <div className="row-wrap small ink-2" style={{ marginTop: 6, alignItems: 'center' }}>
          <span>{dayLabel(w.date)}</span>
          <span>·</span>
          <span>started {clockTime(w.startedAt)}</span>
          <span>·</span>
          {active ? <Elapsed since={w.startedAt} /> : <span>{duration(workoutMinutes(w))}</span>}
        </div>
        {!active && <Summary w={w} />}
      </div>

      {w.entries.length === 0 && (
        <div className="card">
          <Empty icon={<ListPlus size={32} />}>Add your first exercise to start logging sets.</Empty>
        </div>
      )}

      {w.entries.map((entry) => (
        <EntryCard key={entry.id} db={db} workout={w} entry={entry} onChange={(fn) => setEntry(entry.id, fn)} />
      ))}

      <button className="btn btn-block" style={{ marginTop: 12, minHeight: 50 }} onClick={() => setPicking(true)}>
        <Plus size={18} /> Add exercise
      </button>

      <div className="card" style={{ marginTop: 12 }}>
        <Field label="Notes">
          <textarea
            className="input"
            value={w.notes ?? ''}
            placeholder="How did it feel?"
            onChange={(e) => save({ ...w, notes: e.target.value })}
          />
        </Field>
      </div>

      <div className="stack" style={{ marginTop: 16 }}>
        {active ? (
          <button className="btn btn-accent btn-block" style={{ minHeight: 54 }} onClick={finish}>
            <Flag size={18} /> Finish workout
          </button>
        ) : (
          <div className="row">
            <button className="btn grow" onClick={() => startWorkout(w)}>
              <Copy size={18} /> Repeat
            </button>
            <button
              className="btn grow"
              onClick={() => {
                put('routines', {
                  id: uid(),
                  name: w.name,
                  items: w.entries.map((e) => ({ exerciseId: e.exerciseId, sets: Math.max(1, e.sets.length), reps: e.targetReps })),
                })
                navigate('/lift')
              }}
            >
              <ListPlus size={18} /> Save as routine
            </button>
          </div>
        )}
        <ConfirmButton
          className="btn btn-danger btn-block"
          onConfirm={() => {
            remove('workouts', w.id)
            navigate('/lift', { replace: true })
          }}
        >
          <Trash2 size={18} /> {active ? 'Discard workout' : 'Delete workout'}
        </ConfirmButton>
      </div>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(ex) => {
          const last = lastSession(db, ex.id, w)
          const count = Math.max(1, Math.min(last?.sets.length || 3, 6))
          save({
            ...w,
            entries: [
              ...w.entries,
              {
                id: uid(),
                exerciseId: ex.id,
                sets: Array.from({ length: count }, () => ({ id: uid(), reps: null, weight: null, done: false })),
                targetReps: last?.targetReps,
              },
            ],
          })
        }}
      />
    </div>
  )
}

function Elapsed({ since }: { since: number }) {
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="tabular" style={{ color: 'var(--ink)', fontWeight: 700 }}>{stopwatch((Date.now() - since) / 1000)}</span>
}

function Summary({ w }: { w: Workout }) {
  const db = useDB()
  const u = units(db.settings)
  return (
    <div className="stats stats-4" style={{ marginTop: 16 }}>
      <div className="stat">
        <span className="eyebrow">Duration</span>
        <span className="value">{duration(workoutMinutes(w))}</span>
      </div>
      <div className="stat">
        <span className="eyebrow">Exercises</span>
        <span className="value">{w.entries.length}</span>
      </div>
      <div className="stat">
        <span className="eyebrow">Sets</span>
        <span className="value">{workoutSetCount(w)}</span>
      </div>
      <div className="stat">
        <span className="eyebrow">Volume</span>
        <span className="value">
          {int(u.wOut(workoutVolume(w)))}
          <small>{u.w}</small>
        </span>
      </div>
    </div>
  )
}

function EntryCard({
  db,
  workout,
  entry,
  onChange,
}: {
  db: DB
  workout: Workout
  entry: WorkoutEntry
  onChange: (fn: (e: WorkoutEntry) => WorkoutEntry | null) => void
}) {
  const ex: Exercise | undefined = db.exercises[entry.exerciseId]
  const kind = ex?.kind ?? 'weight'
  const u = units(db.settings)
  const last = useMemo(() => lastSession(db, entry.exerciseId, workout), [db.workouts, entry.exerciseId, workout.id])
  const prev = last?.sets ?? []
  const target = entry.targetReps
  const stepKg = u.wIn(u.w === 'lb' ? 5 : 2.5)
  const prog = target && last ? progression(kind, target, last.sets, stepKg) : null
  const priorBest = useMemo(() => bestE1rm(db, entry.exerciseId, workout.id), [db.workouts, entry.exerciseId, workout.id])

  // A set is a PR when it beats every other session's best and is the top set in this one.
  const prSetId = useMemo(() => {
    if (kind !== 'weight' || priorBest <= 0) return null
    let top: WorkoutSet | null = null
    for (const s of doneSets(entry.sets)) if (!top || e1rm(s.weight ?? 0, s.reps ?? 0) > e1rm(top.weight ?? 0, top.reps ?? 0)) top = s
    return top && e1rm(top.weight ?? 0, top.reps ?? 0) > priorBest + 1e-6 ? top.id : null
  }, [entry.sets, priorBest, kind])

  const setSet = (i: number, patch: Partial<WorkoutSet>) =>
    onChange((e) => ({ ...e, sets: e.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))

  const showWeight = kind !== 'time'
  const prevLabel = (s?: WorkoutSet) => (s ? setText(kind, s, u).replace(' × ', '×').replace(' reps', '') : '–')

  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <a href={`#/lift/x/${entry.exerciseId}`} style={{ textDecoration: 'none' }}>
            {ex?.name ?? 'Unknown exercise'} <ChevronRight size={16} style={{ verticalAlign: -3 }} className="muted" />
          </a>
        </h3>
        <TargetButton kind={kind} value={target} onChange={(v) => onChange((e) => ({ ...e, targetReps: v }))} />
        <ConfirmButton className="btn btn-sm btn-ghost btn-danger" confirmLabel="Remove?" onConfirm={() => onChange(() => null)}>
          <Trash2 size={16} />
        </ConfirmButton>
      </div>

      <LastTime kind={kind} last={last} today={doneSets(entry.sets)} target={target} stepKg={stepKg} u={u} />

      <div className={`set-grid ${showWeight ? '' : 'no-weight'}`}>
        <span className="h">Set</span>
        <span className="h">Previous</span>
        {showWeight && <span className="h">{kind === 'reps' ? `+${u.w}` : u.w}</span>}
        <span className="h">{kind === 'time' ? 'Sec' : 'Reps'}</span>
        <span className="h" aria-label="Done">
          <Check size={14} />
        </span>

        {entry.sets.map((s, i) => {
          const p = prev[i]
          // Extra sets beyond last time's suggest repeating the last set.
          const ph = p ?? prev[prev.length - 1]
          return (
            <div
              key={s.id}
              className={`${s.done ? 'set-row-done' : ''} ${s.done && target && (s.reps ?? 0) < target ? 'set-row-short' : ''}`}
              style={{ display: 'contents' }}
            >
              <span className="n" aria-label={`Set ${i + 1}`}>
                {s.id === prSetId ? <Trophy size={14} color="var(--body)" /> : i + 1}
              </span>
              <button
                className="prev"
                title="Copy previous"
                onClick={() => p && setSet(i, { reps: p.reps, weight: p.weight })}
                disabled={!p}
              >
                <span className="prev-text">{prevLabel(p)}</span>
                {s.done && p && (s.reps ?? 0) > 0 && <TrendMark t={compareSet(kind, s, p)} />}
              </button>
              {showWeight && (
                <NumberInput
                  value={s.weight != null ? u.wOut(s.weight) : null}
                  precision={1}
                  placeholder={prog?.next != null ? num(u.wOut(prog.next)) : ph?.weight != null ? num(u.wOut(ph.weight)) : kind === 'reps' ? '0' : ''}
                  label={`Set ${i + 1} weight`}
                  onChange={(v) => setSet(i, { weight: v == null ? null : u.wIn(v) })}
                />
              )}
              <NumberInput
                value={s.reps}
                className="input reps-input"
                decimals={false}
                placeholder={target ? String(target) : ph?.reps != null ? String(ph.reps) : ''}
                label={`Set ${i + 1} ${kind === 'time' ? 'seconds' : 'reps'}`}
                onChange={(v) => setSet(i, { reps: v == null ? null : Math.round(v) })}
              />
              <button
                className="set-check"
                aria-pressed={s.done}
                aria-label={s.done ? `Set ${i + 1} done` : `Mark set ${i + 1} done`}
                onClick={() => {
                  if (s.done) return setSet(i, { done: false })
                  // Checking an empty row accepts the placeholder (last time's numbers).
                  const reps = s.reps ?? target ?? ph?.reps ?? null
                  if (reps == null) return
                  setSet(i, { done: true, reps, weight: s.weight ?? prog?.next ?? ph?.weight ?? null })
                  startRest(db.settings.restSeconds)
                }}
              >
                <Check size={20} />
              </button>
            </div>
          )
        })}
      </div>

      {prSetId && (
        <div className="row small" style={{ marginTop: 10 }}>
          <span className="badge badge-pr">
            <Trophy size={12} /> New PR
          </span>
          <span className="ink-2">Estimated 1RM above your previous best of {num(u.wOut(priorBest), 0)} {u.w}</span>
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="btn btn-sm grow"
          onClick={() =>
            onChange((e) => {
              const last = e.sets[e.sets.length - 1]
              return { ...e, sets: [...e.sets, { id: uid(), reps: last?.reps ?? null, weight: last?.weight ?? null, done: false }] }
            })
          }
        >
          <Plus size={16} /> Add set
        </button>
        <button
          className="btn btn-sm"
          disabled={entry.sets.length <= 1}
          onClick={() => onChange((e) => ({ ...e, sets: e.sets.slice(0, -1) }))}
          aria-label="Remove last set"
        >
          <Minus size={16} />
        </button>
      </div>
    </div>
  )
}

const TREND: Record<Trend, { Icon: typeof ArrowUp; color: string; label: string }> = {
  up: { Icon: ArrowUp, color: 'var(--good-text)', label: 'More than last time' },
  down: { Icon: ArrowDown, color: 'var(--critical)', label: 'Less than last time' },
  same: { Icon: Equal, color: 'var(--muted)', label: 'Same as last time' },
}

/** Up / down / equal against last time. The shape carries the meaning; colour only reinforces it. */
function TrendMark({ t, size = 13 }: { t: Trend; size?: number }) {
  const { Icon, color, label } = TREND[t]
  return (
    <span className="trend" style={{ color }} title={label} aria-label={label} role="img">
      <Icon size={size} strokeWidth={2.75} />
    </span>
  )
}

/**
 * Last session of this exercise — every set, plus totals — and, once sets are
 * checked off today, how the work so far compares with the same sets then.
 */
function LastTime({
  kind,
  last,
  today,
  target,
  stepKg,
  u,
}: {
  kind: ExerciseKind
  last: LastSession | null
  today: WorkoutSet[]
  target?: number
  stepKg: number
  u: ReturnType<typeof units>
}) {
  if (!last)
    return (
      <div className="last-time small">
        <span className="muted">First time logging this one — today sets the baseline.</span>
        {target && <TargetStatus kind={kind} target={target} today={today} />}
      </div>
    )

  const t = setTotals(last.sets)
  const ago = daysBetween(last.date, todayKey())
  const n = today.length
  const ref = last.sets.slice(0, n)

  // Weighted lifts compare volume (weight × reps); bodyweight and timed ones compare reps or seconds.
  const byVolume = kind === 'weight' && setTotals(ref).volume > 0
  const now = byVolume ? setTotals(today).volume : setTotals(today).reps
  const then = byVolume ? setTotals(ref).volume : setTotals(ref).reps
  const diff = now - then
  const trend: Trend = Math.abs(diff) < (byVolume ? 0.01 : 0.5) ? 'same' : diff > 0 ? 'up' : 'down'
  const amount = (v: number) =>
    byVolume ? `${int(u.wOut(v))} ${u.w}` : kind === 'time' ? `${int(v)}s` : plural(Math.round(v), 'rep')
  const pct = byVolume && then > 0 ? ` (${diff > 0 ? '+' : '−'}${num((Math.abs(diff) / then) * 100)}%)` : ''

  return (
    <div className="last-time">
      <div className="spread">
        <span className="eyebrow">Last time</span>
        <a className="small ink-2" href={`#/lift/w/${last.workout.id}`}>
          {dayLabel(last.date)}
          {ago > 1 ? ` · ${ago} days ago` : ''}
        </a>
      </div>
      <div className="last-sets">
        {last.sets.map((s, i) => (
          <span key={s.id} className="last-set">
            <em>{i + 1}</em>
            {setText(kind, s, u)}
          </span>
        ))}
      </div>
      <div className="small muted">
        {plural(t.sets, 'set')} · {kind === 'time' ? `${int(t.reps)}s total` : plural(t.reps, 'rep')}
        {kind === 'weight' && t.volume > 0 && ` · ${int(u.wOut(t.volume))} ${u.w} volume`}
      </div>
      {target && <ProgressHint kind={kind} target={target} p={progression(kind, target, last.sets, stepKg)} u={u} />}
      {n > 0 && (
        <div className="vs">
          <TrendMark t={trend} size={15} />
          <span>
            <strong>{n < last.sets.length ? `Through ${plural(n, 'set')}` : 'Today'}:</strong> {amount(now)} vs {amount(then)}
            {trend === 'same' ? (
              <span className="muted"> — matched</span>
            ) : (
              <span style={{ color: TREND[trend].color, fontWeight: 700 }}>
                {' '}
                {diff > 0 ? '+' : '−'}
                {amount(Math.abs(diff))}
                {pct}
              </span>
            )}
          </span>
        </div>
      )}
      {target && n > 0 && <TargetStatus kind={kind} target={target} today={today} />}
    </div>
  )
}

const unitWord = (kind: ExerciseKind, n: number) => (kind === 'time' ? `${n}s` : plural(n, 'rep'))

/** "Target 8 reps · 2 of 3 sets hit". */
function TargetStatus({ kind, target, today }: { kind: ExerciseKind; target: number; today: WorkoutSet[] }) {
  if (!today.length) return null
  const hit = today.filter((s) => (s.reps ?? 0) >= target).length
  const all = hit === today.length
  return (
    <div className="vs">
      <Target size={15} style={{ color: all ? 'var(--good-text)' : 'var(--muted)', flex: 'none' }} aria-hidden />
      <span>
        <strong>Target {unitWord(kind, target)}:</strong> {hit} of {plural(today.length, 'set')} hit
      </span>
    </div>
  )
}

/**
 * Linear progression: every set at the target last time → add weight today;
 * otherwise stay at the same weight until every set gets there.
 */
function ProgressHint({ kind, target, p, u }: { kind: ExerciseKind; target: number; p: ReturnType<typeof progression>; u: ReturnType<typeof units> }) {
  const goal = unitWord(kind, target)
  let text: string
  if (p.all)
    text = p.next != null ? `Hit ${goal} on every set last time — try ${num(u.wOut(p.next))} ${u.w} today.` : `Hit ${goal} on every set last time — time to make it harder.`
  else
    text =
      p.weight != null
        ? `${p.hit} of ${plural(p.total, 'set')} hit ${goal} last time — stay at ${num(u.wOut(p.weight))} ${u.w} until they all do.`
        : `${p.hit} of ${plural(p.total, 'set')} hit ${goal} last time.`
  return (
    <div className={`hint ${p.all ? 'ready' : ''}`}>
      <Target size={15} aria-hidden style={{ flex: 'none' }} />
      <span>{text}</span>
    </div>
  )
}

/** Small control in the exercise header to set or change the target reps. */
function TargetButton({ kind, value, onChange }: { kind: ExerciseKind; value?: number; onChange: (v?: number) => void }) {
  const [editing, setEditing] = useState(false)
  if (editing)
    return (
      <div className="row" style={{ gap: 6 }}>
        <div style={{ width: 100 }}>
          <NumberInput
            value={value ?? null}
            decimals={false}
            autoFocus
            suffix={kind === 'time' ? 'sec' : 'reps'}
            label={kind === 'time' ? 'Target seconds' : 'Target reps'}
            onChange={(v) => onChange(v && v > 0 ? Math.min(999, Math.round(v)) : undefined)}
          />
        </div>
        <button className="icon-btn" aria-label="Done" onClick={() => setEditing(false)}>
          <Check size={18} />
        </button>
      </div>
    )
  return (
    <button className={`btn btn-sm ${value ? '' : 'btn-ghost'}`} onClick={() => setEditing(true)} aria-label={value ? `Target ${value}, change` : 'Set a target'}>
      <Target size={15} />
      {value ? unitWord(kind, value) : 'Target'}
    </button>
  )
}
