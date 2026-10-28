import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CloudCheck, CloudOff, Copy, Download, MonitorSmartphone, RefreshCw, Upload } from 'lucide-react'
import { ConfirmButton, Field, NumberInput, Seg } from '../components/ui'
import { absorb, getDB, replaceAll, updateSettings, useDB } from '../lib/store'
import { clientId, loadGIS, setClientId } from '../lib/drive'
import { disableSync, enableSync, syncNow, useSync } from '../lib/sync'
import { normalize } from '../lib/merge'
import { emptyDB } from '../lib/defaults'
import { int, plural, todayKey } from '../lib/format'
import { isInstalled, promptInstall, useInstallPrompt } from '../lib/install'
import type { DB } from '../lib/types'

export default function SettingsScreen() {
  const db = useDB()
  const s = db.settings
  return (
    <div className="rise">
      <SyncCard />

      <Section title="Daily goals">
        <div className="form-grid">
          <Field label="Calories" className="full">
            <NumberInput value={s.calorieGoal} suffix="kcal" decimals={false} onChange={(v) => v && updateSettings({ calorieGoal: v })} />
          </Field>
          <Field label="Protein">
            <NumberInput value={s.proteinGoal} suffix="g" decimals={false} onChange={(v) => v != null && updateSettings({ proteinGoal: v })} />
          </Field>
          <Field label="Carbs">
            <NumberInput value={s.carbsGoal} suffix="g" decimals={false} onChange={(v) => v != null && updateSettings({ carbsGoal: v })} />
          </Field>
          <Field label="Fat">
            <NumberInput value={s.fatGoal} suffix="g" decimals={false} onChange={(v) => v != null && updateSettings({ fatGoal: v })} />
          </Field>
          <div className="field">
            <span>Macros add up to</span>
            <div className="input tabular" style={{ display: 'flex', alignItems: 'center', background: 'transparent' }}>
              {int(s.proteinGoal * 4 + s.carbsGoal * 4 + s.fatGoal * 9)} kcal
            </div>
          </div>
        </div>
        <label className="switch" style={{ marginTop: 12 }}>
          <span>
            Add cardio calories to the day’s budget
            <div className="small muted">Uses the calories you enter on cardio sessions.</div>
          </span>
          <input type="checkbox" checked={s.eatBackCardio} onChange={(e) => updateSettings({ eatBackCardio: e.target.checked })} />
        </label>
      </Section>

      <Section title="Units">
        <div className="stack">
          <Row label="Weight">
            <Seg label="Weight unit" value={s.weightUnit} onChange={(v) => updateSettings({ weightUnit: v })} options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} />
          </Row>
          <Row label="Distance">
            <Seg label="Distance unit" value={s.distanceUnit} onChange={(v) => updateSettings({ distanceUnit: v })} options={[{ value: 'mi', label: 'mi' }, { value: 'km', label: 'km' }]} />
          </Row>
          <Row label="Body measurements">
            <Seg label="Length unit" value={s.lengthUnit} onChange={(v) => updateSettings({ lengthUnit: v })} options={[{ value: 'in', label: 'in' }, { value: 'cm', label: 'cm' }]} />
          </Row>
        </div>
      </Section>

      <Section title="Workouts">
        <Row label="Rest timer after each set">
          <div style={{ width: 130 }}>
            <NumberInput value={s.restSeconds} suffix="sec" decimals={false} onChange={(v) => v != null && updateSettings({ restSeconds: Math.max(0, Math.min(900, v)) })} />
          </div>
        </Row>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          Set to 0 to turn the timer off.
        </p>
      </Section>

      <Section title="Appearance">
        <Row label="Theme">
          <ThemePicker />
        </Row>
      </Section>

      <DataCard />
      <InstallCard />
    </div>
  )
}

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>{title}</h2>
        {right}
      </div>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="spread" style={{ flexWrap: 'wrap' }}>
      <span>{label}</span>
      <div style={{ minWidth: 140 }}>{children}</div>
    </div>
  )
}

