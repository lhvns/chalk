// Minimal typings for the parts of Google Identity Services that Chalk uses.
declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string
    expires_in: number | string
    scope: string
    error?: string
    error_description?: string
  }
  interface TokenClientConfig {
    client_id: string
    scope: string
    login_hint?: string
    prompt?: string
    callback: (resp: TokenResponse) => void
    error_callback?: (err: { type: string; message?: string }) => void
  }
  interface TokenClient {
    requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void
  }
  function initTokenClient(config: TokenClientConfig): TokenClient
  function revoke(token: string, done: () => void): void
}

interface Window {
  google?: { accounts?: { oauth2?: typeof google.accounts.oauth2 } }
}

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** The address of the real, deployed app, e.g. https://<user>.github.io/<repo>/ */
  readonly VITE_APP_URL?: string
}
