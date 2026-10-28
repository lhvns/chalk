import { useMemo, useState } from 'react'
import { ChevronRight, Dumbbell, History, ListChecks, Play, Plus, Trash2, Trophy } from 'lucide-react'
import { ConfirmButton, Empty, Field, NumberInput, Seg, Sheet, accent } from '../components/ui'
import { ExercisePicker } from '../components/ExercisePicker'
import { getDB, live, put, remove, useDB } from '../lib/store'
import { navigate } from '../lib/router'
import { dayLabel, duration, int, num, plural, todayKey, uid, units } from '../lib/format'
import { exerciseSessions, sortedWorkouts, workoutMinutes, workoutSetCount, workoutVolume } from '../lib/stats'
import type { Routine, Workout } from '../lib/types'

export const activeWorkout = (db = getDB()) => live(db, 'workouts').find((w) => !w.finishedAt)

function defaultName() {
  const h = new Date().getHours()
  return h < 11 ? 'Morning lift' : h < 16 ? 'Midday lift' : 'Evening lift'
}

/** Starts (or resumes) a workout, optionally pre-filled from a routine or a past session. */
export function startWorkout(from?: Routine | Workout) {
  const db = getDB()
  const running = activeWorkout(db)
  if (running) return navigate(`/lift/w/${running.id}`)

  const now = Date.now()
  const draft: Workout = { id: uid(), updatedAt: now, date: todayKey(), name: defaultName(), startedAt: now, entries: [] }
  // Sets start empty: last session's numbers show as placeholders, and
  // checking a set off accepts them — so "same as last time" is one tap.
  const blank = (n: number) => Array.from({ length: Math.max(1, n) }, () => ({ id: uid(), reps: null, weight: null, done: false }))
  if (from) {
    draft.name = from.name
    draft.entries =
      'items' in from
        ? from.items.map((it) => ({ id: uid(), exerciseId: it.exerciseId, sets: blank(it.sets), targetReps: it.reps }))
        : from.entries.map((e) => ({
            id: uid(),
            exerciseId: e.exerciseId,
            sets: blank(e.sets.filter((s) => s.done).length),
            targetReps: e.targetReps,
          }))
  }
  put('workouts', draft)
  navigate(`/lift/w/${draft.id}`)
}

export default function Lift() {
  const db = useDB()
  const [view, setView] = useState<'history' | 'routines' | 'exercises'>('history')
  const running = activeWorkout(db)

  return (
    <div className="rise" style={accent('lift')}>
      {running ? (
        <a className="live-banner" href={`#/lift/w/${running.id}`}>
          <Play size={20} />
          <span className="grow">
            {running.name} in progress · {duration((Date.now() - running.startedAt) / 60000)}
          </span>
          <ChevronRight size={20} />
        </a>
      ) : (
        <button className="btn btn-accent btn-block" style={{ minHeight: 54, fontSize: '1.05rem' }} onClick={() => startWorkout()}>
          <Plus size={20} /> Start empty workout
        </button>
      )}

      <div style={{ marginTop: 16 }}>
        <Seg
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'history', label: 'History' },
            { value: 'routines', label: 'Routines' },
            { value: 'exercises', label: 'Exercises' },
          ]}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        {view === 'history' && <WorkoutHistory />}
        {view === 'routines' && <Routines />}
        {view === 'exercises' && <ExerciseList />}
      </div>
    </div>
  )
}

function WorkoutHistory() {
  const db = useDB()
  const u = units(db.settings)
  const workouts = useMemo(() => sortedWorkouts(db).filter((w) => w.finishedAt), [db.workouts])
  if (!workouts.length)
    return (
      <div className="card">
        <Empty icon={<History size={32} />}>
          No workouts yet. Start one above — sets you check off are saved as you go.
        </Empty>
      </div>
    )
  return (
    <div className="card" style={{ padding: '4px 16px' }}>
      <div className="list">
        {workouts.slice(0, 200).map((w) => {
          const names = w.entries
            .map((e) => db.exercises[e.exerciseId]?.name)
            .filter(Boolean)
            .slice(0, 3)
          return (
            <a key={w.id} className="list-item" href={`#/lift/w/${w.id}`}>
              <span className="puck">
                <Dumbbell size={18} />
              </span>
              <div className="grow">
                <div className="title">{w.name}</div>
                <div className="sub">
                  {dayLabel(w.date)} · {duration(workoutMinutes(w))} · {plural(workoutSetCount(w), 'set')}
                  {workoutVolume(w) > 0 && ` · ${int(u.wOut(workoutVolume(w)))} ${u.w}`}
                </div>
                {names.length > 0 && (
                  <div className="sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {names.join(', ')}
                    {w.entries.length > 3 && ` +${w.entries.length - 3}`}
                  </div>
                )}
              </div>
              <ChevronRight size={18} className="muted" />
            </a>
          )
        })}
      </div>
    </div>
  )
}

