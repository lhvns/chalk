import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './styles.css'
import App from './App'
import { loadDB } from './lib/store'
import { startAutoSync } from './lib/sync'

registerSW({ immediate: true })

// Ask the browser not to evict our IndexedDB data under storage pressure.
void navigator.storage?.persist?.()

// No StrictMode: its double-run of effects would push and pop the history
// entries that let Android's back button close sheets.
loadDB().then(() => {
  createRoot(document.getElementById('root')!).render(<App />)
  startAutoSync()
})
