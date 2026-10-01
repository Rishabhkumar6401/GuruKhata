# GuruKhata web app (PWA)

Mobile-first React app for tutors: dues, reminders, receipts, students. Built with
Vite + React (plain JavaScript), no UI kit. Talks to the API described in
[`../docs/API-CONTRACT.md`](../docs/API-CONTRACT.md).

## Run locally

```bash
cd web
npm install
cp .env.example .env    # optional — defaults work for local dev
npm run dev             # http://localhost:5173
```

Build and preview the production bundle (service worker only runs here):

```bash
VITE_API_URL=https://api.example.com VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com npm run build
npm run preview         # http://localhost:4173
```

`npm run build` **fails on purpose** when `VITE_API_URL` or `VITE_GOOGLE_CLIENT_ID`
is missing, so a production bundle can never ship pointed at localhost with the
Dev login form. For a local/staging build that uses Dev login, run
`VITE_ALLOW_DEV_LOGIN=1 npm run build` instead.

## Environment variables

| Variable | Default | What it does |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000` (dev only) | Base URL of the API, no trailing slash. Required for a production build. |
| `VITE_GOOGLE_CLIENT_ID` | empty | Google OAuth Web client ID. When set, login shows the Google button (`POST /api/auth/google`). Required for a production build. |
| `VITE_ALLOW_DEV_LOGIN` | unset | **Dev/staging only.** `1` lets a build skip the two checks above and shows the name-only **Dev login** form (`POST /api/auth/dev`) when no Google client ID is set. Never set it for real users. |

Vite bakes these in at build time — rebuild after changing them.

## Local login

The app expects the API at `VITE_API_URL`. In `npm run dev` without a Google client
ID the login screen shows **Dev login**: start the API with `DEV_AUTH=1` so
`POST /api/auth/dev` is enabled, then type any name to log in (same name = same
tutor). A built app only shows Dev login when built with `VITE_ALLOW_DEV_LOGIN=1`.

The app imports `../shared/templates.js` (WhatsApp reminder text) — keep the
`shared/` folder next to `web/` when building; `vite.config.js` allows the dev
server to serve it.

The API must allow cross-origin requests from the app's origin
(`http://localhost:5173` in dev, `4173` for preview) including the
`Authorization` header.

## Notes

- Token is stored in `localStorage` (`gk_token`). Any 401 clears it and returns to login.
- The service worker precaches the app shell only. There is no runtime caching, so
  `/api` responses are never cached.
- Receipts are drawn on a canvas in the browser and shared via the Web Share API
  (falls back to a PNG download).
- Deep links like `/students` or `/receipt/:id` need SPA fallback on the host
  (Cloudflare Pages does this by default when there is no `404.html`).
- Icons in `public/icons/` were generated once from `public/icons/icon.svg` /
  `maskable.svg` (rupee on teal square). Re-export the PNGs if the SVG changes.
