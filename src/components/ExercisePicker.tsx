import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Field, Seg, Sheet } from './ui'
import { live, put, useDB } from '../lib/store'
import { MUSCLES } from '../lib/defaults'
import { setsCompact, shortDate, uid, units } from '../lib/format'
import { doneSets, sortedWorkouts } from '../lib/stats'
import type { Exercise, ExerciseKind, WorkoutSet } from '../lib/types'

export const KIND_LABEL: Record<ExerciseKind, string> = { weight: 'Weight × reps', reps: 'Bodyweight reps', time: 'Timed' }

export function ExercisePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (ex: Exercise) => void
}) {
  const db = useDB()
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<string>('All')
  const [creating, setCreating] = useState(false)

  const all = useMemo(() => live(db, 'exercises').sort((a, b) => a.name.localeCompare(b.name)), [db.exercises])
  // Most-used first, so your regular lifts are a tap away; remember each one's last finished session.
  const { usage, lastBy } = useMemo(() => {
    const usage = new Map<string, number>()
    const lastBy = new Map<string, { date: string; sets: WorkoutSet[] }>()
    for (const w of sortedWorkouts(db)) {
      for (const e of w.entries) {
        usage.set(e.exerciseId, (usage.get(e.exerciseId) ?? 0) + 1)
        if (!w.finishedAt || lastBy.has(e.exerciseId)) continue
        const sets = w.entries.filter((x) => x.exerciseId === e.exerciseId).flatMap((x) => doneSets(x.sets))
        if (sets.length) lastBy.set(e.exerciseId, { date: w.date, sets })
      }
    }
    return { usage, lastBy }
  }, [db.workouts])
  const u = units(db.settings)

  const shown = all
    .filter((e) => muscle === 'All' || e.muscle === muscle)
    .filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (q ? 0 : (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0)))

  const close = () => {
    setQ('')
    setCreating(false)
    onClose()
  }

  return (
    <Sheet open={open} onClose={close} title={creating ? 'New exercise' : 'Add exercise'} accent="var(--lift)">
      {creating ? (
        <ExerciseForm
          initialName={q}
          onSave={(ex) => {
            onPick(ex)
            close()
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <>
          <div className="input-suffix" style={{ marginBottom: 10 }}>
            <input
              className="input"
              placeholder="Search exercises"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus={matchMedia('(pointer: fine)').matches}
            />
            <em>
              <Search size={16} />
            </em>
          </div>
          <div className="chips chips-scroll" style={{ marginBottom: 6, paddingBottom: 6 }}>
            {['All', ...MUSCLES].map((m) => (
              <button key={m} className="chip" aria-pressed={muscle === m} onClick={() => setMuscle(m)}>
                {m}
              </button>
            ))}
          </div>
          <div className="list">
            {shown.map((e) => (
              <button
                key={e.id}
                className="list-item"
                onClick={() => {
                  onPick(e)
                  close()
                }}
              >
                <div className="grow">
                  <div className="title">{e.name}</div>
                  <div className="sub">
                    {e.muscle}
                    {e.kind !== 'weight' && ` · ${KIND_LABEL[e.kind]}`}
                    {usage.get(e.id) ? ` · ${usage.get(e.id)}×` : ''}
                  </div>
                  {lastBy.has(e.id) && (
                    <div className="sub ellipsis">
                      Last {shortDate(lastBy.get(e.id)!.date)}: {setsCompact(e.kind, lastBy.get(e.id)!.sets, u)}
                    </div>
                  )}
                </div>
                <Plus size={18} className="muted" />
              </button>
            ))}
          </div>
          <button className="btn btn-block" style={{ marginTop: 12 }} onClick={() => setCreating(true)}>
            <Plus size={18} /> Create {q ? `“${q}”` : 'a new exercise'}
          </button>
        </>
      )}
    </Sheet>
  )
}

export function ExerciseForm({
  existing,
  initialName = '',
  onSave,
  onCancel,
}: {
  existing?: Exercise
  initialName?: string
  onSave: (ex: Exercise) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(existing?.name ?? initialName)
  const [muscle, setMuscle] = useState(existing?.muscle ?? 'Other')
  const [kind, setKind] = useState<ExerciseKind>(existing?.kind ?? 'weight')
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        onSave(put('exercises', { ...(existing ?? { id: uid() }), name: name.trim(), muscle, kind }))
      }}
    >
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </Field>
      <Field label="Muscle group">
        <select className="input" value={muscle} onChange={(e) => setMuscle(e.target.value)}>
          {MUSCLES.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </Field>
      <div className="field">
        <span>Tracked as</span>
        <Seg
          label="Tracked as"
          value={kind}
          onChange={setKind}
          options={(Object.keys(KIND_LABEL) as ExerciseKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        />
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button type="button" className="btn grow" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-accent grow">
          Save exercise
        </button>
      </div>
    </form>
  )
}
