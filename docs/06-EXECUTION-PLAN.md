# 06 — Critical-path execution plan (time-boxed)

## Time budget
Planning reference: **Nov 6 2026 ~17:09 WAT**; submission deadline **Nov 7 2026 19:29 WAT**, approximately **26h20m remaining at planning start**. Recalculate from actual execution start; reserve **at least 2h** for recording/upload and **1h** for contingency. Gate by deliverable, not elapsed time alone.

**Legal/event staffing constraint:** official event allows **solo or teams of up to 4**. A 5–20 engineer task matrix is a decomposition tool, NOT a recommendation to register 20 participants or violate event rules. Align work sharing with the official rules.

## Dependency graph
```text
F0 repo + Switch spike
  -> F1 freeze contracts + seed/schema + design tokens + test fixture
       -> F2A customer UI ───────────┐
       -> F2B driver UI ─────────────┤
       -> F2C dispatcher UI ─────────┤
       -> F2D business services ─────┤
       -> F2E agent/tool integration ┤
       -> F2F test/demo harness ─────┘
                    -> F3 full vertical integration
                        -> F4 rehearsal, proof & submission
```

## Phases and sub-phases
| Gate | Target window from kickoff | Sub-phases | Exit evidence | Hard dependency |
|---|---|---|---|---|
| F0 Feasibility | h0–h2 | F0.1 init repo, F0.2 Switch/Mattermost setup, F0.3 agent message, F0.4 connectivity proof | person and real agent exchange messages in real room; screenshot/log | none |
| F1 Foundation | h1–h4 | F1.1 schema/seed, F1.2 DTO/API freeze, F1.3 design/shared layout, F1.4 endpoints stubbed, F1.5 auth demo controls | stable seeded IDs, contract tests, page skeleton compile | F0 repo |
| F2 Parallel build | h4–h13 | F2A customer, F2B driver, F2C ops UI, F2D cases/plans/approvals, F2E agent tools, F2F QA/seed/reset | every work package PR merged only against frozen contracts | F1 |
| F3 Integration | h13–h19 | F3.1 driver incident, F3.2 room read/tool call, F3.3 plan→approval, F3.4 execute→driver, F3.5 customer closure | one uninterrupted golden path with persistent events | relevant F2 workstreams |
| F4 Release | h19–h24 | F4.1 regression and degraded path, F4.2 record 3–5m video, F4.3 README screenshots/env, F4.4 verify upload | video + judge setup + URL + tested reset | F3 |
| Buffer | last 2h+ | F5.1 contingency, F5.2 upload retry | submitted before 19:29 WAT | F4 |

Windows are aspirational, overlapping and measured as elapsed team-hours. Parallel work begins *immediately after minimal contract freeze*, not after all backend functionality. Never spend the recording buffer implementing P1 polish.

## Critical path order
1. **Switch proof**: If no real room-agent exchange by h2, escalate; someone must own integration exclusively.
2. **Immutable fixture and types**: e.g. INC-1042/MED-2048 keys. Everything integrates to these IDs.
3. **Tool gateway + approval transaction**: core judge proof.
4. **Minimal real UIs**: clickable driver report, dispatcher approve, backup accept, customer tracking.
5. **Recorded uninterrupted run** and reproducibility.
Map animation, multi-agent handoff and extra incident scenarios come only after F3 is green.

## Work package allocation (up to 20 slots; details in 13-ENGINEER-TASKS.md)
- E01 technical lead/integration (critical owner)
- E02 Switch setup and room ops (critical owner)
- E03 schema/seed
- E04 API DTO and auth
- E05 incident service
- E06 recovery feasibility service
- E07 approval/execution service
- E08 agent prompts/tool adapter
- E09 driver list and job details
- E10 driver incident/fulfilment controls
- E11 customer tracking page
- E12 public events/notifications
- E13 ops overview and queue
- E14 case detail and approval UI
- E15 activity timeline/replay
- E16 design system/map
- E17 tests/unit integration
- E18 live end-to-end/QA
- E19 runbook/video/story
- E20 docs/packaging/deployment

At 4 contributors, bundle: **A E01/E03/E04/E05/E07**, **B E02/E08/E06**, **C E09–E12/E16**, **D E13–E15/E17–E20**. Adjust based on skills. Agent coding tools can help each human, but don't conflate coding agents with registered humans.

## Ownership and merge rules
- Single owner edits schema and canonical contracts, one integrator approves changes.
- UI squads work against fixture JSON/mock transport with identical DTOs until API ready.
- Agent squad works against local stubbed business API + real Switch agent, never mock Switch itself for demo.
- Branch prefix `feat/eNN-shortname`; PR into main, small merges every 2–3h; critical service code reviewed before integration.
- Merge in order: contracts → seeded API → pages → agent hooks → integration → documentation.
- Any blocked engineer switches to unit tests, story assets or independent role page; no uncontrolled schema changes.

## Stop/go gates
- h2: no Switch → prioritize official quickstart and supported agent; remove everything optional.
- h4: no contract/schema → freeze minimum DTOs and use SQLite; no more design churn.
- h13: no approved execution → stop extra UI work; pair backend+agent on it.
- h19: no complete E2E → capture honest narrower demo of working workflow; don't fake evidence.
- final 3h: code freeze except P0 bugfix, record and submit.

## Definition of done for a package
Built, typed, tested, matches shared contract, no mock shown as real, has screenshots or API evidence, linked PR, owner and status updated in STATUS.md. PR description specifies feature path and reproducible testing commands.

## Progress cadence
Update STATUS.md by gate and task ID every 60–90 minutes; 15-minute async sync when blocked; one integrator performs conflict triage. `Not started / In progress / Blocked / In review / Done` are the only workflow states.
