import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Hash, Plus, ScanBarcode, Search, Trash2, Utensils, Zap } from 'lucide-react'
import { ChartFrame, ColumnChart, DataTable } from '../components/charts'
import { ConfirmButton, Empty, Field, Meter, NumberInput, Seg, Sheet, accent } from '../components/ui'
import { getDB, live, put, remove, useDB } from '../lib/store'
import { navigate } from '../lib/router'
import { addDays, dayLabel, fromKey, int, num, shortDate, todayKey, uid } from '../lib/format'
import { calorieBudget, foodByDate, totals } from '../lib/stats'
import { COMMON_FOODS, canScan, lookupBarcode } from '../lib/foods'
import type { DateKey, Food, FoodLog, Meal, Nutrition } from '../lib/types'

export const MEALS: { value: Meal; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snacks' },
]

export function mealForNow(): Meal {
  const h = new Date().getHours()
  if (h < 11) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}

export default function FoodScreen({ date = todayKey() }: { date?: DateKey }) {
  const db = useDB()
  const [adding, setAdding] = useState<Meal | null>(null)
  const [editing, setEditing] = useState<FoodLog | null>(null)
  const byDate = useMemo(() => foodByDate(db), [db.foodLog])
  const entries = byDate.get(date) ?? []
  const t = totals(entries)
  const budget = calorieBudget(db, date)
  const s = db.settings
  const today = todayKey()

  const days = Array.from({ length: 14 }, (_, i) => addDays(date > today ? today : date, i - 13))
  const columns = days.map((d) => ({
    key: d,
    label: String(fromKey(d).getDate()),
    title: dayLabel(d),
    value: Math.round(totals(byDate.get(d) ?? []).kcal),
  }))
  const logged = columns.filter((c) => c.value > 0)
  const avg = logged.length ? logged.reduce((n, c) => n + c.value, 0) / logged.length : 0

  const go = (d: DateKey) => navigate(d === today ? '/food' : `/food/${d}`, { replace: true })

  return (
    <div className="rise" style={accent('food')}>
      <div className="date-nav">
        <button className="icon-btn" aria-label="Previous day" onClick={() => go(addDays(date, -1))}>
          <ChevronLeft size={22} />
        </button>
        <div className="label">{dayLabel(date)}</div>
        <button className="icon-btn" aria-label="Next day" disabled={date >= today} onClick={() => go(addDays(date, 1))}>
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="grid grid-2">
        <CalorieCard eaten={t} budget={budget} />

        <div className="card">
          <div className="card-head">
            <h3>Last 14 days</h3>
            {avg > 0 && <span className="small ink-2">avg {int(avg)} kcal</span>}
          </div>
          <ChartFrame table={<DataTable head={['Day', 'kcal']} rows={[...columns].reverse().map((c) => [c.title, int(c.value)])} />}>
            <ColumnChart data={columns} color="var(--chart-food)" unit="kcal" reference={{ value: s.calorieGoal, label: `goal ${int(s.calorieGoal)}` }} />
          </ChartFrame>
        </div>
      </div>

      {MEALS.map((m) => {
        const list = entries.filter((e) => e.meal === m.value).sort((a, b) => a.updatedAt - b.updatedAt)
        const mt = totals(list)
        return (
          <div key={m.value}>
            <div className="section-title">
              <h2>{m.label}</h2>
              <span className="small ink-2 tabular">{mt.kcal ? `${int(mt.kcal)} kcal` : ''}</span>
              <button className="btn btn-sm" onClick={() => setAdding(m.value)} aria-label={`Add to ${m.label}`}>
                <Plus size={16} /> Add
              </button>
            </div>
            {list.length > 0 && (
              <div className="card" style={{ padding: '2px 16px' }}>
                <div className="list">
                  {list.map((e) => (
                    <button key={e.id} className="list-item" onClick={() => setEditing(e)}>
                      <div className="grow">
                        <div className="title">{e.name}</div>
                        <div className="sub">
                          {amountLabel(e)} · P {num(e.protein * e.servings, 0)} · C {num(e.carbs * e.servings, 0)} · F {num(e.fat * e.servings, 0)}
                        </div>
                      </div>
                      <span className="tabular" style={{ fontWeight: 700 }}>
                        {int(e.kcal * e.servings)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}

      <AddFoodSheet open={adding != null} date={date} meal={adding ?? 'snack'} onClose={() => setAdding(null)} />
      <Sheet open={editing != null} onClose={() => setEditing(null)} title="Edit entry" accent="var(--food)">
        {editing && <AmountStep food={editing} initial={editing} onDone={() => setEditing(null)} date={date} meal={editing.meal} />}
      </Sheet>
    </div>
  )
}

export function amountLabel(e: { servings: number; serving: string }) {
  if (/^100\s*g$/.test(e.serving)) return `${num(e.servings * 100, 0)} g`
  return e.servings === 1 ? e.serving : `${num(e.servings, 2)} × ${e.serving}`
}

export function CalorieCard({ eaten, budget, onClick }: { eaten: Nutrition; budget: number; onClick?: () => void }) {
  const s = getDB().settings
  const left = budget - eaten.kcal
  return (
    <div className="card" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="spread" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="eyebrow">{left >= 0 ? 'Calories left' : 'Over budget'}</div>
          <div className="hero-figure">{int(Math.abs(left))}</div>
        </div>
        <div className="small ink-2 tabular" style={{ textAlign: 'right', paddingBottom: 6 }}>
          <div>
            <strong style={{ color: 'var(--ink)' }}>{int(eaten.kcal)}</strong> eaten
          </div>
          <div>{int(budget)} budget</div>
        </div>
      </div>
      <div style={{ margin: '14px 0 16px' }}>
        <Meter value={eaten.kcal} max={budget} over />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14 }}>
        {(
          [
            ['Protein', eaten.protein, s.proteinGoal],
            ['Carbs', eaten.carbs, s.carbsGoal],
            ['Fat', eaten.fat, s.fatGoal],
          ] as const
        ).map(([label, v, goal]) => (
          <div key={label} className="macro">
            <div className="spread small">
              <span className="ink-2">{label}</span>
            </div>
            <Meter value={v} max={goal} />
            <div className="small tabular">
              <strong>{int(v)}</strong>
              <span className="muted"> / {int(goal)} g</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Adding food ----------

type Candidate = Omit<Food, 'id' | 'updatedAt'> & { id?: string; source: 'recent' | 'mine' | 'common' | 'scan' }

type Step = { kind: 'search' } | { kind: 'amount'; food: Candidate } | { kind: 'create'; barcode?: string; name?: string } | { kind: 'quick' } | { kind: 'scan' }

export function AddFoodSheet({ open, date, meal, onClose }: { open: boolean; date: DateKey; meal: Meal; onClose: () => void }) {
  const [step, setStep] = useState<Step>({ kind: 'search' })
  const close = () => {
    setStep({ kind: 'search' })
    onClose()
  }
  const mealLabel = MEALS.find((m) => m.value === meal)!.label
  const title =
    step.kind === 'create' ? 'New food' : step.kind === 'quick' ? 'Quick add' : step.kind === 'scan' ? 'Scan barcode' : `Add to ${mealLabel}`

  return (
    <Sheet open={open} onClose={close} title={title} accent="var(--food)">
      {step.kind === 'search' && <SearchStep onPick={(food) => setStep({ kind: 'amount', food })} onStep={setStep} />}
      {step.kind === 'amount' && <AmountStep food={step.food} date={date} meal={meal} onDone={close} onBack={() => setStep({ kind: 'search' })} />}
      {step.kind === 'create' && (
        <CreateFood barcode={step.barcode} name={step.name} onSaved={(food) => setStep({ kind: 'amount', food: { ...food, source: 'mine' } })} onBack={() => setStep({ kind: 'search' })} />
      )}
      {step.kind === 'quick' && <QuickAdd date={date} meal={meal} onDone={close} />}
      {step.kind === 'scan' && <Scanner onResult={(r) => setStep(r)} onBack={() => setStep({ kind: 'search' })} />}
    </Sheet>
  )
}

function SearchStep({ onPick, onStep }: { onPick: (f: Candidate) => void; onStep: (s: Step) => void }) {
  const db = useDB()
  const [q, setQ] = useState('')
  const [code, setCode] = useState('')
  const [codeOpen, setCodeOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const mine: Candidate[] = useMemo(() => live(db, 'foods').map((f) => ({ ...f, source: 'mine' as const })), [db.foods])
  const recent: Candidate[] = useMemo(() => {
    const seen = new Set<string>()
    const out: Candidate[] = []
    for (const e of live(db, 'foodLog').sort((a, b) => b.updatedAt - a.updatedAt)) {
      const k = `${e.name}|${e.serving}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ id: e.foodId, name: e.name, serving: e.serving, servingGrams: e.servingGrams, kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat, source: 'recent' })
      if (out.length >= 30) break
    }
    return out
  }, [db.foodLog])

  const needle = q.trim().toLowerCase()
  const hit = (f: Candidate) => `${f.name} ${f.brand ?? ''}`.toLowerCase().includes(needle)
  const groups: [string, Candidate[]][] = needle
    ? [
        ['Recent', recent.filter(hit).slice(0, 8)],
        ['My foods', mine.filter(hit)],
        ['Common foods', COMMON_FOODS.map((f) => ({ ...f, source: 'common' as const })).filter(hit)],
      ]
    : [
        ['Recent', recent.slice(0, 12)],
        ['My foods', mine.sort((a, b) => a.name.localeCompare(b.name))],
      ]

  const byCode = async (c: string) => {
    setBusy(true)
    setError('')
    try {
      const r = await resolveBarcode(c)
      onStep(r)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="input-suffix">
        <input className="input" placeholder="Search foods" value={q} onChange={(e) => setQ(e.target.value)} />
        <em>
          <Search size={16} />
        </em>
      </div>
      <div className="row-wrap" style={{ margin: '10px 0 4px' }}>
        {canScan() && (
          <button className="btn btn-sm btn-accent" onClick={() => onStep({ kind: 'scan' })}>
            <ScanBarcode size={16} /> Scan
          </button>
        )}
        <button className="btn btn-sm" onClick={() => setCodeOpen((o) => !o)} aria-expanded={codeOpen}>
          <Hash size={16} /> Barcode
        </button>
        <button className="btn btn-sm" onClick={() => onStep({ kind: 'quick' })}>
          <Zap size={16} /> Quick add
        </button>
        <button className="btn btn-sm" onClick={() => onStep({ kind: 'create', name: q })}>
          <Plus size={16} /> New food
        </button>
      </div>
      {codeOpen && (
        <form
          className="row"
          style={{ marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim()) void byCode(code.trim())
          }}
        >
          <input className="input grow" inputMode="numeric" placeholder="Digits under the barcode" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <button className="btn btn-accent" disabled={busy || code.length < 6}>
            {busy ? 'Looking…' : 'Look up'}
          </button>
        </form>
      )}
      {error && <div className="notice error" style={{ marginTop: 10 }}>{error}</div>}

      {groups.map(([label, list]) =>
        list.length ? (
          <div key={label}>
            <div className="eyebrow" style={{ margin: '18px 0 4px' }}>
              {label}
            </div>
            <div className="list">
              {list.map((f, i) => (
                <button key={`${f.id ?? f.name}-${i}`} className="list-item" onClick={() => onPick(f)}>
                  <div className="grow">
                    <div className="title">{f.name}</div>
                    <div className="sub">
                      {f.brand ? `${f.brand} · ` : ''}
                      {f.serving} · P {num(f.protein, 0)} C {num(f.carbs, 0)} F {num(f.fat, 0)}
                    </div>
                  </div>
                  <span className="tabular small" style={{ fontWeight: 700 }}>
                    {int(f.kcal)}
                    <span className="muted"> kcal</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null,
      )}
      {needle && groups.every(([, l]) => !l.length) && (
        <Empty icon={<Utensils size={28} />}>
          Nothing called “{q}” yet. Create it once and it’ll show up here from then on.
        </Empty>
      )}
      {!needle && !recent.length && !mine.length && (
        <p className="small muted" style={{ marginTop: 18 }}>
          Type to search {COMMON_FOODS.length} common foods, scan a package, or quick-add calories.
        </p>
      )}
    </div>
  )
}

/** Library first (instant, offline), then Open Food Facts. Found products are saved to My foods. */
async function resolveBarcode(code: string): Promise<Step> {
  const known = live(getDB(), 'foods').find((f) => f.barcode === code)
  if (known) return { kind: 'amount', food: { ...known, source: 'mine' } }
  if (!navigator.onLine) throw new Error('You’re offline — barcode lookup needs a connection.')
  const found = await lookupBarcode(code)
  if (!found) return { kind: 'create', barcode: code }
  const saved = put('foods', { ...found, id: uid() })
  return { kind: 'amount', food: { ...saved, source: 'scan' } }
}

function AmountStep({
  food,
  date,
  meal: initialMeal,
  initial,
  onDone,
  onBack,
}: {
  food: Candidate | FoodLog
  date: DateKey
  meal: Meal
  initial?: FoodLog
  onDone: () => void
  onBack?: () => void
}) {
  const grams = food.servingGrams
  const isPer100 = /^100\s*g$/.test(food.serving)
  const [mode, setMode] = useState<'servings' | 'grams'>(isPer100 ? 'grams' : 'servings')
  const [servings, setServings] = useState<number | null>(initial?.servings ?? 1)
  const [meal, setMeal] = useState<Meal>(initialMeal)
  const amount = mode === 'grams' && grams ? (servings ?? 0) * grams : servings
  const n = servings ?? 0

  const save = () => {
    if (!n) return
    const base = initial ?? { id: uid(), date }
    put('foodLog', {
      ...base,
      meal,
      name: food.name,
      serving: food.serving,
      servingGrams: food.servingGrams,
      servings: n,
      kcal: food.kcal,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      foodId: 'source' in food && food.source !== 'common' ? food.id : initial?.foodId,
    } as FoodLog)
    onDone()
  }

  return (
    <div className="stack">
      <div>
        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{food.name}</div>
        <div className="small muted">
          {'brand' in food && food.brand ? `${food.brand} · ` : ''}
          {food.serving}
          {grams && !isPer100 ? ` (${num(grams)} g)` : ''} = {int(food.kcal)} kcal
        </div>
      </div>

      <div className="form-grid">
        <Field label={mode === 'grams' ? 'Amount (g)' : 'Servings'}>
          <NumberInput
            value={amount}
            autoFocus={matchMedia('(pointer: fine)').matches}
            onChange={(v) => setServings(v == null ? null : mode === 'grams' && grams ? v / grams : v)}
          />
        </Field>
        {grams ? (
          <div className="field">
            <span>Unit</span>
            <Seg
              label="Unit"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'servings', label: 'Servings' },
                { value: 'grams', label: 'Grams' },
              ]}
            />
          </div>
        ) : (
          <div className="field">
            <span>Quick</span>
            <div className="row">
              {[0.5, 1, 2].map((q) => (
                <button key={q} type="button" className="btn btn-sm grow" onClick={() => setServings(q)}>
                  {q === 0.5 ? '½' : q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="notice tabular" style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <span>
          <strong style={{ color: 'var(--ink)', fontSize: '1.15rem' }}>{int(food.kcal * n)}</strong> kcal
        </span>
        <span>P {num(food.protein * n)}</span>
        <span>C {num(food.carbs * n)}</span>
        <span>F {num(food.fat * n)}</span>
      </div>

      <div className="field">
        <span>Meal</span>
        <Seg label="Meal" value={meal} onChange={setMeal} options={MEALS} />
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        {initial ? (
          <ConfirmButton
            onConfirm={() => {
              remove('foodLog', initial.id)
              onDone()
            }}
          >
            <Trash2 size={18} /> Delete
          </ConfirmButton>
        ) : (
          onBack && (
            <button className="btn" onClick={onBack}>
              Back
            </button>
          )
        )}
        <button className="btn btn-accent grow" onClick={save} disabled={!n}>
          {initial ? 'Save' : `Add to ${dayLabel(date).toLowerCase() === 'today' ? 'today' : shortDate(date)}`}
        </button>
      </div>
    </div>
  )
}

function CreateFood({
  barcode,
  name: initialName = '',
  onSaved,
  onBack,
}: {
  barcode?: string
  name?: string
  onSaved: (f: Food) => void
  onBack: () => void
}) {
  const [f, setF] = useState({ name: initialName, brand: '', serving: '1 serving', grams: null as number | null, kcal: null as number | null, protein: null as number | null, carbs: null as number | null, fat: null as number | null })
  const edit = (p: Partial<typeof f>) => setF({ ...f, ...p })
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (!f.name.trim() || f.kcal == null) return
        onSaved(
          put('foods', {
            id: uid(),
            name: f.name.trim(),
            brand: f.brand.trim() || undefined,
            serving: f.serving.trim() || '1 serving',
            servingGrams: f.grams ?? undefined,
            kcal: f.kcal,
            protein: f.protein ?? 0,
            carbs: f.carbs ?? 0,
            fat: f.fat ?? 0,
            barcode,
          }),
        )
      }}
    >
      {barcode && <div className="notice">Barcode {barcode} isn’t in Open Food Facts yet. Enter it from the label once and it’s saved for next time.</div>}
      <div className="form-grid">
        <Field label="Name" className="full">
          <input className="input" value={f.name} onChange={(e) => edit({ name: e.target.value })} required autoFocus />
        </Field>
        <Field label="Brand (optional)" className="full">
          <input className="input" value={f.brand} onChange={(e) => edit({ brand: e.target.value })} />
        </Field>
        <Field label="Serving">
          <input className="input" value={f.serving} onChange={(e) => edit({ serving: e.target.value })} placeholder="1 cup" />
        </Field>
        <Field label="Serving weight">
          <NumberInput value={f.grams} suffix="g" onChange={(v) => edit({ grams: v })} />
        </Field>
        <Field label="Calories" className="full">
          <NumberInput value={f.kcal} suffix="kcal" decimals={false} onChange={(v) => edit({ kcal: v })} />
        </Field>
        <Field label="Protein">
          <NumberInput value={f.protein} suffix="g" onChange={(v) => edit({ protein: v })} />
        </Field>
        <Field label="Carbs">
          <NumberInput value={f.carbs} suffix="g" onChange={(v) => edit({ carbs: v })} />
        </Field>
        <Field label="Fat">
          <NumberInput value={f.fat} suffix="g" onChange={(v) => edit({ fat: v })} />
        </Field>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
        <button className="btn btn-accent grow" disabled={!f.name.trim() || f.kcal == null}>
          Save food
        </button>
      </div>
    </form>
  )
}

function QuickAdd({ date, meal: initialMeal, onDone }: { date: DateKey; meal: Meal; onDone: () => void }) {
  const [name, setName] = useState('')
  const [n, setN] = useState<Nutrition>({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
  const [meal, setMeal] = useState(initialMeal)
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (!n.kcal) return
        put('foodLog', { id: uid(), date, meal, name: name.trim() || 'Quick add', serving: '1 serving', servings: 1, ...n })
        onDone()
      }}
    >
      <div className="form-grid">
        <Field label="Calories" className="full">
          <NumberInput value={n.kcal || null} suffix="kcal" decimals={false} autoFocus onChange={(v) => setN({ ...n, kcal: v ?? 0 })} />
        </Field>
        <Field label="Protein">
          <NumberInput value={n.protein || null} suffix="g" onChange={(v) => setN({ ...n, protein: v ?? 0 })} />
        </Field>
        <Field label="Carbs">
          <NumberInput value={n.carbs || null} suffix="g" onChange={(v) => setN({ ...n, carbs: v ?? 0 })} />
        </Field>
        <Field label="Fat">
          <NumberInput value={n.fat || null} suffix="g" onChange={(v) => setN({ ...n, fat: v ?? 0 })} />
        </Field>
        <Field label="Label (optional)">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Restaurant lunch" />
        </Field>
      </div>
      <div className="field">
        <span>Meal</span>
        <Seg label="Meal" value={meal} onChange={setMeal} options={MEALS} />
      </div>
      <button className="btn btn-accent btn-block" disabled={!n.kcal}>
        Add {n.kcal ? `${int(n.kcal)} kcal` : ''}
      </button>
    </form>
  )
}

// ---------- Camera scanning (Chrome on Android has BarcodeDetector built in) ----------

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}

function Scanner({ onResult, onBack }: { onResult: (s: Step) => void; onBack: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState('Starting camera…')
  const [error, setError] = useState('')

  useEffect(() => {
    let stream: MediaStream | null = null
    let stopped = false
    let raf = 0
    ;(async () => {
      try {
        const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector
        const detector = new Ctor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stopped) return
        const v = video.current!
        v.srcObject = stream
        await v.play()
        setStatus('Point at the barcode')
        let busy = false
        const loop = async () => {
          if (stopped) return
          if (!busy && v.readyState >= 2) {
            busy = true
            try {
              const codes = await detector.detect(v)
              if (codes[0]?.rawValue) {
                stopped = true
                navigator.vibrate?.(60)
                setStatus(`Found ${codes[0].rawValue} — looking it up…`)
                stream?.getTracks().forEach((t) => t.stop())
                try {
                  onResult(await resolveBarcode(codes[0].rawValue))
                } catch (e) {
                  setError((e as Error).message)
                }
                return
              }
            } catch {}
            busy = false
          }
          raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
      } catch (e) {
        setError((e as Error).name === 'NotAllowedError' ? 'Camera permission was denied.' : `Couldn’t start the camera: ${(e as Error).message}`)
      }
    })()
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="stack">
      <div className="scanner">
        <video ref={video} playsInline muted />
      </div>
      <div className="small ink-2" style={{ textAlign: 'center' }}>
        {status}
      </div>
      {error && <div className="notice error">{error}</div>}
      <button className="btn btn-block" onClick={onBack}>
        Back
      </button>
    </div>
  )
}
