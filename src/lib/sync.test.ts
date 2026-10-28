// Two simulated devices syncing through an in-memory fake of Google Drive.
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Device = { idb: unknown; ls: Map<string, string> }
type FakeFile = { id: string; version: number; body: string }
const g = globalThis as unknown as {
  drive: { files: Map<string, FakeFile>; n: number; beforeOverwrite?: () => void; beforeVersion?: () => void }
  device: Device
  localStorage: Storage
}

vi.mock('idb-keyval', () => ({
  createStore: () => undefined,
  get: async () => g.device.idb,
  update: async (_k: string, fn: (old: unknown) => unknown) => {
    g.device.idb = fn(g.device.idb)
  },
}))

vi.mock('./drive', () => ({
  AuthRequired: class extends Error {},
  validToken: () => 'token',
  storedToken: () => ({ token: 'token', exp: Date.now() + 3_600_000 }),
  signIn: async () => 'token',
  loadGIS: async () => {},
  listFiles: async () => [...g.drive.files.values()].map((f) => ({ id: f.id, version: String(f.version) })),
  fileVersion: async (_t: string, id: string) => {
    g.drive.beforeVersion?.()
    return String(g.drive.files.get(id)!.version)
  },
  download: async (_t: string, id: string) => JSON.parse(g.drive.files.get(id)!.body),
  create: async (_t: string, data: unknown) => {
    const id = `file${++g.drive.n}`
    g.drive.files.set(id, { id, version: 1, body: JSON.stringify(data) })
    return { id, version: '1' }
  },
  overwrite: async (_t: string, id: string, data: unknown) => {
    g.drive.beforeOverwrite?.()
    const f = g.drive.files.get(id)!
    f.version++
    f.body = JSON.stringify(data)
    return { id, version: String(f.version) }
  },
  removeFile: async (_t: string, id: string) => void g.drive.files.delete(id),
}))

g.localStorage = {
  getItem: (k: string) => g.device.ls.get(k) ?? null,
  setItem: (k: string, v: string) => void g.device.ls.set(k, v),
  removeItem: (k: string) => void g.device.ls.delete(k),
} as Storage

/** Loads a fresh copy of the app's modules bound to one device's storage. */
async function boot() {
  const device: Device = { idb: undefined, ls: new Map([['chalk.syncEnabled', '1']]) }
  g.device = device
  vi.resetModules()
  const store = await import('./store')
  const sync = await import('./sync')
  await store.loadDB()
  // Every call runs with this device's storage active.
  const on =
    <A extends unknown[], R>(fn: (...a: A) => R) =>
    (...a: A) => {
      g.device = device
      return fn(...a)
    }
  return {
    put: on(store.put),
    remove: on(store.remove),
    sync: on(() => sync.syncNow(false)),
    db: on(store.getDB),
    state: on(() => sync.useSync),
  }
}

const run = (id: string, durationMin = 30) => ({ id, date: '2026-10-15', type: 'run' as const, durationMin })

beforeEach(() => {
  g.drive = { files: new Map(), n: 0 }
})

describe('sync between two devices', () => {
  it('creates the file on first sync and carries data across', async () => {
    const phone = await boot()
    phone.put('cardio', run('a'))
    await phone.sync()
    expect(g.drive.files.size).toBe(1)

    const pc = await boot()
    pc.put('cardio', run('b'))
    await pc.sync()
    expect(Object.keys(pc.db().cardio).sort()).toEqual(['a', 'b'])

    await phone.sync()
    expect(Object.keys(phone.db().cardio).sort()).toEqual(['a', 'b'])
    expect(g.drive.files.size).toBe(1)
  })

  it('propagates edits and deletes, newest wins', async () => {
    const phone = await boot()
    const pc = await boot()
    phone.put('cardio', run('a', 30))
    await phone.sync()
    await pc.sync()

    pc.put('cardio', run('a', 45))
    await pc.sync()
    await phone.sync()
    expect(phone.db().cardio.a.durationMin).toBe(45)

    phone.remove('cardio', 'a')
    await phone.sync()
    await pc.sync()
    expect(pc.db().cardio.a.deleted).toBe(true)
  })

  it('re-merges when another device writes between our download and upload', async () => {
    const phone = await boot()
    const pc = await boot()
    phone.put('cardio', run('a'))
    await phone.sync()

    pc.put('cardio', run('b'))
    let raced = false
    g.drive.beforeVersion = () => {
      if (raced) return
      raced = true
      const f = [...g.drive.files.values()][0]
      const data = JSON.parse(f.body)
      data.cardio.c = { ...run('c'), updatedAt: Date.now() }
      f.body = JSON.stringify(data)
      f.version++
    }
    await pc.sync()
    g.drive.beforeVersion = undefined

    const remote = JSON.parse([...g.drive.files.values()][0].body)
    expect(Object.keys(remote.cardio).sort()).toEqual(['a', 'b', 'c'])
    expect(Object.keys(pc.db().cardio).sort()).toEqual(['a', 'b', 'c'])
  })

  it('a write clobbered in the last instant comes back on that device’s next sync', async () => {
    const phone = await boot()
    const pc = await boot()
    await phone.sync()
    phone.put('cardio', run('c'))
    pc.put('cardio', run('b'))
    // The phone's upload lands after the PC's version check but before its write.
    g.drive.beforeOverwrite = () => {
      g.drive.beforeOverwrite = undefined
      const f = [...g.drive.files.values()][0]
      f.body = JSON.stringify(phone.db())
      f.version++
    }
    await pc.sync()
    let remote = JSON.parse([...g.drive.files.values()][0].body)
    expect(remote.cardio.c).toBeUndefined()

    await phone.sync()
    remote = JSON.parse([...g.drive.files.values()][0].body)
    expect(Object.keys(remote.cardio).sort()).toEqual(['b', 'c'])
  })

  it('folds duplicate files from simultaneous first syncs into one', async () => {
    const phone = await boot()
    const pc = await boot()
    phone.put('cardio', run('a'))
    pc.put('cardio', run('b'))
    // Both create a file because neither saw the other's.
    const empty = g.drive.files
    await phone.sync()
    const first = new Map(empty)
    g.drive.files = new Map()
    await pc.sync()
    for (const [k, v] of first) g.drive.files.set(k, v)
    expect(g.drive.files.size).toBe(2)

    await phone.sync()
    expect(g.drive.files.size).toBe(1)
    expect(Object.keys(phone.db().cardio).sort()).toEqual(['a', 'b'])
  })
})
