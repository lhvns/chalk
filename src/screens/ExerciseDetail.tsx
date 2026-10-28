import { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { ChartFrame, DataTable, LineChart } from '../components/charts'
import { ExerciseForm, KIND_LABEL } from '../components/ExercisePicker'
import { ConfirmButton, Empty, Sheet, accent } from '../components/ui'
import { remove, useDB } from '../lib/store'
import { navigate } from '../lib/router'
import { dayLabel, int, num, setText, shortDate, units } from '../lib/format'
import { exerciseSessions } from '../lib/stats'

export default function ExerciseDetail({ id }: { id: string }) {
  const db = useDB()
  const ex = db.exercises[id]
  const u = units(db.settings)
  const [editing, setEditing] = useState(false)
  const sessions = useMemo(() => (ex ? exerciseSessions(db, id, ex) : []), [db.workouts, ex, id])

  if (!ex || ex.deleted)
    return (
      <div className="card">
        <Empty>
          Exercise not found. <a href="#/lift">Back to Lift</a>
        </Empty>
      </div>
    )

  const weighted = ex.kind === 'weight'
  const metric = (v: number) => (weighted ? num(u.wOut(v), 0) : String(Math.round(v)))
  const metricUnit = weighted ? u.w : ex.kind === 'time' ? 's' : 'reps'
  const best = sessions.reduce((m, s) => (s.best > m.best ? s : m), sessions[0])
  const heaviest = Math.max(0, ...sessions.flatMap((s) => s.sets.map((x) => x.weight ?? 0)))

  return (
    <div className="rise" style={accent('lift')}>
      <div className="card">
        <div className="card-head">
          <h2 className="display" style={{ fontSize: '1.8rem' }}>
            {ex.name}
          </h2>
          <button className="icon-btn" aria-label="Edit exercise" onClick={() => setEditing(true)}>
            <Pencil size={18} />
          </button>
        </div>
        <div className="small ink-2">
          {ex.muscle} · {KIND_LABEL[ex.kind]}
        </div>
        <div className="stats stats-4" style={{ marginTop: 16 }}>
          <div className="stat">
            <span className="eyebrow">{weighted ? 'Best est. 1RM' : 'Best set'}</span>
            <span className="value">
              {best ? metric(best.best) : '–'}
              <small>{metricUnit}</small>
            </span>
          </div>
          {weighted && (
            <div className="stat">
              <span className="eyebrow">Heaviest</span>
              <span className="value">
                {heaviest ? num(u.wOut(heaviest)) : '–'}
                <small>{u.w}</small>
              </span>
            </div>
          )}
          <div className="stat">
            <span className="eyebrow">Sessions</span>
            <span className="value">{sessions.length}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">Last done</span>
            <span className="value" style={{ fontSize: '1.2rem' }}>
              {sessions.length ? dayLabel(sessions[sessions.length - 1].date) : '–'}
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>{weighted ? 'Estimated 1-rep max' : ex.kind === 'time' ? 'Longest hold' : 'Most reps'}</h3>
        </div>
        {sessions.length >= 2 ? (
          <ChartFrame
            table={
              <DataTable
                head={['Date', weighted ? `e1RM (${u.w})` : metricUnit, 'Top set']}
                rows={[...sessions].reverse().map((s) => [shortDate(s.date), metric(s.best), s.top ? setText(ex.kind, s.top, u) : '–'])}
              />
            }
          >
            <LineChart
              series={[{ name: weighted ? 'e1RM' : 'Best', color: 'var(--chart-lift)', points: sessions.map((s) => ({ date: s.date, value: weighted ? u.wOut(s.best) : s.best })) }]}
              format={(v) => num(v, 0)}
              unit={metricUnit}
            />
          </ChartFrame>
        ) : (
          <Empty>Log this exercise in two or more workouts to see your progress line.</Empty>
        )}
      </div>

      <div className="card" style={{ padding: '6px 16px' }}>
        {sessions.length === 0 ? (
          <Empty>No sets logged yet.</Empty>
        ) : (
          <div className="list">
            {[...sessions].reverse().map((s) => (
              <a key={s.workout.id} className="list-item" href={`#/lift/w/${s.workout.id}`}>
                <div className="grow">
                  <div className="title">
                    {dayLabel(s.date)} <span className="muted small">· {s.workout.name}</span>
                  </div>
                  <div className="sub tabular">{s.sets.map((x) => setText(ex.kind, x, u)).join(' · ')}</div>
                </div>
                {weighted && s.volume > 0 && <span className="small muted tabular">{int(u.wOut(s.volume))} {u.w}</span>}
              </a>
            ))}
          </div>
        )}
      </div>

      <ConfirmButton
        className="btn btn-danger btn-block"
        onConfirm={() => {
          remove('exercises', ex.id)
          navigate('/lift', { replace: true })
        }}
      >
        <Trash2 size={18} /> Delete exercise
      </ConfirmButton>
      <p className="small muted" style={{ textAlign: 'center' }}>
        Deleting hides it from the picker; past workouts keep their sets.
      </p>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit exercise" accent="var(--lift)">
        <ExerciseForm existing={ex} onSave={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </Sheet>
    </div>
  )
}
