# Operations and deployment

## Local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Use Node.js 20+. Verify with `node -v`. Multiple lockfiles above the project directory can make Next infer the wrong root; `next.config.mjs` pins Turbopack root to the project working directory.

## Production build

```bash
npm run build
npm run start
```

The only reliable completion signal is a successful TypeScript/build result. A dev server becoming ready is not a production verification.

## Vercel

1. Import `element4948/fpl-ai-agent`.
2. Production branch: `main`.
3. Framework: Next.js.
4. Keep standard build/output settings.
5. Configure environment variables from `.env.example` for Production and Preview as needed.
6. Push to `main` only when the owner requests deployment.

## Telegram notifications

- The scheduled digest runs every day at `17:00 Asia/Ulaanbaatar` (`09:00 UTC`) through `vercel.json`.
- Configure `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `CRON_SECRET` in Vercel Production environment variables. Never commit their values.
- Long reports are split into Telegram-safe chunks and numbered before delivery, so the 4096-character platform limit does not silently drop a digest.
- The decision digest includes the owner's team/rank when public, captain and vice, transfer/hold advice, a differential candidate, chip advice, risk/news and price signals, league context, and a concise data-coverage line. Missing sections are reported as unavailable rather than fabricated.
- The dashboard's manual send button requires a valid owner session in production. The cron route remains protected by `CRON_SECRET`.
- Urgent alerts are available through the urgent route but are not scheduled by default; adding a frequent schedule should be a deliberate owner decision because it consumes provider quotas.

## Profile sync

For cross-browser persistence configure either the KV names or Upstash aliases plus both owner secrets. If configuration is incomplete, `/api/profile` returns 503 and the app should continue with local browser storage.

Generate a long random `FPL_SESSION_SECRET`; do not reuse `FPL_APP_PASSWORD`. Rotating either secret logs the owner out. Reset deletes the single stored profile only after explicit confirmation in the UI.

## Cache operations

When changing projections, scoring, draft rules, response schema, or source application:

1. Change both fast and verified cache-key version strings in `app/api/bootstrap/route.ts`.
2. Build locally.
3. Inspect the new endpoint response rather than relying on old browser state.
4. After deployment, hard-refresh or wait for edge cache expiry.

If UI and local code disagree, check in this order: active port/server, current Git commit, API response, browser cache, Vercel deployment commit.

## Release and rollback

- Before release: clean `git status`, successful build, manual API checks, no secrets in diff.
- Record the deployed commit hash.
- Rollback in Vercel to the last known good deployment when production is broken; do not rewrite Git history.
- Fix forward on `main`, rebuild, and redeploy.

## Troubleshooting

- `Cannot resolve @/...`: check `tsconfig.json` alias and whether a file was accidentally removed.
- Missing Tailwind/PostCSS: this project currently uses plain CSS; do not introduce Tailwind accidentally.
- Missing root layout tags: `app/layout.tsx` must retain `<html>` and `<body>`.
- Entry found but no picks: public picks are not available before the relevant deadline.
- Draft appears unchanged: confirm bootstrap cache key, endpoint response, and deployed commit.
- External data slow/unavailable: fast response must remain usable; full response may show explicit enrichment errors.