function ThemePicker() {
  const read = () => {
    try {
      return (localStorage.getItem('chalk.theme') as 'light' | 'dark' | null) ?? 'system'
    } catch {
      return 'system'
    }
  }
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(read)
  const apply = (t: 'system' | 'light' | 'dark') => {
    setTheme(t)
    try {
      if (t === 'system') localStorage.removeItem('chalk.theme')
      else localStorage.setItem('chalk.theme', t)
    } catch {}
    if (t === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = t
  }
  return (
    <Seg
      label="Theme"
      value={theme}
      onChange={apply}
      options={[
        { value: 'system', label: 'Auto' },
        { value: 'dark', label: 'Dark' },
        { value: 'light', label: 'Light' },
      ]}
    />
  )
}

// ---------- Google Drive sync ----------

function SyncCard() {
  const sync = useSync()
  const [id, setId] = useState(clientId())
  const [editingId, setEditingId] = useState(!clientId())
  const [copied, setCopied] = useState(false)
  const origin = location.origin

  // Load Google's sign-in script ahead of time: the consent popup must open
  // right after a tap, or the browser treats it as an unrequested popup.
  useEffect(() => {
    if (clientId()) void loadGIS().catch(() => {})
  }, [editingId])

  const status =
    sync.phase === 'off'
      ? 'Off — data stays on this device only.'
      : sync.phase === 'syncing'
        ? 'Syncing…'
        : sync.phase === 'needs-auth'
          ? 'Signed out of Google — tap Sync now to sign back in.'
          : sync.phase === 'error'
            ? `Last attempt failed: ${sync.error}`
            : sync.lastSync
              ? `Synced ${new Date(sync.lastSync).toLocaleString()}${sync.pending ? ' · changes waiting' : ''}`
              : 'Connected'

  return (
    <Section
      title="Sync with Google Drive"
      right={sync.phase === 'off' ? <CloudOff size={20} className="muted" /> : <CloudCheck size={20} style={{ color: 'var(--good-text)' }} />}
    >
      <p className="small ink-2" style={{ marginTop: 0 }}>
        Chalk keeps a copy of your log in a hidden app folder in your Google Drive. Changes on your phone and PC are merged entry by entry, so logging on both never overwrites anything. It only has access to its own file, not the rest of your Drive.
      </p>

      {editingId ? (
        <div className="stack">
          <ClientIdHelp origin={origin} onCopy={() => (navigator.clipboard?.writeText(origin), setCopied(true))} copied={copied} />
          <Field label="OAuth client ID">
            <input className="input" value={id} placeholder="1234-abc.apps.googleusercontent.com" onChange={(e) => setId(e.target.value.trim())} spellCheck={false} />
          </Field>
          <div className="row">
            {clientId() && (
              <button className="btn" onClick={() => (setId(clientId()), setEditingId(false))}>
                Cancel
              </button>
            )}
            <button
              className="btn btn-primary grow"
              disabled={!/\.apps\.googleusercontent\.com$/.test(id)}
              onClick={() => {
                setClientId(id)
                setEditingId(false)
              }}
            >
              Save client ID
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className={`notice ${sync.phase === 'error' ? 'error' : ''}`}>
            <div>{status}</div>
            {sync.email && sync.phase !== 'off' && <div className="small muted">{sync.email}</div>}
          </div>
          {sync.phase === 'off' ? (
            <button className="btn btn-primary btn-block" onClick={() => void enableSync()}>
              Connect Google Drive
            </button>
          ) : (
            <div className="row">
              <button className="btn btn-primary grow" onClick={() => void syncNow(true)} disabled={sync.phase === 'syncing'}>
                <RefreshCw size={16} className={sync.phase === 'syncing' ? 'spin' : ''} /> Sync now
              </button>
              <ConfirmButton className="btn" onConfirm={disableSync} confirmLabel="Disconnect?">
                Disconnect
              </ConfirmButton>
            </div>
          )}
          {sync.phase === 'off' && sync.error && <div className="notice error">{sync.error}</div>}
          <button className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => setEditingId(true)}>
            Change client ID
          </button>
          <p className="small muted" style={{ margin: 0 }}>
            Google sign-ins last an hour. Chalk syncs on its own while you’re signed in. After that, tap the sync button at the top to sign back in.
          </p>
        </div>
      )}
    </Section>
  )
}

