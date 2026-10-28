import { useMemo, useState } from 'react'
import { ChevronRight, Plus, Ruler, Scale, Trash2 } from 'lucide-react'
import { ChartFrame, DataTable, LineChart } from '../components/charts'
import { ConfirmButton, Empty, Field, NumberInput, Seg, Sheet, accent } from '../components/ui'
import { live, put, remove, useDB } from '../lib/store'
import { addDays, dayLabel, num, shortDate, todayKey, units } from '../lib/format'
import { trend, trendAt, weightSeries } from '../lib/stats'
import { MEASUREMENTS, type BodyEntry, type DateKey, type Measurement } from '../lib/types'

const RANGES = { '30': 30, '90': 90, '365': 365, all: 0 } as const
type Range = keyof typeof RANGES

export const MEASURE_LABEL: Record<Measurement, string> = {
  waist: 'Waist',
  chest: 'Chest',
  hips: 'Hips',
  arm: 'Arm',
  thigh: 'Thigh',
  neck: 'Neck',
}

export default function BodyScreen() {
  const db = useDB()
  const u = units(db.settings)
  const today = todayKey()
  const [range, setRange] = useState<Range>('90')
  const [sheet, setSheet] = useState<{ open: boolean; date?: DateKey }>({ open: false })
  const [measure, setMeasure] = useState<Measurement>('waist')

  const weights = useMemo(() => weightSeries(db), [db.body])
  const avg = useMemo(() => trend(weights), [weights])
  const from = RANGES[range] ? addDays(today, -RANGES[range]) : '0000'
  const shownW = weights.filter((p) => p.date >= from).map((p) => ({ date: p.date, value: u.wOut(p.value) }))
  const shownT = avg.filter((p) => p.date >= from).map((p) => ({ date: p.date, value: u.wOut(p.value) }))

  const entries = useMemo(() => live(db, 'body').sort((a, b) => b.date.localeCompare(a.date)), [db.body])
  const nowTrend = trendAt(weights, today)
  const monthAgo = trendAt(weights, addDays(today, -30))
  const latest = weights[weights.length - 1]
  const bf = entries.find((e) => e.bodyFat != null)

  const mPoints = entries
    .filter((e) => e[measure] != null)
    .map((e) => ({ date: e.date, value: u.lOut(e[measure]!) }))
    .reverse()

  return (
    <div className="rise" style={accent('body')}>
      <button className="btn btn-accent btn-block" style={{ minHeight: 54, fontSize: '1.05rem' }} onClick={() => setSheet({ open: true, date: today })}>
        <Plus size={20} /> Log weigh-in
      </button>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="stats stats-4">
          <div className="stat">
            <span className="eyebrow">Trend (7-day)</span>
            <span className="value">
              {nowTrend != null ? num(u.wOut(nowTrend)) : '–'}
              <small>{u.w}</small>
            </span>
          </div>
          <div className="stat">
            <span className="eyebrow">30-day change</span>
            <span className="value">
              {nowTrend != null && monthAgo != null ? signed(u.wOut(nowTrend) - u.wOut(monthAgo)) : '–'}
              <small>{u.w}</small>
            </span>
          </div>
          <div className="stat">
            <span className="eyebrow">Last weigh-in</span>
            <span className="value">
              {latest ? num(u.wOut(latest.value)) : '–'}
              <small>{u.w}</small>
            </span>
            {latest && <span className="delta">{dayLabel(latest.date)}</span>}
          </div>
          <div className="stat">
            <span className="eyebrow">Body fat</span>
            <span className="value">
              {bf ? num(bf.bodyFat) : '–'}
              <small>%</small>
            </span>
            {bf && <span className="delta">{dayLabel(bf.date)}</span>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Weight</h3>
          <div style={{ width: 210 }}>
            <Seg
              label="Range"
              value={range}
              onChange={setRange}
              options={[
                { value: '30', label: '30d' },
                { value: '90', label: '90d' },
                { value: '365', label: '1y' },
                { value: 'all', label: 'All' },
              ]}
            />
          </div>
        </div>
        {shownW.length >= 2 ? (
          <ChartFrame
            legend={
              <>
                <span>
                  <i className="line-key" style={{ background: 'var(--chart-body)' }} /> 7-day average
                </span>
                <span>
                  <i className="dot-key" style={{ background: 'var(--muted)' }} /> Weigh-ins
                </span>
              </>
            }
            table={
              <DataTable
                head={['Date', `Weight (${u.w})`, '7-day avg']}
                rows={[...shownW].reverse().map((p, i) => [shortDate(p.date), num(p.value), num(shownT[shownT.length - 1 - i]?.value)])}
              />
            }
          >
            <LineChart
              height={230}
              unit={u.w}
              format={(v) => num(v)}
              series={[
                { name: '7-day average', color: 'var(--chart-body)', points: shownT },
                { name: 'Weigh-in', color: 'var(--muted)', points: shownW, style: 'dots' },
              ]}
            />
          </ChartFrame>
        ) : (
          <Empty icon={<Scale size={32} />}>
            Weigh in a few mornings a week. Daily numbers bounce around with water and food — the 7-day average shows where you’re really heading.
          </Empty>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Measurements</h3>
        </div>
        <div className="chips" style={{ marginBottom: 12 }}>
          {MEASUREMENTS.map((m) => (
            <button key={m} className="chip" aria-pressed={measure === m} onClick={() => setMeasure(m)}>
              {MEASURE_LABEL[m]}
            </button>
          ))}
        </div>
        {mPoints.length >= 2 ? (
          <ChartFrame table={<DataTable head={['Date', `${MEASURE_LABEL[measure]} (${u.l})`]} rows={[...mPoints].reverse().map((p) => [shortDate(p.date), num(p.value)])} />}>
            <LineChart height={180} unit={u.l} format={(v) => num(v)} series={[{ name: MEASURE_LABEL[measure], color: 'var(--chart-body)', points: mPoints }]} />
          </ChartFrame>
        ) : (
          <Empty icon={<Ruler size={28} />}>
            {mPoints.length === 1
              ? `One ${MEASURE_LABEL[measure].toLowerCase()} measurement so far: ${num(mPoints[0].value)} ${u.l}. Add another to see the trend.`
              : `No ${MEASURE_LABEL[measure].toLowerCase()} measurements yet. Add them when you log a weigh-in.`}
          </Empty>
        )}
      </div>

      <div className="section-title">
        <h2>History</h2>
      </div>
      <div className="card" style={{ padding: '4px 16px' }}>
        {entries.length === 0 ? (
          <Empty>No entries yet.</Empty>
        ) : (
          <div className="list">
            {entries.slice(0, 365).map((e) => {
              const ms = MEASUREMENTS.filter((m) => e[m] != null)
              return (
                <button key={e.id} className="list-item" onClick={() => setSheet({ open: true, date: e.date })}>
                  <div className="grow">
                    <div className="title">{dayLabel(e.date)}</div>
                    <div className="sub">
                      {[
                        e.bodyFat != null && `${num(e.bodyFat)}% fat`,
                        ms.length > 0 && ms.map((m) => `${MEASURE_LABEL[m]} ${num(u.lOut(e[m]!))}`).join(' · '),
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Weight only'}
                    </div>
                  </div>
                  {e.weight != null && (
                    <span className="tabular" style={{ fontWeight: 700 }}>
                      {num(u.wOut(e.weight))} <span className="muted small">{u.w}</span>
                    </span>
                  )}
                  <ChevronRight size={18} className="muted" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      <BodySheet open={sheet.open} date={sheet.date ?? today} onClose={() => setSheet({ open: false })} />
    </div>
  )
}

const signed = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v))

export function BodySheet({ open, date: initialDate, onClose }: { open: boolean; date: DateKey; onClose: () => void }) {
  const db = useDB()
  const u = units(db.settings)
  const [date, setDate] = useState<DateKey | null>(null)
  const [draft, setDraft] = useState<BodyEntry | null>(null)
  const d = date ?? initialDate
  const id = `body-${d}`
  const stored = db.body[id] && !db.body[id].deleted ? db.body[id] : undefined
  const e: BodyEntry = draft ?? stored ?? { id, updatedAt: 0, date: d }
  const edit = (patch: Partial<BodyEntry>) => setDraft({ ...e, ...patch })
  const close = () => {
    setDate(null)
    setDraft(null)
    onClose()
  }
  const hasData = e.weight != null || e.bodyFat != null || MEASUREMENTS.some((m) => e[m] != null)

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Weigh-in"
      accent="var(--body)"
      footer={
        <>
          {stored && (
            <ConfirmButton
              onConfirm={() => {
                remove('body', stored.id)
                close()
              }}
            >
              <Trash2 size={18} /> Delete
            </ConfirmButton>
          )}
          <button
            className="btn btn-accent"
            disabled={!hasData}
            onClick={() => {
              put('body', { ...e, deleted: undefined })
              close()
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Date" className="full">
          <input
            className="input"
            type="date"
            value={d}
            max={todayKey()}
            onChange={(ev) => {
              if (!ev.target.value) return
              setDate(ev.target.value)
              setDraft(null)
            }}
          />
        </Field>
        <Field label="Weight">
          <NumberInput
            value={e.weight != null ? u.wOut(e.weight) : null}
            precision={1}
            suffix={u.w}
            autoFocus={matchMedia('(pointer: fine)').matches}
            onChange={(v) => edit({ weight: v == null ? undefined : u.wIn(v) })}
          />
        </Field>
        <Field label="Body fat">
          <NumberInput value={e.bodyFat ?? null} suffix="%" onChange={(v) => edit({ bodyFat: v ?? undefined })} />
        </Field>
      </div>
      <div className="eyebrow" style={{ margin: '20px 0 8px' }}>
        Measurements (optional)
      </div>
      <div className="form-grid">
        {MEASUREMENTS.map((m) => (
          <Field key={m} label={MEASURE_LABEL[m]}>
            <NumberInput value={e[m] != null ? u.lOut(e[m]!) : null} precision={1} suffix={u.l} onChange={(v) => edit({ [m]: v == null ? undefined : u.lIn(v) })} />
          </Field>
        ))}
      </div>
    </Sheet>
  )
}
