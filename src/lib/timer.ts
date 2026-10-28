import { useSyncExternalStore } from 'react'

// A single rest timer shared by every screen, so it keeps counting while you
// look something up mid-workout.

interface TimerState {
  endsAt: number | null
  total: number
}

let state: TimerState = { endsAt: null, total: 0 }
const subs = new Set<() => void>()
let tick: ReturnType<typeof setTimeout> | undefined

function set(next: TimerState) {
  state = next
  for (const s of subs) s()
  clearTimeout(tick)
  if (state.endsAt) {
    const left = state.endsAt - Date.now()
    tick = setTimeout(() => {
      buzz()
      set({ endsAt: null, total: 0 })
    }, Math.max(0, left))
  }
}

export const startRest = (seconds: number) => seconds > 0 && set({ endsAt: Date.now() + seconds * 1000, total: seconds })
export const stopRest = () => set({ endsAt: null, total: 0 })
export const addRest = (seconds: number) =>
  state.endsAt && set({ endsAt: Math.max(Date.now() + 1000, state.endsAt + seconds * 1000), total: state.total + seconds })

export const useRest = () =>
  useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    () => state,
  )

function buzz() {
  try {
    navigator.vibrate?.([180, 90, 180])
  } catch {}
  try {
    const ctx = new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = 880
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.5)
    o.onended = () => void ctx.close()
  } catch {}
}
