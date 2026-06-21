# FPL AI Agent v5 — Decision Engine

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
