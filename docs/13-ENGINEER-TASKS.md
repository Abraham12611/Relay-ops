# 13 — Atomic engineer assignments (E01–E20)

**IMPORTANT:** The competition permits teams of up to four registered humans. These are **independent implementation slots**, not authorization to register 20 participants. Split across up to four humans using coding assistants/branches as appropriate. Time targets are best-effort and dependencies always override parallel start.

| ID | Phase | Owner boundary | Deliverable | Depends on | Acceptance proof |
|---|---|---|---|---|---|
| E01 | F0/F1/F3 | Integration lead: config/build/root | runnable app, dependency integration, merges | none | clean `npm run dev` + smoke |
| E02 | F0/F2E | Switch Console/Mattermost + real room | person-agent chat and setup notes | none | real message screenshot and repeatable commands |
| E03 | F1 | schema/migrations/seed | stable fixture, reset, event persistence | E01 | rerun seed identical IDs |
| E04 | F1 | contracts, roles, middleware | DTOs + auth boundaries + route stub | E01 | typecheck and 401/403 test |
| E05 | F2D | incidents service + API | POST report, list/detail + dedupe | E03,E04 | driver report persisted |
| E06 | F2D | recovery feasibility | candidates/capacity/conflict simulation | E03,E04 | feasible + infeasible tests |
| E07 | F2D | approval/execution service | versioned plan, approve, atomic execute | E03,E04,E06 | pre-approval 403, approved write succeeds |
| E08 | F2E | agent prompt + tool gateway | real agent reads, proposes, executes in Switch | E02,E04,E05,E07 | chat receipt matches DB |
| E09 | F2B | driver portal screens | jobs list/detail, navigation | E04 | fixture shows correct driver jobs |
| E10 | F2B | driver actions | breakdown form, accept/pickup/deliver | E05,E07,E09 | transitions persist |
| E11 | F2A | customer tracking | public tracking UI/stepper/status | E04,E03 | status updates on refresh |
| E12 | F2A | safe timeline/notifications | public projection, notification read | E03,E04 | internal events hidden |
| E13 | F2C | ops overview/list | KPI cards, exception list, severity links | E04,E05 | new case appears |
| E14 | F2C | case command center | plan facts, approve/reject, receipts | E07,E13 | approval creates audit entry |
| E15 | F2C | event timeline/replay | append-only timeline projection | E05,E07 | events correlated end-to-end |
| E16 | F1/F2F | reusable UI/design optional map | component library tokens, responsive layout | E01 | responsive, accessible screens |
| E17 | F2F | unit/integration tests | state and negative test matrix | E03–E07 | mandatory tests green |
| E18 | F3 | end-to-end/QA scripts | reproducible golden path + failure probes | E08–E15 | full clean reset run twice |
| E19 | F4 | narrative/video | script, recording, screenshots and proof | E18 | playable 3–5min demo |
| E20 | F4 | submission & docs | README setup, evidence, final link check | E02,E18,E19 | teammate can reproduce |

## Minimum four-person split
- **Person A** — E01 + E03–E05 + E07 (backend lead). Pair with B on approval/execute boundary.
- **Person B** — E02 + E06 + E08 (Switch/agent owner). Blocked only by API contract, which can be stubbed.
- **Person C** — E09–E12 + E16 (customer/driver frontend).
- **Person D** — E13–E15 + E17–E20 (ops, test and presentation). Rotate recording ownership early.

## Five-to-twenty parallelization strategy (engineering decomposition only)
At 5–8 implementation workstreams, assign E02, E03–E07, E08, E09–E12, E13–E15, E16, E17–E18, E19–E20. At 9–20, split by ticket only *after* E03/E04 publish the fixture/DTOs; E01 must guard merge conflicts and E02 independently proves Switch.

## Earliest safe start by ticket
**Immediately:** E01 E02 E16 E19 (draft script) E20 (docs). **After app skeleton:** E03 E04. **After fixture/DTO freeze:** E05 E06 E09 E11 E12 E13 E15 E17. **After case and recovery services:** E07 E10 E14. **After E02 and gateway stubs:** E08. **After all P0 components:** E18; then record final E19.

## Each ticket checklist
- [ ] Claim owner and branch in STATUS.
- [ ] Read relevant product/UX/workflow/contract sections.
- [ ] Do not modify shared contract without sync.
- [ ] Add meaningful unit/integration/e2e assertion.
- [ ] Demonstrate exact output and expected user action.
- [ ] Raise PR with dependencies and proof.
- [ ] Mark Done only after integration on develop.

## Parallel engineering anti-patterns
Do not independently create data schemas, reinvent auth in each page, copy template code without license, simulate successful chat actions, reset live shared DB during other's test, claim delivery occurred without driver action, or change route names without contract update.
