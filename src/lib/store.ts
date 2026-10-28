import { useSyncExternalStore } from 'react'
import { createStore, get, update } from 'idb-keyval'
import { merge, normalize, sameDB } from './merge'
import { emptyDB } from './defaults'
import type { CollectionName, DB, RecordOf, Settings } from './types'

const KEY = 'chalk-db'
// Own database name, so other apps served from the same origin (e.g. localhost
// during development) can never collide with Chalk's data.
const idb = typeof indexedDB !== 'undefined' ? createStore('chalk', 'data') : undefined
const DIRTY_KEY = 'chalk.lastLocalChange'

let db: DB = emptyDB()
let loaded = false
const listeners = new Set<() => void>()
const changeHooks = new Set<() => void>()
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('chalk') : null

function emit() {
  for (const l of listeners) l()
}

export const getDB = () => db
export const isLoaded = () => loaded

export function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getDB)
}

/** Called after every local edit — sync listens here to schedule an upload. */
export function onLocalChange(fn: () => void) {
  changeHooks.add(fn)
  return () => changeHooks.delete(fn)
}

export async function loadDB() {
  try {
    db = normalize(await get(KEY, idb))
  } catch (e) {
    console.error('Could not read local data', e)
  }
  loaded = true
  emit()
}

// ---------- persistence ----------

let saveTimer: ReturnType<typeof setTimeout> | undefined

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flush, 200)
}

/**
 * Writes to IndexedDB as a read-merge-write inside one transaction, so two
 * open tabs can never overwrite each other's records.
 */
export async function flush() {
  clearTimeout(saveTimer)
  const snapshot = db
  try {
    await update(KEY, (old) => (old ? merge(normalize(old as Partial<DB>), snapshot) : snapshot), idb)
    channel?.postMessage('changed')
  } catch (e) {
    console.error('Could not save local data', e)
  }
}

channel?.addEventListener('message', async () => {
  const stored = normalize(await get(KEY, idb))
  const merged = merge(db, stored)
  if (!sameDB(merged, db)) {
    db = merged
    emit()
  }
})

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
}

// ---------- mutations ----------

let lastStamp = 0
/**
 * Strictly increasing per device, and always later than the version being
 * replaced — so an edit beats what it was based on even if the other
 * device's clock runs ahead of ours.
 */
function stamp(replacing = 0) {
  lastStamp = Math.max(Date.now(), lastStamp + 1, replacing + 1)
  return lastStamp
}

function commit(next: DB) {
  db = next
  emit()
  scheduleSave()
  try {
    localStorage.setItem(DIRTY_KEY, String(Date.now()))
  } catch {}
  for (const h of changeHooks) h()
}

export const lastLocalChange = () => {
  try {
    return Number(localStorage.getItem(DIRTY_KEY) ?? 0)
  } catch {
    return 0
  }
}

type Draft<C extends CollectionName> = Omit<RecordOf<C>, 'updatedAt'> & { updatedAt?: number }

export function put<C extends CollectionName>(collection: C, record: Draft<C>) {
  const r = { ...record, updatedAt: stamp(db[collection][record.id]?.updatedAt) } as RecordOf<C>
  commit({ ...db, [collection]: { ...db[collection], [r.id]: r } })
  return r
}

export function remove<C extends CollectionName>(collection: C, id: string) {
  const r = db[collection][id]
  if (r) put(collection, { ...r, deleted: true } as unknown as Draft<C>)
}

export function updateSettings(patch: Partial<Settings>) {
  commit({ ...db, settings: { ...db.settings, ...patch, updatedAt: stamp(db.settings.updatedAt) } })
}

/** Folds in data from elsewhere (cloud, an imported file) without counting it as a local edit. */
export function absorb(other: DB) {
  const merged = merge(db, other)
  if (sameDB(merged, db)) return false
  db = merged
  emit()
  scheduleSave()
  return true
}

export function replaceAll(next: DB) {
  db = next
  emit()
  clearTimeout(saveTimer)
  return update(KEY, () => next, idb)
}

/** Live (non-deleted) records of a collection. */
export function live<C extends CollectionName>(d: DB, collection: C): RecordOf<C>[] {
  return Object.values(d[collection]).filter((r) => !r.deleted) as RecordOf<C>[]
}
