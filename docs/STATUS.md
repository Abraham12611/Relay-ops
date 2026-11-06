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
| F1 Schema + seed + DTO freeze | In progress | [PR #6](https://github.com/Abraham12611/Relay-ops/pull/6): typed contracts, immutable scenario fixture, feasibility checks and tests; database schema/migrations remain | E03/E04 |
| F2 Parallel features | Not started | PR links below | squads |
| F3 Golden path integrated | In progress | [PR #17](https://github.com/Abraham12611/Relay-ops/pull/17): PRE-INCIDENT smoke harness and rehearsal checklist prepared; backend dependencies remain open in [PR #12](https://github.com/Abraham12611/Relay-ops/pull/12) and draft [PR #19](https://github.com/Abraham12611/Relay-ops/pull/19); no live flow claimed | E01 / E06 / E02 |
| F4 Video, README and submission | Not started | public links | E19/E20 |

## Ticket tracker
| Ticket | State | Owner | PR / proof | Blocker |
|---|---|---|---|---|
| E01 | In review | Engineer 1 | [PR #12](https://github.com/Abraham12611/Relay-ops/pull/12): updated persistence/schema, nullable case links, PRE-INCIDENT seed, allowlisted driver sessions, and incident/event routes | Open and unmerged; not integrated into develop |
| E02 | Not started | — | — | — |
| E03 | In progress | — | [PR #6](https://github.com/Abraham12611/Relay-ops/pull/6): deterministic in-memory fixture; persistence/schema not started | — |
| E04 | In progress | — | [PR #6](https://github.com/Abraham12611/Relay-ops/pull/6): shared TypeScript contracts; auth/routes not started | — |
| E05 | Not started | — | — | — |
| E06 | In review | Engineer 6 | Draft [PR #19](https://github.com/Abraham12611/Relay-ops/pull/19): approval read/decision/execute, driver lifecycle, tracking, and closure routes | Open and unmerged; reconcile updated PR #12 nullable-case and DRV-009 session behavior before integration checks |
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
| E17 | In review | Engineer 5 | [PR #17](https://github.com/Abraham12611/Relay-ops/pull/17): reset/session headers, response contracts, approval-read/execute smoke assertions; static checks passed | API/integration suite deferred until E01/E06 routes are integrated; no live endpoint/credentials verified |
| E18 | In review | Engineer 5 | [PR #17](https://github.com/Abraham12611/Relay-ops/pull/17): PRE-INCIDENT reset, breakdown-created incident, six-step demo checklist and truthful Switch fallback | No integrated API or authentic Switch proof; two independent golden-path runs remain outstanding |
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
| 2026-11-06 | Engineer 5 / E01 / E06 / E02 | E01 PR #12 and draft E06 PR #19 are open; PR #19 must reconcile the updated allowlisted DRV-009 session; no integrated API URL/credentials or authentic Switch exchange/tool call verified | PR #17 prepares scripts/docs; run integration tests and two clean-reset paths only after both backend changes integrate on an isolated test DB, and keep Switch proof as a separate gate |

## Release cut line
If F3 is at risk, stop maps, agent #2, extra flows, charts, email and marketing pages. Protect live-switch proof, approved execution, delivery closure and recorded submission.