function ClientIdHelp({ origin, onCopy, copied }: { origin: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="notice">
      <strong style={{ color: 'var(--ink)' }}>One-time setup (about 5 minutes).</strong> Google needs an OAuth client ID that says this app may use your Drive:
      <ol className="steps">
        <li>
          Open <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud Console</a> and create a project (any name).
        </li>
        <li>
          Enable the <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer">Google Drive API</a>.
        </li>
        <li>
          Under <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer">Google Auth Platform</a>, set up the consent screen. Choose <em>Internal</em> if you use Google Workspace. Otherwise choose <em>External</em> and add yourself as a test user.
        </li>
        <li>
          In <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Clients</a>, create a client of type <em>Web application</em>. Under Authorized JavaScript origins, add:
          <div className="row" style={{ marginTop: 6 }}>
            <code>{origin}</code>
            <button className="btn btn-sm" onClick={onCopy} type="button">
              <Copy size={14} /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </li>
        <li>Copy the client ID and paste it below. Do this on each device (or bake it into the build), using the same ID.</li>
      </ol>
    </div>
  )
}

// ---------- Export / import ----------

function DataCard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const db = useDB()
  const counts = (['workouts', 'cardio', 'body', 'foodLog'] as const).map((c) => Object.values(db[c]).filter((r) => !r.deleted).length)

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(getDB(), null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `chalk-backup-${todayKey()}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <Section title="Your data">
      <p className="small ink-2" style={{ marginTop: 0 }}>
        {plural(counts[0], 'workout')} · {plural(counts[1], 'cardio session')} · {plural(counts[2], 'weigh-in')} · {plural(counts[3], 'food entry', 'food entries')}, stored on this device.
      </p>
      <div className="row-wrap">
        <button className="btn" onClick={exportJSON}>
          <Download size={16} /> Export backup
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> Import backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              const data = normalize(JSON.parse(await f.text()) as Partial<DB>)
              setMsg(absorb(data) ? 'Imported and merged with what was already here.' : 'Nothing new in that file.')
            } catch {
              setMsg('That file isn’t a Chalk backup.')
            }
          }}
        />
      </div>
      {msg && <div className="notice" style={{ marginTop: 10 }}>{msg}</div>}
      <hr className="rule" />
      <ConfirmButton className="btn btn-danger" confirmLabel="Erase everything on this device?" onConfirm={() => void replaceAll(emptyDB()).then(() => setMsg('This device was reset.'))}>
        Erase data on this device
      </ConfirmButton>
      <p className="small muted" style={{ marginBottom: 0 }}>
        If sync is on, your data comes back from Drive on the next sync. Export a backup first if you want a copy.
      </p>
    </Section>
  )
}

function InstallCard() {
  const prompt = useInstallPrompt()
  if (isInstalled()) return null
  return (
    <Section title="Install the app" right={<MonitorSmartphone size={20} className="muted" />}>
      {prompt ? (
        <button className="btn btn-primary btn-block" onClick={() => void promptInstall()}>
          Install Chalk on this device
        </button>
      ) : (
        <ul className="steps" style={{ marginTop: 0 }}>
          <li>
            <strong>Android (Chrome):</strong> open the ⋮ menu and tap <em>Add to Home screen</em>, then <em>Install</em>.
          </li>
          <li>
            <strong>Windows (Edge):</strong> open the … menu, then <em>Apps</em> → <em>Install this site as an app</em>. In Chrome, use the install icon in the address bar.
          </li>
        </ul>
      )}
      <p className="small muted" style={{ marginBottom: 0 }}>
        Once installed it opens in its own window, works offline, and appears in your Start menu or app drawer.
      </p>
    </Section>
  )
}
