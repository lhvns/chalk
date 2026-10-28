import { useSyncExternalStore } from 'react'
import * as drive from './drive'
import { merge, normalize, sameDB } from './merge'
import { absorb, flush, getDB, lastLocalChange, onLocalChange } from './store'
import type { DB } from './types'

export type SyncPhase = 'off' | 'idle' | 'syncing' | 'needs-auth' | 'error'

export interface SyncState {
  phase: SyncPhase
  lastSync: number
  error?: string
  email?: string
  /** Local edits made since the last successful sync. */
  pending: boolean
}

const ENABLED_KEY = 'chalk.syncEnabled'
const LAST_KEY = 'chalk.lastSync'

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string | null) => {
  try {
    if (v == null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {}
}

export const syncEnabled = () => read(ENABLED_KEY) === '1'

let state: SyncState = {
  phase: syncEnabled() ? 'idle' : 'off',
  lastSync: Number(read(LAST_KEY) ?? 0),
  email: drive.storedToken()?.email,
  pending: false,
}
state.pending = lastLocalChange() > state.lastSync

const listeners = new Set<() => void>()
function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export const useSync = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => state,
  )

// ---------- the sync itself ----------

let running: Promise<void> | null = null
let again = false

/**
 * Pull → merge → push. `interactive` means we're inside a tap and may open
 * Google's sign-in popup; background syncs only run with a still-valid token.
 */
export function syncNow(interactive = false): Promise<void> {
  if (!syncEnabled()) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        await syncOnce(interactive)
      } while (again)
    } finally {
      running = null
    }
  })()
  return running
}

async function syncOnce(interactive: boolean, retried = false): Promise<void> {
  let token = drive.validToken()
  if (!token) {
    if (!interactive) {
      set({ phase: 'needs-auth' })
      return
    }
    try {
      token = await drive.signIn()
      set({ email: drive.storedToken()?.email })
    } catch (e) {
      set({ phase: 'needs-auth', error: (e as Error).message })
      return
    }
  }
  const started = Date.now()
  set({ phase: 'syncing', error: undefined })
  try {
    await flush()
    await exchange(token)
    write(LAST_KEY, String(started))
    set({ phase: 'idle', lastSync: started, pending: lastLocalChange() > started })
  } catch (e) {
    if (e instanceof drive.AuthRequired) {
      set({ phase: 'needs-auth' })
      if (interactive && !retried) return syncOnce(true, true)
    } else {
      set({ phase: 'error', error: (e as Error).message })
    }
  }
}

async function exchange(token: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const files = await drive.listFiles(token)
    let remote: DB | null = null
    let version: string | undefined
    for (const f of files) {
      const data = normalize((await drive.download(token, f.id)) as Partial<DB>)
      remote = remote ? merge(remote, data) : data
    }
    const [primary, ...extras] = files
    if (primary) version = primary.version

    const merged = remote ? merge(getDB(), remote) : getDB()
    if (!primary) {
      await drive.create(token, merged)
    } else if (extras.length || !remote || !sameDB(merged, remote)) {
      // Another device may have written while we merged; if so, go round again
      // so its changes are folded in instead of overwritten.
      if ((await drive.fileVersion(token, primary.id)) !== version) continue
      await drive.overwrite(token, primary.id, merged)
      // Two devices that synced for the very first time at once can each create
      // a file; everything is merged into the oldest one now, so drop the rest.
      for (const x of extras) await drive.removeFile(token, x.id)
    }
    absorb(merged)
    return
  }
  throw new Error('The sync file kept changing — try again in a moment.')
}

// ---------- turning sync on and off ----------

export async function enableSync() {
  write(ENABLED_KEY, '1')
  set({ phase: 'idle', error: undefined })
  await syncNow(true)
  if (state.phase === 'needs-auth' && !drive.validToken()) {
    // Consent was cancelled — don't leave a half-enabled state behind.
    write(ENABLED_KEY, null)
    set({ phase: 'off' })
  }
}

export function disableSync() {
  drive.signOut()
  write(ENABLED_KEY, null)
  write(LAST_KEY, null)
  set({ phase: 'off', email: undefined, error: undefined, lastSync: 0 })
}

// ---------- background scheduling ----------

let debounce: ReturnType<typeof setTimeout> | undefined

export function startAutoSync() {
  if (syncEnabled()) void drive.loadGIS().catch(() => {})

  onLocalChange(() => {
    set({ pending: true })
    clearTimeout(debounce)
    debounce = setTimeout(() => void syncNow(false), 4000)
  })

  document.addEventListener('visibilitychange', () => {
    // Coming back to the app pulls the other device's changes; leaving it
    // pushes ours while the token is still good.
    void syncNow(false)
  })
  window.addEventListener('online', () => void syncNow(false))
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow(false)
  }, 5 * 60_000)

  void syncNow(false)
}
