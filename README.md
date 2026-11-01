# Chalk

A fitness tracker for an Android phone and a Windows PC, built as one installable web app (PWA). It tracks:

- **Lifting**: workouts, sets × reps × weight, routines, a rest timer, estimated 1RM progress and PR badges
- **Cardio**: runs, rides, walks, swims and more, with distance, pace, calories and weekly totals
- **Body**: weigh-ins with a 7-day trend line, body-fat percentage and tape measurements
- **Food**: calories and macros by meal, a built-in list of common foods, saved foods, quick add, and barcode lookup through Open Food Facts

Everything works offline. Data lives on the device in IndexedDB. If you turn on sync, it also syncs through a hidden app-data file in your Google Drive.

## Run it locally

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # merge, stats and two-device sync tests
npm run build      # production build in dist/
```

## Put it on your phone and PC

Installing a PWA needs HTTPS, so host the build somewhere. The included workflow deploys to **GitHub Pages** for free:

1. Push this repo to GitHub.
2. In the repo, set **Settings → Pages → Source** to **GitHub Actions**.
3. Every push to `main` builds and deploys to `https://<user>.github.io/<repo>/`.

Then install it:

- **Android (Chrome):** open the URL, then **⋮ → Add to Home screen → Install**.
- **Windows (Edge):** open the URL, then **… → Apps → Install this site as an app**. In Chrome, use the install icon in the address bar.

Browsers keep data per address, so always log at this URL. Any other address, such as the dev server at `http://<your-PC-IP>:5173` or a local preview, keeps its own separate data and shows a **Test copy** banner to remind you. To make that banner link to the real app on local copies, set `VITE_APP_URL` in `.env.local`.

## Google Drive sync (optional, about 5 minutes, one time)

1. [Create a Google Cloud project](https://console.cloud.google.com/projectcreate).
2. Enable the [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com).
3. In [Google Auth Platform](https://console.cloud.google.com/auth/overview), configure the consent screen. Choose **Internal** if you're on Google Workspace. Otherwise choose **External** and add yourself as a test user.
4. In [Clients](https://console.cloud.google.com/auth/clients), create an OAuth client of type **Web application**. Under **Authorized JavaScript origins**, add:
   - `https://<user>.github.io` (your Pages origin, with no path)
   - `http://localhost:5173` (for local development)
5. Give the app the client ID, using either of these:
   - paste it into **Settings → Sync with Google Drive** on each device, or
   - set a repository variable `GOOGLE_CLIENT_ID` so the deploy bakes it in (for local builds, put it in `.env.local`; see `.env.example`).
6. Tap **Connect Google Drive** on each device.

How it works:

- The app asks only for the `drive.appdata` scope, so it can see its own hidden file and nothing else in your Drive.
- Each record (a workout, a meal entry, a weigh-in) carries a last-modified time. Sync downloads the file, merges record by record (newest edit wins, and deletes are kept as tombstones), then uploads the result. Logging on both devices never overwrites anything.
- Google access tokens from the browser last an hour. While one is valid, Chalk syncs on its own: after each edit, when the app comes back into view, and every 5 minutes. After it expires, tap the sync pill at the top to sign back in, which takes one tap.

## Project layout

```
src/
  lib/
    types.ts     data model
    store.ts     in-memory state, IndexedDB persistence, cross-tab updates
    merge.ts     record-level merge (commutative, idempotent)
    sync.ts      pull → merge → push, background scheduling
    drive.ts     Google Identity Services and Drive REST calls
    stats.ts     e1RM, PRs, trends, nutrition totals
    foods.ts     common-foods table and Open Food Facts barcode lookup
  components/    sheets, inputs, charts, exercise picker
  screens/       Today, Lift, WorkoutEditor, ExerciseDetail, Cardio, Food, Body, Settings
```

## Notes

- **Barcode scanning** uses the browser's built-in `BarcodeDetector`. It's available in Chrome on Android but not in desktop Windows browsers, where you can type the barcode digits instead.
- **Food search** covers your saved foods, recent entries and about 65 common foods, all offline. Open Food Facts' text search can't be called from a web page (its endpoints were down or blocked cross-site requests when this was built), so packaged foods come in through barcodes.
- **Backups:** Settings → Export backup saves a JSON file. Importing a backup merges it in rather than replacing what's there.
