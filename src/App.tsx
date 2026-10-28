import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { CloudCheck, Dumbbell, Footprints, House, RefreshCw, Scale, Settings as Gear, Utensils } from 'lucide-react'
import { match, navigate, useRoute } from './lib/router'
import { syncNow, useSync } from './lib/sync'
import { addRest, stopRest, useRest } from './lib/timer'
import { stopwatch } from './lib/format'
import Today from './screens/Today'
import Lift from './screens/Lift'
import WorkoutEditor from './screens/WorkoutEditor'
import ExerciseDetail from './screens/ExerciseDetail'
import CardioScreen from './screens/Cardio'
import FoodScreen from './screens/Food'
import BodyScreen from './screens/Body'
import SettingsScreen from './screens/Settings'

const TABS = [
  { path: '/', label: 'Today', icon: House, accent: 'var(--chalk)' },
  { path: '/lift', label: 'Lift', icon: Dumbbell, accent: 'var(--lift)' },
  { path: '/cardio', label: 'Cardio', icon: Footprints, accent: 'var(--cardio)' },
  { path: '/food', label: 'Food', icon: Utensils, accent: 'var(--food)' },
  { path: '/body', label: 'Body', icon: Scale, accent: 'var(--body)' },
] as const

function resolve(path: string): { title: string; accent: string; tab: string; screen: ReactNode } {
  let p: Record<string, string> | null
  if ((p = match('/lift/w/:id', path))) return { title: 'Workout', accent: 'var(--lift)', tab: '/lift', screen: <WorkoutEditor id={p.id} /> }
  if ((p = match('/lift/x/:id', path))) return { title: 'Exercise', accent: 'var(--lift)', tab: '/lift', screen: <ExerciseDetail id={p.id} /> }
  if (path.startsWith('/lift')) return { title: 'Lift', accent: 'var(--lift)', tab: '/lift', screen: <Lift /> }
  if (path.startsWith('/cardio')) return { title: 'Cardio', accent: 'var(--cardio)', tab: '/cardio', screen: <CardioScreen /> }
  if ((p = match('/food/:date', path))) return { title: 'Food', accent: 'var(--food)', tab: '/food', screen: <FoodScreen date={p.date} /> }
  if (path.startsWith('/food')) return { title: 'Food', accent: 'var(--food)', tab: '/food', screen: <FoodScreen /> }
  if (path.startsWith('/body')) return { title: 'Body', accent: 'var(--body)', tab: '/body', screen: <BodyScreen /> }
  if (path.startsWith('/settings')) return { title: 'Settings', accent: 'var(--chalk)', tab: '/settings', screen: <SettingsScreen /> }
  return { title: 'Today', accent: 'var(--chalk)', tab: '/', screen: <Today /> }
}

export default function App() {
  const path = useRoute()
  const { title, accent, tab, screen } = resolve(path)

  return (
    <div className="shell" style={{ '--accent': accent } as CSSProperties}>
      <nav className="rail" aria-label="Sections">
        <div className="knurl" />
        <div className="rail-brand display">
          <Plate /> Chalk
        </div>
        {TABS.map((t) => (
          <a
            key={t.path}
            href={`#${t.path}`}
            aria-current={tab === t.path ? 'page' : undefined}
            style={{ '--tab-accent': t.accent } as CSSProperties}
          >
            <t.icon size={20} /> {t.label}
          </a>
        ))}
        <div className="spacer" />
        <a
          href="#/settings"
          aria-current={tab === '/settings' ? 'page' : undefined}
          style={{ '--tab-accent': 'var(--chalk)' } as CSSProperties}
        >
          <Gear size={20} /> Settings
        </a>
      </nav>

      <div>
        <header className="topbar">
          <div className="knurl" />
          <div className="topbar-row">
            <h1 className="topbar-title display">
              <span className="plate-dot" aria-hidden />
              {title}
            </h1>
            <SyncPill />
            <button
              className="icon-btn mobile-only"
              aria-label="Settings"
              onClick={() => navigate('/settings')}
            >
              <Gear size={20} />
            </button>
          </div>
        </header>
        <main className="main" key={path.split('?')[0]}>
          {screen}
        </main>
      </div>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t) => (
          <a
            key={t.path}
            className="tab"
            href={`#${t.path}`}
            aria-current={tab === t.path ? 'page' : undefined}
            style={{ '--tab-accent': t.accent } as CSSProperties}
          >
            <t.icon size={22} />
            {t.label}
          </a>
        ))}
      </nav>

      <RestTimer />
    </div>
  )
}

export function Plate({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="var(--lift)" />
      <circle cx="16" cy="16" r="10.5" fill="var(--bg-deep)" />
      <circle cx="16" cy="16" r="7.5" fill="var(--chalk)" />
      <circle cx="16" cy="16" r="2.8" fill="var(--bg-deep)" />
    </svg>
  )
}

function ago(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function SyncPill() {
  const s = useSync()
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  if (s.phase === 'off') return null

  let body: ReactNode
  let attention = false
  if (s.phase === 'syncing') body = (<><RefreshCw size={14} className="spin" /> Syncing</>)
  else if (s.phase === 'needs-auth') {
    attention = true
    body = (<><span className="dot" /> Tap to sync</>)
  } else if (s.phase === 'error') {
    attention = true
    body = (<><span className="dot" /> Sync failed — retry</>)
  } else if (s.pending) body = (<><RefreshCw size={14} /> Pending</>)
  else body = (<><CloudCheck size={14} /> {s.lastSync ? ago(s.lastSync) : 'Synced'}</>)

  return (
    <button
      className={`sync-pill ${attention ? 'attention' : ''}`}
      onClick={() => void syncNow(true)}
      title={s.error ?? (s.lastSync ? `Last synced ${new Date(s.lastSync).toLocaleString()}` : 'Sync with Google Drive')}
    >
      {body}
    </button>
  )
}

function RestTimer() {
  const { endsAt } = useRest()
  const [, force] = useState(0)
  useEffect(() => {
    if (!endsAt) return
    const t = setInterval(() => force((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [endsAt])
  if (!endsAt) return null
  const left = (endsAt - Date.now()) / 1000
  return (
    <div className="timer-bar" role="timer" aria-live="off">
      <span className="eyebrow" style={{ color: 'inherit', opacity: 0.7 }}>
        Rest
      </span>
      <span className="t">{stopwatch(Math.ceil(left))}</span>
      <button onClick={() => addRest(-15)}>−15</button>
      <button onClick={() => addRest(15)}>+15</button>
      <button onClick={stopRest}>Skip</button>
    </div>
  )
}
