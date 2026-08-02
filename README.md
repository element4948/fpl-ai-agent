# FPL AI Agent v5 — Decision Engine

## Cross-browser profile sync

The app works locally without a database. To keep Entry ID, League ID, strategy,
free transfers and the selected planned squad identical across browsers, connect
an Upstash Redis database (or Vercel KV-compatible REST database) and configure:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `FPL_APP_PASSWORD` — the password used on the Settings screen
- `FPL_SESSION_SECRET` — a long random value used to sign the login cookie

Copy `.env.example` to `.env.local` for local development. Add the same values in
Vercel Project Settings → Environment Variables for production. The profile is
only removed when Reset is explicitly confirmed.

This version adds a real Decision Engine layer on top of the v4 translation-fixed app.

## Added
- `/api/decision`
- `lib/decision.ts`
- This Gameweek Decision card
- Data-based captain recommendation
- No-hit transfer recommendation when Entry ID is available
- Pre-season decision mode when Entry ID is missing
- Strategy mode based on goal + risk profile
- MN/EN translation for new Decision Engine text

## Run
```bash
rm -rf .next
npm install
npm run dev
```

## Deploy
```bash
vercel --prod
```
