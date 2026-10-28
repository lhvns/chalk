// Google Drive storage for the sync file. The file lives in the hidden
// appDataFolder, which only this app's OAuth client can see, using the narrow
// drive.appdata scope — Chalk never sees the rest of your Drive.

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const FILE_NAME = 'chalk-data.json'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const TOKEN_KEY = 'chalk.driveToken'
const CLIENT_KEY = 'chalk.clientId'

export class AuthRequired extends Error {
  constructor(msg = 'Google sign-in needed') {
    super(msg)
  }
}

// ---------- configuration ----------

export function clientId(): string {
  try {
    const own = localStorage.getItem(CLIENT_KEY)
    if (own) return own
  } catch {}
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''
}

export function setClientId(id: string) {
  try {
    if (id) localStorage.setItem(CLIENT_KEY, id.trim())
    else localStorage.removeItem(CLIENT_KEY)
  } catch {}
}

// ---------- tokens ----------

interface StoredToken {
  token: string
  exp: number
  email?: string
}

export function storedToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    return raw ? (JSON.parse(raw) as StoredToken) : null
  } catch {
    return null
  }
}

function saveToken(t: StoredToken | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t))
    else localStorage.removeItem(TOKEN_KEY)
  } catch {}
}

/** A token that is still good for at least another minute. */
export function validToken(): string | null {
  const t = storedToken()
  return t && t.exp - Date.now() > 60_000 ? t.token : null
}

let gisPromise: Promise<void> | null = null

/** Loads Google Identity Services. Preload it so a tap can open the sign-in popup immediately. */
export function loadGIS(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      gisPromise = null
      reject(new Error('Could not reach Google sign-in. Are you online?'))
    }
    document.head.appendChild(s)
  })
  return gisPromise
}

/**
 * Opens Google's consent popup. Must run from a user gesture (a tap or click),
 * or the browser blocks the popup. After the first consent it closes by itself.
 */
export async function signIn(): Promise<string> {
  const id = clientId()
  if (!id) throw new Error('Add your Google OAuth client ID first.')
  await loadGIS()
  const hint = storedToken()?.email
  const resp = await new Promise<google.accounts.oauth2.TokenResponse>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: id,
      scope: SCOPE,
      login_hint: hint,
      callback: (r) => (r.error ? reject(new Error(r.error_description || r.error)) : resolve(r)),
      error_callback: (e) =>
        reject(new Error(e.type === 'popup_closed' ? 'Sign-in window was closed.' : `Sign-in failed (${e.type}).`)),
    })
    client.requestAccessToken({ prompt: hint ? '' : 'consent' })
  })
  const token = resp.access_token
  const t: StoredToken = { token, exp: Date.now() + Number(resp.expires_in) * 1000, email: hint }
  saveToken(t)
  try {
    const about = await call<{ user?: { emailAddress?: string } }>(token, `${API}/about?fields=user(emailAddress)`)
    if (about.user?.emailAddress) saveToken({ ...t, email: about.user.emailAddress })
  } catch {}
  return token
}

export function signOut() {
  const t = storedToken()
  if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t.token, () => {})
  saveToken(null)
}

// ---------- Drive REST ----------

async function call<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    saveToken(storedToken() ? { ...storedToken()!, exp: 0 } : null)
    throw new AuthRequired()
  }
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.json())?.error?.message ?? ''
    } catch {}
    throw new Error(`Google Drive error ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export interface DriveFile {
  id: string
  version: string
  modifiedTime?: string
}

export async function listFiles(token: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`)
  const r = await call<{ files: DriveFile[] }>(
    token,
    `${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,version,modifiedTime)&orderBy=createdTime&pageSize=10`,
  )
  return r.files ?? []
}

export const fileVersion = (token: string, id: string) =>
  call<DriveFile>(token, `${API}/files/${id}?fields=id,version`).then((f) => f.version)

export const download = (token: string, id: string) => call<unknown>(token, `${API}/files/${id}?alt=media`)

export async function create(token: string, data: unknown): Promise<DriveFile> {
  const boundary = `chalk${Math.random().toString(36).slice(2)}`
  const meta = { name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' }
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`
  return call<DriveFile>(token, `${UPLOAD}/files?uploadType=multipart&fields=id,version`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
}

export const overwrite = (token: string, id: string, data: unknown) =>
  call<DriveFile>(token, `${UPLOAD}/files/${id}?uploadType=media&fields=id,version`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const removeFile = (token: string, id: string) =>
  call<void>(token, `${API}/files/${id}`, { method: 'DELETE' })
