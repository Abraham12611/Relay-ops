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
| F1 Schema + seed + DTO freeze | Done | [PR #12](https://github.com/Abraham12611/Relay-ops/pull/12): merged Prisma schema/migration, deterministic PRE-INCIDENT reset, authenticated API routes and persistence foundation | E01/E03/E04 |
| F2 Parallel features | Not started | PR links below | squads |
| F3 Golden path integrated | In progress | [PR #17](https://github.com/Abraham12611/Relay-ops/pull/17): PRE-INCIDENT smoke harness and rehearsal checklist prepared; E01 foundation landed via [PR #12](https://github.com/Abraham12611/Relay-ops/pull/12), while draft [PR #19](https://github.com/Abraham12611/Relay-ops/pull/19) conflicts with current develop; no live flow claimed | E01 / E06 / E02 |
| F4 Video, README and submission | Not started | public links | E19/E20 |

## Ticket tracker
| Ticket | State | Owner | PR / proof | Blocker |
|---|---|---|---|---|
| E01 | Done | Engineer 1 | [PR #12](https://github.com/Abraham12611/Relay-ops/pull/12): merged Next.js/Prisma/SQLite foundation, nullable case links, PRE-INCIDENT seed, allowlisted driver sessions, incident/event APIs, and persistence tests | Full E17/E18 flow still depends on E06 integration |
| E02 | Not started | — | — | — |
| E03 | Done | — | [PR #12](https://github.com/Abraham12611/Relay-ops/pull/12): merged SQLite schema/migration and deterministic PRE-INCIDENT database seed | — |
| E04 | Done | — | [PR #12](https://github.com/Abraham12611/Relay-ops/pull/12): merged shared contracts, server-enforced demo sessions, scoped agent authorization and versioned API routes | — |
| E05 | Not started | — | — | — |
| E06 | In progress | Engineer 6 | Draft [PR #19](https://github.com/Abraham12611/Relay-ops/pull/19): approval read/decision/execute, driver lifecycle, tracking, and closure routes | Conflicts with current develop after PR #12 merge; update/reconcile before full-flow integration checks |
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
| E17 | In review | Engineer 5 | [PR #17](https://github.com/Abraham12611/Relay-ops/pull/17): reset/session headers, response contracts, approval/execute assertions; `npm test` 29 passed / 3 live API cases skipped, typecheck and build passed | Live API verification awaits E06 integration and isolated credentials/service; none verified here |
| E18 | In review | Engineer 5 | [PR #17](https://github.com/Abraham12611/Relay-ops/pull/17): PRE-INCIDENT reset, breakdown-created incident, six-step demo checklist and truthful Switch fallback | Full-flow API and authentic Switch proof are unverified; two independent golden-path runs remain outstanding |
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
| 2026-11-06 | Engineer 5 / E01 / E06 / E02 | E01 PR #12 is merged; draft E06 PR #19 conflicts with current develop and needs nullable-case/allowlisted DRV-009 integration reconciled; no live API URL/credentials or authentic Switch exchange/tool call verified | Run full smoke only after PR #19 is integrated on an isolated test DB; keep authentic Switch proof as a separate gate |

## Release cut line
If F3 is at risk, stop maps, agent #2, extra flows, charts, email and marketing pages. Protect live-switch proof, approved execution, delivery closure and recorded submission.
