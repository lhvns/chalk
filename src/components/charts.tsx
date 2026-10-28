import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { daysBetween, fromKey, shortDate } from '../lib/format'
import type { DateKey } from '../lib/types'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(el)
    setW(Math.floor(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Round, human tick values covering [min, max]. */
function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1
    min -= pad
    max += pad
  }
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

const compact = (v: number) =>
  Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}K` : Math.round(v * 10) / 10 + ''

// ---------- Frame: legend, table toggle ----------

export function ChartFrame({
  legend,
  table,
  children,
}: {
  legend?: ReactNode
  table: ReactNode
  children: ReactNode
}) {
  const [asTable, setAsTable] = useState(false)
  return (
    <div>
      <div className="spread" style={{ marginBottom: legend ? 8 : 0, marginTop: legend ? 0 : -6, minHeight: 28 }}>
        <div className="legend">{legend}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}>
          {asTable ? 'Chart' : 'Table'}
        </button>
      </div>
      {asTable ? <div className="table-scroll">{table}</div> : children}
    </div>
  )
}

// ---------- Line chart over dates ----------

export interface LineSeries {
  name: string
  color: string
  points: { date: DateKey; value: number }[]
  /** 'line' draws a 2px path; 'dots' draws markers only (e.g. raw weigh-ins under a trend). */
  style?: 'line' | 'dots'
}

export function LineChart({
  series,
  height = 200,
  format = compact,
  unit = '',
}: {
  series: LineSeries[]
  height?: number
  format?: (v: number) => string
  unit?: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const m = { l: 40, r: 52, t: 14, b: 26 }
  const iw = Math.max(10, width - m.l - m.r)
  const ih = height - m.t - m.b

  const geo = useMemo(() => {
    const all = series.flatMap((s) => s.points)
    if (!all.length) return null
    const dates = [...new Set(all.map((p) => p.date))].sort()
    const first = dates[0]
    const span = Math.max(1, daysBetween(first, dates[dates.length - 1]))
    const values = all.map((p) => p.value)
    const ticks = niceTicks(Math.min(...values), Math.max(...values))
    const y0 = ticks[0]
    const y1 = ticks[ticks.length - 1]
    const x = (d: DateKey) => m.l + (daysBetween(first, d) / span) * iw
    const y = (v: number) => m.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih
    return { dates, ticks, x, y, span }
  }, [series, iw, ih, m.l, m.t])

  if (!geo) return <div ref={ref} className="chart" style={{ height }} />

  const { dates, ticks, x, y, span } = geo
  const xLabelCount = Math.min(dates.length, Math.max(2, Math.floor(iw / 90)))
  const xLabels = Array.from({ length: xLabelCount }, (_, i) =>
    dates[Math.round((i * (dates.length - 1)) / Math.max(1, xLabelCount - 1))],
  )
  const fmtDate = (d: DateKey) =>
    span > 300 ? fromKey(d).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) : shortDate(d)

  const lead = series.find((s) => s.style !== 'dots') ?? series[0]
  const last = lead.points[lead.points.length - 1]
  const hoverDate = hover != null ? dates[hover] : null

  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect()
    const px = clientX - r.left
    let best = 0
    let bestD = Infinity
    dates.forEach((d, i) => {
      const dd = Math.abs(x(d) - px)
      if (dd < bestD) {
        bestD = dd
        best = i
      }
    })
    setHover(best)
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? dates.length) - 1))
    else if (e.key === 'ArrowRight') setHover((h) => Math.min(dates.length - 1, (h ?? -1) + 1))
    else return
    e.preventDefault()
  }

  const tipLeft = hoverDate ? Math.min(Math.max(x(hoverDate) - 60, 0), width - 130) : 0

  return (
    <div
      ref={ref}
      className="chart"
      style={{ height }}
      tabIndex={0}
      role="img"
      aria-label={`${lead.name} chart, ${dates.length} points. Use the table toggle for exact values.`}
      onKeyDown={onKey}
      onBlur={() => setHover(null)}
    >
      <svg width={width} height={height}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={m.l + iw} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        {xLabels.map((d, i) => (
          <text
            key={d + i}
            x={x(d)}
            y={height - 6}
            textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
          >
            {fmtDate(d)}
          </text>
        ))}

        {hoverDate && (
          <line x1={x(hoverDate)} x2={x(hoverDate)} y1={m.t} y2={m.t + ih} stroke="var(--axis)" strokeWidth={1} />
        )}

        {series.map((s) =>
          s.style === 'dots' ? (
            <g key={s.name}>
              {s.points.map((p) => (
                <circle
                  key={p.date}
                  cx={x(p.date)}
                  cy={y(p.value)}
                  r={p.date === hoverDate ? 5 : 3.5}
                  fill={s.color}
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                />
              ))}
            </g>
          ) : (
            <g key={s.name}>
              <path
                d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join('')}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.points.length === 1 && <circle cx={x(s.points[0].date)} cy={y(s.points[0].value)} r={4} fill={s.color} />}
            </g>
          ),
        )}

        {/* End label on the lead series — the one number worth reading at a glance. */}
        {last && (
          <g>
            <circle cx={x(last.date)} cy={y(last.value)} r={5} fill={lead.color} stroke="var(--surface)" strokeWidth={2} />
            <text className="label-strong" x={x(last.date) + 9} y={y(last.value) + 4}>
              {format(last.value)}
              {unit && <tspan className="muted"> {unit}</tspan>}
            </text>
          </g>
        )}

        {hoverDate &&
          series.map((s) => {
            const p = s.points.find((q) => q.date === hoverDate)
            return (
              p &&
              s.style !== 'dots' && (
                <circle key={s.name} cx={x(p.date)} cy={y(p.value)} r={5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              )
            )
          })}

        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          onPointerMove={(e: PointerEvent) => pick(e.clientX, e.currentTarget)}
          onPointerDown={(e: PointerEvent) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={(e: PointerEvent) => e.pointerType === 'mouse' && setHover(null)}
        />
      </svg>

      {hoverDate && (
        <div className="tooltip" style={{ left: tipLeft }}>
          <div className="tt-date">{fromKey(hoverDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
          {series.map((s) => {
            const p = s.points.find((q) => q.date === hoverDate)
            return (
              <div className="tt-row" key={s.name}>
                <span className="key" style={{ background: s.color }} />
                <strong>{p ? `${format(p.value)}${unit ? ` ${unit}` : ''}` : '–'}</strong>
                <span className="muted">{s.name}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------- Column chart over categories (days, weeks) ----------

export interface Column {
  key: string
  label: string
  /** Full label for tooltips and the table. */
  title: string
  value: number
}

export function ColumnChart({
  data,
  color,
  height = 180,
  format = compact,
  unit = '',
  reference,
}: {
  data: Column[]
  color: string
  height?: number
  format?: (v: number) => string
  unit?: string
  reference?: { value: number; label: string }
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const m = { l: 40, r: 8, t: 16, b: 26 }
  const iw = Math.max(10, width - m.l - m.r)
  const ih = height - m.t - m.b
  const max = Math.max(1, ...data.map((d) => d.value), reference?.value ?? 0)
  const ticks = niceTicks(0, max, 3)
  const top = ticks[ticks.length - 1]
  const y = (v: number) => m.t + ih - (v / top) * ih
  const band = iw / Math.max(1, data.length)
  const bw = Math.min(24, Math.max(4, band - 6))
  const every = Math.ceil(data.length / Math.max(1, Math.floor(iw / 38)))
  const lastIdx = data.length - 1

  const bar = (v: number, cx: number) => {
    const h = Math.max(0, (v / top) * ih)
    const r = Math.min(4, h, bw / 2)
    const x0 = cx - bw / 2
    const yb = m.t + ih
    // 4px rounded data-end, square at the baseline.
    return `M${x0},${yb}V${yb - h + r}Q${x0},${yb - h} ${x0 + r},${yb - h}H${x0 + bw - r}Q${x0 + bw},${yb - h} ${x0 + bw},${yb - h + r}V${yb}Z`
  }

  const hv = hover != null ? data[hover] : null
  const hx = hover != null ? m.l + band * hover + band / 2 : 0

  return (
    <div ref={ref} className="chart" style={{ height }}>
      <svg width={width} height={height}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={m.l + iw} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        {reference && reference.value > 0 && (
          <g>
            <line x1={m.l} x2={m.l + iw} y1={y(reference.value)} y2={y(reference.value)} stroke="var(--ink-2)" strokeWidth={1} opacity={0.7} />
            <text x={m.l + iw} y={y(reference.value) - 5} textAnchor="end">
              {reference.label}
            </text>
          </g>
        )}
        {data.map((d, i) => {
          const cx = m.l + band * i + band / 2
          return (
            <g key={d.key}>
              <path d={bar(d.value, cx)} fill={color} opacity={hover == null || hover === i ? 1 : 0.55} />
              {i % every === (lastIdx % every) && (
                <text x={cx} y={height - 6} textAnchor="middle">
                  {d.label}
                </text>
              )}
              {/* Label only the current period's value, at the cap — and only when it fits its band. */}
              {i === lastIdx && d.value > 0 && band >= format(d.value).length * 7.5 + 6 && (
                <text className="label-strong" x={cx} y={y(d.value) - 6} textAnchor="middle">
                  {format(d.value)}
                </text>
              )}
              <rect
                x={cx - band / 2}
                y={m.t}
                width={band}
                height={ih}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.title}: ${format(d.value)} ${unit}`}
                onPointerEnter={() => setHover(i)}
                onPointerDown={() => setHover(i)}
                onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            </g>
          )
        })}
      </svg>
      {hv && (
        <div className="tooltip" style={{ left: Math.min(Math.max(hx - 60, 0), width - 130), top: 0 }}>
          <div className="tt-date">{hv.title}</div>
          <div className="tt-row">
            <span className="key" style={{ background: color }} />
            <strong>
              {format(hv.value)}
              {unit ? ` ${unit}` : ''}
            </strong>
          </div>
        </div>
      )}
    </div>
  )
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
