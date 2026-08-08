# Handoff — shared state for AI coding agents

> Purpose: this repository is developed by more than one AI coding agent
> (e.g. OpenAI Codex and Claude), one at a time, on the same `main` branch.
> Git is the single source of truth. This file is the living handoff note.
> Every agent MUST read this file at the start of a session and update it at
> the end. Keep it short, current, and honest.

## How to use this file

- At session start: read this file, then follow the start checklist in `AGENTS.md`.
- During the session: keep working-tree changes scoped and committed in small steps.
- At session end: update the three sections below, then commit.

Do not let this file grow without bound. Keep "Current state" to the present,
trim "Recent activity" to roughly the last 10 entries.

---

## Current state

- Branch: `main`
- Last known-good commit: (fill in with `git rev-parse --short HEAD`)
- Build/typecheck status: `npm run lint` (tsc --noEmit) passing as of last update.
- Working tree at handoff: clean (no uncommitted changes).

## In progress / not finished

- Nothing in progress. (If you stop mid-task, describe exactly what is
  half-done, which files, and what remains — so the next agent does not
  redo or clobber it.)

## Next steps / open priorities

- (Optional) Add a Vitest unit-test suite and a GitHub Actions CI build —
  flagged as a priority in `docs/TESTING.md` and `docs/KNOWN_LIMITATIONS.md`.
- (Optional) Extract components out of the large `app/page.tsx`.
- (Optional) Reduce `any` usage in UI/API glue.
- Replace this list with the owner's actual current request.

## Recent activity (newest first)

- 2026-08-08 — Added multi-agent coordination protocol (this file +
  `AGENTS.md` "Multi-agent coordination" section).

## Gotchas / notes for the next agent

- `main` is the production branch and the Vercel deploy source. Push only
  when the owner explicitly requests it.
- Never commit `.env.local`, `.next`, `node_modules`, or secrets.
- After any code/TypeScript change, run `npm run build` (or at least
  `npm run lint`) before committing.
- If you change dashboard model output or response schema, bump BOTH cache
  keys in `app/api/bootstrap/route.ts`.
- The `_to_delete/` folder (if present) is scratch for files that could not
  be removed automatically; it is safe for the owner to delete and must not
  be committed.
