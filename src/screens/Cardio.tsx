import { useMemo, useState, type ComponentType } from 'react'
import { Activity, Bike, ChevronRight, Footprints, Mountain, Plus, Trash2, Waves, Zap } from 'lucide-react'
import { ChartFrame, ColumnChart, DataTable } from '../components/charts'
import { ConfirmButton, Empty, Field, NumberInput, Seg, Sheet, accent } from '../components/ui'
import { live, put, remove, useDB } from '../lib/store'
import { addDays, dayLabel, duration, int, num, shortDate, todayKey, uid, units } from '../lib/format'
import { inWeek, weeksBack } from '../lib/stats'
import type { Cardio, CardioType } from '../lib/types'

export const CARDIO_TYPES: { value: CardioType; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { value: 'run', label: 'Run', icon: Footprints },
  { value: 'walk', label: 'Walk', icon: Footprints },
  { value: 'ride', label: 'Ride', icon: Bike },
  { value: 'swim', label: 'Swim', icon: Waves },
  { value: 'row', label: 'Row', icon: Waves },
  { value: 'hike', label: 'Hike', icon: Mountain },
  { value: 'elliptical', label: 'Elliptical', icon: Activity },
  { value: 'other', label: 'Other', icon: Zap },
]

export const cardioMeta = (t: CardioType) => CARDIO_TYPES.find((c) => c.value === t) ?? CARDIO_TYPES[7]

