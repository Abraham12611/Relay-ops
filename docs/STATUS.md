# Delivery status board

**Baseline timestamp:** November 6, 2026 approximately 17:09 WAT. This is a planning status only, not ongoing automation. Update manually during build.

## GitHub phase tracking

- [F0 — Switch proof](https://github.com/Abraham12611/Relay-ops/issues/1)
- [F1 — Foundation](https://github.com/Abraham12611/Relay-ops/issues/2)
- [F2 — Parallel build](https://github.com/Abraham12611/Relay-ops/issues/3)
- [F3 — Integration](https://github.com/Abraham12611/Relay-ops/issues/4)
- [F4 — Demo and submission](https://github.com/Abraham12611/Relay-ops/issues/5)

## Phase gates
| Gate | State | Evidence | Owner |
|---|---|---|---|
| F0 Repository initialized | Done | README and docs committed | planning |
| F0 Switch + Mattermost agent proof | Not started | add authentic evidence link | E02 |
| F1 Schema + seed + DTO freeze | In review | [PR #12](https://github.com/Abraham12611/Relay-ops/pull/12): Prisma schema/migration, deterministic PRE-INCIDENT reset, authenticated API routes and persistence tests; approval/execution remain downstream | E01/E03/E04 |
| F2 Parallel features | Not started | PR links below | squads |
| F3 Golden path integrated | Not started | test and video rehearsal | E01/E18 |
| F4 Video, README and submission | Not started | public links | E19/E20 |

## Ticket tracker
| Ticket | State | Owner | PR / proof | Blocker |
|---|---|---|---|---|
| E01 | In review | Engineer 1 | [PR #12](https://github.com/Abraham12611/Relay-ops/pull/12): Next.js/TypeScript + Prisma/SQLite foundation, persisted incident/recovery APIs; install, test, typecheck, build, reset and local smoke verified | Approval lookup/execution and live Switch workflow remain out of scope |
| E02 | Not started | — | — | — |
| E03 | In review | — | [PR #12](https://github.com/Abraham12611/Relay-ops/pull/12): SQLite schema/migration and deterministic PRE-INCIDENT database seed added | — |
| E04 | In review | — | [PR #12](https://github.com/Abraham12611/Relay-ops/pull/12): shared contracts, server-enforced demo sessions, scoped agent authorization and versioned API routes added | — |
| E05 | Not started | — | — | — |
| E06 | In progress | — | [PR #6](https://github.com/Abraham12611/Relay-ops/pull/6): read-only fixture feasibility checks; API integration not started | — |
| E07 | Not started | — | — | — |
| E08 | Not started | — | — | — |
| E09 | Not started | — | — | — |
| E10 | Not started | — | — | — |
| E11 | Not started | — | — | — |
| E12 | Not started | — | — | — |
| E13 | Not started | — | — | — |
| E14 | Not started | — | — | — |
| E15 | Not started | — | — | — |
| E16 | Not started | — | — | — |
| E17 | In review | Engineer 5 | [PR #9](https://github.com/Abraham12611/Relay-ops/pull/9): local tests 10 passed; API contract suite added (3 skipped without service) | Persistent API/auth routes and role credentials unavailable; live tests not run |
| E18 | In review | Engineer 5 | [PR #9](https://github.com/Abraham12611/Relay-ops/pull/9): reset/smoke scripts and two-run checklist | No runnable API; two uninterrupted runs and authentic Switch proof remain blocked |
| E19 | Not started | — | — | — |
| E20 | Not started | — | — | — |

## Readiness checklist
- [ ] Real Switch room + actual agent reply.
- [ ] Actual agent calls business read tool.
- [ ] Case created from driver portal.
- [ ] Feasible versioned plan proposed.
- [ ] Dispatcher approves via trusted UI.
- [ ] Agent's approved write persists.
- [ ] Driver accepts and delivers.
- [ ] Customer sees revision and delivered confirmation.
- [ ] Clean reset full-run passes twice.
- [ ] Video is recorded, hosted and playable.
- [ ] Final official submission received.

## Blocker log
| Time | Owner | Blocker | Decision / next action |
|---|---|---|---|
| 2026-11-06 | Engineer 1 / E02 | PR #12 adds the runnable Next.js/SQLite foundation and local persistence tests; approval lookup/execution endpoints and authentic Switch proof remain unavailable or unverified | Continue the full rehearsal after downstream workflow endpoints and a real Switch environment are available; local API tests are not Switch evidence |

## Release cut line
If F3 is at risk, stop maps, agent #2, extra flows, charts, email and marketing pages. Protect live-switch proof, approved execution, delivery closure and recorded submission.