function Routines() {
  const db = useDB()
  const routines = live(db, 'routines').sort((a, b) => a.name.localeCompare(b.name))
  const [editing, setEditing] = useState<Routine | null>(null)
  const [open, setOpen] = useState(false)

  return (
    <>
      {routines.length === 0 ? (
        <div className="card">
          <Empty icon={<ListChecks size={32} />}>
            Routines are reusable workout plans — e.g. “Push day”. Build one here, or save any finished workout as a routine.
          </Empty>
        </div>
      ) : (
        <div className="grid grid-2">
          {routines.map((r) => (
            <div key={r.id} className="card">
              <div className="card-head">
                <h3>{r.name}</h3>
                <button className="btn btn-sm btn-ghost" onClick={() => (setEditing(r), setOpen(true))}>
                  Edit
                </button>
              </div>
              <div className="small ink-2" style={{ marginBottom: 12 }}>
                {r.items.map((it) => `${db.exercises[it.exerciseId]?.name ?? '?'} ${it.reps ? `${it.sets}×${it.reps}` : `×${it.sets}`}`).join(' · ') || 'No exercises'}
              </div>
              <button className="btn btn-accent btn-block" onClick={() => startWorkout(r)}>
                <Play size={18} /> Start
              </button>
            </div>
          ))}
        </div>
      )}
      <button className="btn btn-block" style={{ marginTop: 12 }} onClick={() => (setEditing(null), setOpen(true))}>
        <Plus size={18} /> New routine
      </button>
      <RoutineSheet open={open} routine={editing} onClose={() => setOpen(false)} />
    </>
  )
}

export function RoutineSheet({ open, routine, onClose }: { open: boolean; routine: Routine | null; onClose: () => void }) {
  const db = useDB()
  const [draft, setDraft] = useState<Routine | null>(null)
  const [picking, setPicking] = useState(false)
  const r = draft ?? routine ?? { id: '', updatedAt: 0, name: '', items: [] }

  const close = () => {
    setDraft(null)
    onClose()
  }
  const edit = (patch: Partial<Routine>) => setDraft({ ...r, ...patch })

  return (
    <Sheet
      open={open}
      onClose={close}
      title={routine ? 'Edit routine' : 'New routine'}
      accent="var(--lift)"
      footer={
        <>
          {routine && (
            <ConfirmButton
              onConfirm={() => {
                remove('routines', routine.id)
                close()
              }}
            >
              <Trash2 size={18} /> Delete
            </ConfirmButton>
          )}
          <button
            className="btn btn-accent"
            disabled={!r.name.trim() || !r.items.length}
            onClick={() => {
              put('routines', { ...r, id: r.id || uid(), name: r.name.trim() })
              close()
            }}
          >
            Save routine
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Name">
          <input className="input" value={r.name} placeholder="e.g. Push day" onChange={(e) => edit({ name: e.target.value })} />
        </Field>
        <div className="list">
          {r.items.map((it, i) => {
            const ex = db.exercises[it.exerciseId]
            const setItem = (patch: Partial<Routine['items'][number]>) =>
              edit({ items: r.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
            return (
              <div key={i} className="routine-item">
                <div className="title">{ex?.name ?? 'Unknown'}</div>
                <div className="row">
                  <div style={{ width: 96 }}>
                    <NumberInput
                      value={it.sets}
                      decimals={false}
                      suffix="sets"
                      label="Sets"
                      onChange={(v) => setItem({ sets: Math.max(1, Math.min(20, v ?? 1)) })}
                    />
                  </div>
                  <span className="muted">×</span>
                  <div style={{ width: 104 }}>
                    <NumberInput
                      value={it.reps ?? null}
                      decimals={false}
                      placeholder="–"
                      suffix={ex?.kind === 'time' ? 'sec' : 'reps'}
                      label={ex?.kind === 'time' ? 'Target seconds' : 'Target reps'}
                      onChange={(v) => setItem({ reps: v && v > 0 ? Math.min(999, Math.round(v)) : undefined })}
                    />
                  </div>
                  <span className="grow" />
                  <button className="icon-btn" aria-label="Remove" onClick={() => edit({ items: r.items.filter((_, j) => j !== i) })}>
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        {r.items.length > 0 && (
          <p className="small muted" style={{ margin: 0 }}>
            Target reps are optional. Hit them on every set and Chalk will suggest adding weight next time.
          </p>
        )}
        <button className="btn btn-block" onClick={() => setPicking(true)}>
          <Plus size={18} /> Add exercise
        </button>
      </div>
      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(ex) => edit({ items: [...r.items, { exerciseId: ex.id, sets: 3 }] })}
      />
    </Sheet>
  )
}

function ExerciseList() {
  const db = useDB()
  const u = units(db.settings)
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    return live(db, 'exercises')
      .map((ex) => {
        const sessions = exerciseSessions(db, ex.id, ex)
        const best = Math.max(0, ...sessions.map((s) => s.best))
        return { ex, sessions: sessions.length, best, last: sessions[sessions.length - 1]?.date }
      })
      .sort((a, b) => (b.last ?? '').localeCompare(a.last ?? '') || a.ex.name.localeCompare(b.ex.name))
  }, [db.exercises, db.workouts])

  const shown = rows.filter((r) => !q || r.ex.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="card" style={{ padding: '12px 16px 4px' }}>
      <input className="input" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="list" style={{ marginTop: 6 }}>
        {shown.map(({ ex, sessions, best, last }) => (
          <a key={ex.id} className="list-item" href={`#/lift/x/${ex.id}`}>
            <div className="grow">
              <div className="title">{ex.name}</div>
              <div className="sub">
                {ex.muscle}
                {sessions > 0 && ` · ${sessions} session${sessions === 1 ? '' : 's'} · last ${dayLabel(last!)}`}
              </div>
            </div>
            {best > 0 && (
              <span className="small ink-2 tabular" title={ex.kind === 'weight' ? 'Best estimated 1-rep max' : 'Best set'}>
                <Trophy size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                {ex.kind === 'weight' ? `${num(u.wOut(best), 0)} ${u.w}` : `${best}${ex.kind === 'time' ? 's' : ' reps'}`}
              </span>
            )}
            <ChevronRight size={18} className="muted" />
          </a>
        ))}
      </div>
    </div>
  )
}
