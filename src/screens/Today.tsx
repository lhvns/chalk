import { useMemo, useState, type CSSProperties } from 'react'
import { ChevronRight, CloudOff, Dumbbell, Footprints, Play, Scale, Utensils } from 'lucide-react'
import { LineChart } from '../components/charts'
import { live, useDB } from '../lib/store'
import { navigate } from '../lib/router'
import { useSync } from '../lib/sync'
import { addDays, duration, fromKey, int, num, plural, todayKey, units } from '../lib/format'
import { calorieBudget, foodByDate, inWeek, sortedWorkouts, totals, trend, trendAt, weightSeries, workoutMinutes, workoutSetCount, weeksBack } from '../lib/stats'
import { activeWorkout, startWorkout } from './Lift'
import { CardioSheet, cardioMeta, pace } from './Cardio'
import { BodySheet } from './Body'
import { AddFoodSheet, CalorieCard, mealForNow } from './Food'

export default function Today() {
  const db = useDB()
  const sync = useSync()
  const u = units(db.settings)
  const today = todayKey()
  const [sheet, setSheet] = useState<'cardio' | 'body' | 'food' | null>(null)

  const food = useMemo(() => foodByDate(db), [db.foodLog])
  const eaten = totals(food.get(today) ?? [])
  const running = activeWorkout(db)

  const todaysLifts = sortedWorkouts(db).filter((w) => w.date === today && w.finishedAt)
  const todaysCardio = live(db, 'cardio').filter((c) => c.date === today)

  const week = weeksBack(today, 1)[0]
  const weekLifts = live(db, 'workouts').filter((w) => w.finishedAt && inWeek(w.date, week))
  const weekCardio = live(db, 'cardio').filter((c) => inWeek(c.date, week))
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -i))
  const loggedDays = last7.map((d) => totals(food.get(d) ?? []).kcal).filter((k) => k > 0)
  const avgKcal = loggedDays.length ? loggedDays.reduce((a, b) => a + b, 0) / loggedDays.length : 0

  const weights = useMemo(() => weightSeries(db), [db.body])
  const trendNow = trendAt(weights, today)
  const trendWeekAgo = trendAt(weights, addDays(today, -7))
  const spark = trend(weights)
    .filter((p) => p.date >= addDays(today, -30))
    .map((p) => ({ date: p.date, value: u.wOut(p.value) }))

  const d = fromKey(today)
  const actions = [
    { label: running ? 'Resume workout' : 'Start workout', icon: running ? Play : Dumbbell, accent: 'var(--lift)', onClick: () => startWorkout() },
    { label: 'Log cardio', icon: Footprints, accent: 'var(--cardio)', onClick: () => setSheet('cardio') },
    { label: 'Add food', icon: Utensils, accent: 'var(--food)', onClick: () => setSheet('food') },
    { label: 'Weigh in', icon: Scale, accent: 'var(--body)', onClick: () => setSheet('body') },
  ]

  return (
    <div className="rise">
      <div style={{ margin: '4px 2px 14px' }}>
        <div className="eyebrow">{d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
        <div className="display" style={{ fontSize: 'clamp(2.8rem, 12vw, 4.4rem)', marginTop: 4 }}>
          {d.toLocaleDateString(undefined, { weekday: 'long' })}
        </div>
      </div>

      <div className="grid grid-3">
        <div className="span-2" style={{ '--accent': 'var(--food)' } as CSSProperties}>
          <CalorieCard eaten={eaten} budget={calorieBudget(db, today)} onClick={() => navigate('/food')} />
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', alignContent: 'start' }}>
          {actions.map((a) => (
            <button
              key={a.label}
              className="card"
              onClick={a.onClick}
              style={{ '--accent': a.accent, display: 'grid', gap: 10, textAlign: 'left', cursor: 'pointer', margin: 0, color: 'inherit', font: 'inherit' } as CSSProperties}
            >
              <span className="puck">
                <a.icon size={18} />
              </span>
              <span style={{ fontWeight: 700 }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {running && (
        <a className="live-banner" href={`#/lift/w/${running.id}`} style={{ marginTop: 12, '--accent': 'var(--lift)' } as CSSProperties}>
          <Play size={20} />
          <span className="grow">
            {running.name} in progress · {plural(workoutSetCount(running), 'set')} done
          </span>
          <ChevronRight size={20} />
        </a>
      )}

      <div className="grid grid-2" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="card-head">
            <h3>Today’s training</h3>
          </div>
          {todaysLifts.length + todaysCardio.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>
              Nothing logged yet today.
            </p>
          ) : (
            <div className="list">
              {todaysLifts.map((w) => (
                <a key={w.id} className="list-item" href={`#/lift/w/${w.id}`} style={{ '--accent': 'var(--lift)' } as CSSProperties}>
                  <span className="puck">
                    <Dumbbell size={18} />
                  </span>
                  <div className="grow">
                    <div className="title">{w.name}</div>
                    <div className="sub">
                      {duration(workoutMinutes(w))} · {plural(workoutSetCount(w), 'set')}
                    </div>
                  </div>
                </a>
              ))}
              {todaysCardio.map((c) => {
                const t = cardioMeta(c.type)
                const p = pace(c, u.dOut, u.d)
                return (
                  <a key={c.id} className="list-item" href="#/cardio" style={{ '--accent': 'var(--cardio)' } as CSSProperties}>
                    <span className="puck">
                      <t.icon size={18} />
                    </span>
                    <div className="grow">
                      <div className="title">
                        {t.label}
                        {c.distanceKm ? ` · ${num(u.dOut(c.distanceKm), 2)} ${u.d}` : ''}
                      </div>
                      <div className="sub">
                        {duration(c.durationMin)}
                        {p && ` · ${p}`}
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>This week</h3>
            <span className="small muted">since Monday</span>
          </div>
          <div className="stats">
            <div className="stat" style={{ '--accent': 'var(--lift)' } as CSSProperties}>
              <span className="eyebrow">Workouts</span>
              <span className="value">{weekLifts.length}</span>
              <span className="delta">{plural(weekLifts.reduce((n, w) => n + workoutSetCount(w), 0), 'set')}</span>
            </div>
            <div className="stat">
              <span className="eyebrow">Cardio</span>
              <span className="value">{duration(weekCardio.reduce((n, c) => n + c.durationMin, 0))}</span>
              <span className="delta">
                {num(u.dOut(weekCardio.reduce((n, c) => n + (c.distanceKm ?? 0), 0)))} {u.d}
              </span>
            </div>
            <div className="stat">
              <span className="eyebrow">Avg intake</span>
              <span className="value">
                {avgKcal ? int(avgKcal) : '–'}
                <small>kcal</small>
              </span>
              <span className="delta">{loggedDays.length} of last 7 days logged</span>
            </div>
            <div className="stat">
              <span className="eyebrow">Weight trend</span>
              <span className="value">
                {trendNow != null ? num(u.wOut(trendNow)) : '–'}
                <small>{u.w}</small>
              </span>
              <span className="delta">
                {trendNow != null && trendWeekAgo != null
                  ? `${u.wOut(trendNow) - u.wOut(trendWeekAgo) >= 0 ? '+' : '−'}${num(Math.abs(u.wOut(trendNow) - u.wOut(trendWeekAgo)))} ${u.w} vs last week`
                  : 'Weigh in to start a trend'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {spark.length >= 3 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-head">
            <h3>Weight trend · 30 days</h3>
            <a className="btn btn-ghost btn-sm" href="#/body">
              Details <ChevronRight size={14} />
            </a>
          </div>
          <LineChart height={150} unit={u.w} format={(v) => num(v)} series={[{ name: '7-day average', color: 'var(--chart-body)', points: spark }]} />
        </div>
      )}

      {sync.phase === 'off' && (
        <button className="card" onClick={() => navigate('/settings')} style={{ marginTop: 12, width: '100%', textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
          <CloudOff size={22} className="muted" />
          <span className="grow">
            <strong>Sync your phone and PC</strong>
            <div className="small muted">Connect Google Drive so everything you log shows up on both.</div>
          </span>
          <ChevronRight size={18} className="muted" />
        </button>
      )}

      <CardioSheet open={sheet === 'cardio'} onClose={() => setSheet(null)} />
      <BodySheet open={sheet === 'body'} date={today} onClose={() => setSheet(null)} />
      <AddFoodSheet open={sheet === 'food'} date={today} meal={mealForNow()} onClose={() => setSheet(null)} />
    </div>
  )
}
