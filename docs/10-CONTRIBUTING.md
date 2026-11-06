# 10 — Engineering collaboration and handoffs

## Principles
1. **Real end-to-end beats broad mockup.** Never merge a visually correct but fake Switch workflow as if complete.
2. Contracts frozen early, services centralize state, frontend works against typed DTOs.
3. Every PR small, runnable, reviewable, references one ticket ID from 13-ENGINEER-TASKS.md.
4. Do not overwrite another engineer's file without explicit coordination. Use feature folders and named owners.
5. Synthetic only; no personal/medical/credential data in commits, screenshots or seed.
6. Registered team maximum is four under the official hackathon rules; assign work accordingly.

## Branch and PR
Branch `feat/eNN-short-title` / `fix/eNN-short-title`. Target pull requests to `develop`, never `main`. PR title `[E07] Add approved recovery execution`.
PR body:
```md
Ticket: E07
Phase: F2D
Files owned:
What changed:
Contract impact: none / linked proposal
How tested:
Evidence screenshot/JSON:
Blocked by:
```
Review: contract/schema owner for DTO changes; integration lead for auth/critical services; UI lead for role flow. No unreviewed direct-push edits to critical files during F3.

## File ownership
- E01: `package.json`, app config, integration, releases.
- E03: database schema, migrations and seed only.
- E04: canonical DTOs, auth primitives and route middleware.
- E05–E07: each has isolated `lib/services/{incidents,recovery,approvals}.ts` and service route folder.
- E08: `switch/` and `lib/agent/` gateway only; do not write business DB logic.
- E09–E12: driver/customer app routes and respective component folders.
- E13–E15: `ops/` pages and components, timeline.
- E16: shared `components/ui`, tokens and optional map.
- E17–E18: tests and smoke scripts.
- E19–E20: docs, images, release.
If actual structure differs, update ownership matrix before parallel edits.

## Coordination
Status states: Not started, In progress, Blocked, In review, Done. Update docs/STATUS.md with owner, PR, evidence every 60–90m. Contract changes announced to all dependent owners. Integrator merges green vertical slices and runs seed/reset smoke after each.

## Local development integration
Backend publishes fixture JSON early; UI squads use same typed contracts. Set `NEXT_PUBLIC_DEMO_MODE` **only** for purely presentational hints; server guards sensitive demo actions with `DEMO_MODE` and a private operator credential. Never gate permissions only in frontend.

## Conflict resolution
Lead decides among conflicting changes in 15 minutes based on P0. No speculative refactors during final six hours. Feature flags for P1. If endpoint is blocked, UI implements waiting/error states rather than faking mutation.

## Team onboarding in 10 minutes
Read README → product brief → your sections in sitemap/workflows/API → engineer ticket → file ownership → run baseline → branch → PR. Ask for explicit owner of shared contracts before editing them.