/** "8:42 /mi" — minutes per distance unit. */
export function pace(c: Cardio, toUnit: (km: number) => number, unit: string) {
  if (!c.distanceKm || !c.durationMin) return null
  const perUnit = c.durationMin / toUnit(c.distanceKm)
  if (!isFinite(perUnit) || perUnit > 120) return null
  const m = Math.floor(perUnit)
  const s = Math.round((perUnit - m) * 60)
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, '0')} /${unit}`
}

export default function CardioScreen() {
  const db = useDB()
  const u = units(db.settings)
  const [sheet, setSheet] = useState<{ open: boolean; entry?: Cardio }>({ open: false })
  const [metric, setMetric] = useState<'time' | 'distance'>('time')
  const today = todayKey()

  const all = useMemo(
    () => live(db, 'cardio').sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt),
    [db.cardio],
  )
  const weeks = weeksBack(today, 12)
  const thisWeek = all.filter((c) => inWeek(c.date, weeks[weeks.length - 1]))
  const sum = (list: Cardio[], f: (c: Cardio) => number) => list.reduce((n, c) => n + f(c), 0)

  const columns = weeks.map((wk) => {
    const list = all.filter((c) => inWeek(c.date, wk))
    const value = metric === 'time' ? sum(list, (c) => c.durationMin) : u.dOut(sum(list, (c) => c.distanceKm ?? 0))
    return { key: wk, label: shortDate(wk), title: `Week of ${shortDate(wk)} – ${shortDate(addDays(wk, 6))}`, value }
  })

  return (
    <div className="rise" style={accent('cardio')}>
      <button className="btn btn-accent btn-block" style={{ minHeight: 54, fontSize: '1.05rem' }} onClick={() => setSheet({ open: true })}>
        <Plus size={20} /> Log activity
      </button>

      <div className="grid grid-2" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="card-head">
            <h3>This week</h3>
          </div>
          <div className="stats">
            <div className="stat">
              <span className="eyebrow">Sessions</span>
              <span className="value">{thisWeek.length}</span>
            </div>
            <div className="stat">
              <span className="eyebrow">Time</span>
              <span className="value">{duration(sum(thisWeek, (c) => c.durationMin))}</span>
            </div>
            <div className="stat">
              <span className="eyebrow">Distance</span>
              <span className="value">
                {num(u.dOut(sum(thisWeek, (c) => c.distanceKm ?? 0)))}
                <small>{u.d}</small>
              </span>
            </div>
            <div className="stat">
              <span className="eyebrow">Calories</span>
              <span className="value">
                {int(sum(thisWeek, (c) => c.calories ?? 0))}
                <small>kcal</small>
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Weekly {metric === 'time' ? 'minutes' : 'distance'}</h3>
            <div style={{ width: 150 }}>
              <Seg
                label="Metric"
                value={metric}
                onChange={setMetric}
                options={[
                  { value: 'time', label: 'Time' },
                  { value: 'distance', label: u.d },
                ]}
              />
            </div>
          </div>
          <ChartFrame
            table={
              <DataTable
                head={['Week of', metric === 'time' ? 'Minutes' : u.d]}
                rows={[...columns].reverse().map((c) => [c.label, num(c.value)])}
              />
            }
          >
            <ColumnChart
              data={columns}
              color="var(--chart-cardio)"
              unit={metric === 'time' ? 'min' : u.d}
              format={(v) => num(v, metric === 'time' ? 0 : 1)}
            />
          </ChartFrame>
        </div>
      </div>

      <div className="section-title">
        <h2>Activities</h2>
        <span className="small muted">{all.length} logged</span>
      </div>
      <div className="card" style={{ padding: '4px 16px' }}>
        {all.length === 0 ? (
          <Empty icon={<Footprints size={32} />}>Runs, rides, walks, swims — log one to start the weekly chart.</Empty>
        ) : (
          <div className="list">
            {all.slice(0, 300).map((c) => {
              const t = cardioMeta(c.type)
              const p = pace(c, u.dOut, u.d)
              return (
                <button key={c.id} className="list-item" onClick={() => setSheet({ open: true, entry: c })}>
                  <span className="puck">
                    <t.icon size={18} />
                  </span>
                  <div className="grow">
                    <div className="title">
                      {t.label}
                      {c.distanceKm ? ` · ${num(u.dOut(c.distanceKm), 2)} ${u.d}` : ''}
                    </div>
                    <div className="sub">
                      {dayLabel(c.date)} · {duration(c.durationMin)}
                      {p && ` · ${p}`}
                      {c.calories ? ` · ${int(c.calories)} kcal` : ''}
                    </div>
                  </div>
                  <ChevronRight size={18} className="muted" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      <CardioSheet open={sheet.open} entry={sheet.entry} onClose={() => setSheet({ open: false })} />
    </div>
  )
}

export function CardioSheet({ open, entry, onClose }: { open: boolean; entry?: Cardio; onClose: () => void }) {
  const db = useDB()
  const u = units(db.settings)
  const blank = (): Cardio => ({ id: '', updatedAt: 0, date: todayKey(), type: lastType(db), durationMin: 30 })
  const [draft, setDraft] = useState<Cardio | null>(null)
  const c = draft ?? entry ?? blank()
  const edit = (patch: Partial<Cardio>) => setDraft({ ...c, ...patch })
  const close = () => {
    setDraft(null)
    onClose()
  }
  const p = pace(c, u.dOut, u.d)

  return (
    <Sheet
      open={open}
      onClose={close}
      title={entry ? 'Edit activity' : 'Log activity'}
      accent="var(--cardio)"
      footer={
        <>
          {entry && (
            <ConfirmButton
              onConfirm={() => {
                remove('cardio', entry.id)
                close()
              }}
            >
              <Trash2 size={18} /> Delete
            </ConfirmButton>
          )}
          <button
            className="btn btn-accent"
            disabled={!(c.durationMin > 0)}
            onClick={() => {
              put('cardio', { ...c, id: c.id || uid() })
              close()
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="chips" style={{ marginBottom: 16 }}>
        {CARDIO_TYPES.map((t) => (
          <button key={t.value} className="chip" aria-pressed={c.type === t.value} onClick={() => edit({ type: t.value })}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <Field label="Date" className="full">
          <input className="input" type="date" value={c.date} max={todayKey()} onChange={(e) => e.target.value && edit({ date: e.target.value })} />
        </Field>
        <Field label={`Duration${c.durationMin >= 60 ? ` · ${duration(c.durationMin)}` : ''}`}>
          <NumberInput value={c.durationMin} suffix="min" onChange={(v) => edit({ durationMin: v ?? 0 })} />
        </Field>
        <Field label="Distance">
          <NumberInput
            value={c.distanceKm != null ? u.dOut(c.distanceKm) : null}
            suffix={u.d}
            onChange={(v) => edit({ distanceKm: v == null ? undefined : u.dIn(v) })}
          />
        </Field>
        <Field label="Calories burned (optional)">
          <NumberInput value={c.calories ?? null} decimals={false} suffix="kcal" onChange={(v) => edit({ calories: v ?? undefined })} />
        </Field>
        <Field label="Pace">
          <input className="input" readOnly value={p ?? '—'} tabIndex={-1} />
        </Field>
        <Field label="Notes" className="full">
          <input className="input" value={c.notes ?? ''} onChange={(e) => edit({ notes: e.target.value })} placeholder="Route, how it felt…" />
        </Field>
      </div>
    </Sheet>
  )
}

function lastType(db: ReturnType<typeof useDB>): CardioType {
  let best: Cardio | undefined
  for (const c of live(db, 'cardio')) if (!best || c.updatedAt > best.updatedAt) best = c
  return best?.type ?? 'run'
}
