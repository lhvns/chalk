import { useSyncExternalStore } from 'react'

// Chrome/Edge fire `beforeinstallprompt` when the app is installable; keep it
// so Settings can offer a one-tap "Install" button.

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallEvent | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((s) => s())

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as InstallEvent
  emit()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  emit()
})

export const useInstallPrompt = () =>
  useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    () => deferred,
  )

export async function promptInstall() {
  if (!deferred) return
  await deferred.prompt()
  await deferred.userChoice
  deferred = null
  emit()
}

export const isInstalled = () => matchMedia('(display-mode: standalone)').matches
