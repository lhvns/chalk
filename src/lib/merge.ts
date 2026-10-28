import { COLLECTIONS, type Base, type DB } from './types'
import { emptyDB } from './defaults'

/** Picks the newer of two versions of a record; ties resolve deterministically. */
function newer<T extends Base>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b
  // Same timestamp from two devices: prefer the tombstone, then a stable order,
  // so every device reaches the same answer.
  if (!!a.deleted !== !!b.deleted) return a.deleted ? a : b
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b
}

function mergeCollection<T extends Base>(a: Record<string, T>, b: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = { ...a }
  for (const [id, rb] of Object.entries(b)) {
    const ra = out[id]
    out[id] = ra ? newer(ra, rb) : rb
  }
  return out
}

/**
 * Merges two copies of the database record by record. It is commutative and
 * idempotent, so devices can sync in any order and converge.
 */
export function merge(a: DB, b: DB): DB {
  const out = emptyDB()
  for (const c of COLLECTIONS) {
    ;(out[c] as Record<string, Base>) = mergeCollection(
      (a[c] ?? {}) as Record<string, Base>,
      (b[c] ?? {}) as Record<string, Base>,
    )
  }
  out.settings = { ...out.settings, ...newer(a.settings ?? out.settings, b.settings ?? out.settings) }
  return out
}

/** Cheap structural comparison used to skip no-op writes and uploads. */
export function sameDB(a: DB, b: DB): boolean {
  if (a.settings.updatedAt !== b.settings.updatedAt) return false
  for (const c of COLLECTIONS) {
    const ra = a[c] as Record<string, Base>
    const rb = b[c] as Record<string, Base>
    const ka = Object.keys(ra)
    if (ka.length !== Object.keys(rb).length) return false
    for (const k of ka) {
      if (!rb[k] || rb[k].updatedAt !== ra[k].updatedAt || !!rb[k].deleted !== !!ra[k].deleted) return false
    }
  }
  return true
}

/** Fills in anything missing from data written by an older or partial copy. */
export function normalize(raw: Partial<DB> | null | undefined): DB {
  const base = emptyDB()
  if (!raw || typeof raw !== 'object') return base
  return merge(base, { ...base, ...raw, settings: { ...base.settings, ...(raw.settings ?? {}) } } as DB)
}
