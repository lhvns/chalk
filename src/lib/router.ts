import { useSyncExternalStore } from 'react'

// Hash routing keeps the app working from any static host and sub-path, and
// lets Android's back button walk back through screens.

const read = () => location.hash.replace(/^#/, '') || '/'
let path = read()
const subs = new Set<() => void>()

function refresh() {
  const p = read()
  if (p !== path) {
    path = p
    for (const s of subs) s()
  }
}

window.addEventListener('hashchange', refresh)
window.addEventListener('popstate', refresh)

export function navigate(to: string, { replace = false } = {}) {
  // An open sheet owns the current history entry (so back closes it);
  // navigating from inside one takes over that entry instead of stacking on it.
  if (replace || history.state?.sheet) history.replaceState(null, '', `#${to}`)
  else history.pushState(null, '', `#${to}`)
  refresh()
  window.scrollTo({ top: 0 })
}

export const useRoute = () =>
  useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    () => path,
  )

/** Matches `/lift/w/:id`-style patterns. */
export function match(pattern: string, p: string): Record<string, string> | null {
  const a = pattern.split('/')
  const b = p.split('?')[0].split('/')
  if (a.length !== b.length) return null
  const out: Record<string, string> = {}
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) out[a[i].slice(1)] = decodeURIComponent(b[i])
    else if (a[i] !== b[i]) return null
  }
  return out
}
