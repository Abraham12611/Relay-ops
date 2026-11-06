# 08 — QA matrix, acceptance and release gates

## Test layers
- Domain unit tests: transitions, prioritization and capacity/ETA checks.
- API integration: persistence, idempotency, authorization and transaction boundaries.
- Browser smoke: report → queue → approval → execution → driver fulfilment → customer timeline.
- Live Switch proof: actual human→agent chat, read tool call, approved write tool call, agent reply with persisted receipt.
- Resilience: refresh, retry, disconnected Switch, duplicate message, declined backup.

## Golden-path acceptance (P0)
- [ ] A clean reset has no incident; the authenticated driver submits breakdown for VAN-014 once and creates INC-1042.
- [ ] Six affected shipments are linked and CRITICAL MED-2048 prioritized.
- [ ] Switch-connected agent in Mattermost reads INC-1042 using business API; result agrees with DB.
- [ ] Agent proposes VAN-009 after verifiable capacity/conflict validation.
- [ ] Ops dashboard shows versioned plan and supporting facts.
- [ ] Only real dispatcher role approves exact current plan.
- [ ] Agent execution returns unique assignment ID and single committed reassignment.
- [ ] Original assignment is superseded; backup driver can accept and mark pickup.
- [ ] Customer sees revised ETA/status without private messages.
- [ ] Proof-of-delivery moves shipment to DELIVERED; incident reaches correct terminal/monitoring state.
- [ ] Audit retains time, actor, case ID, plan ID, approval ID, assignment ID and source.
- [ ] Full flow survives browser refresh and repeated polling.

## Mandatory negative tests
| ID | Action | Expected |
|---|---|---|
| N01 | Repeat incident POST with same key | same case, no duplicates |
| N02 | Execute without approval | forbidden, no mutations |
| N03 | Agent attempts approve | forbidden |
| N04 | Rejected/expired approval execute | forbidden/conflict |
| N05 | Replace approved plan before execution | old hash rejected |
| N06 | Execute twice same key | identical assignment receipt, one event |
| N07 | Use broken vehicle as backup | infeasible |
| N08 | Overload available vehicle | infeasible |
| N09 | Wrong driver accepts assignment | forbidden |
| N10 | Deliver without pickup | invalid transition |
| N11 | Customer requests internal history | no staff notes/secret data |
| N12 | Agent/room disconnected | case visible, explicit degraded state, no fabricated success |
| N13 | Reset demo without operator auth | forbidden |
| N14 | Simultaneous competing approvals | only current plan version valid |
| N15 | Page refresh after execution | durable persisted state |

## Quality gates
**G0** project compiles; lint/types pass. **G1** seed/reset deterministic and contracts agreed. **G2** domain/API tests green. **G3** actual Switch conversation + tool calls proven. **G4** all P0 steps pass manually twice from clean reset. **G5** full video recorded and readable. **G6** repo README reproducibility verified by a teammate not author.

## Current foundation commands
The repository provides these checks (Node.js 22.6+):

- `npm ci` — install lockfile-pinned dependencies.
- `npm test` — run deterministic fixture/feasibility and smoke-helper contract checks; live API tests are explicitly skipped in this default command.
- `npm run typecheck` — type-check the TypeScript source.
- `npm run test:integration` — require the service URL, demo-operator key, and distinct agent read/propose/execute keys, then exercise live API contract cases.
- `npm run reset:demo` — reset an isolated demo service to PRE-INCIDENT and verify fixed seed IDs/time with no incident or incident links.
- `npm run smoke` — execute the business-API recovery path and its authorization/idempotency/failure checks once.

The reset command restores PRE-INCIDENT; the smoke script must report the driver's breakdown to create INC-1042 before case-specific checks. Reset and smoke mutate or read the configured service, but neither starts an app server. The E01 bootstrap and E06 approval/execute implementation are not integrated in the current `develop` snapshot, and no Switch exchange or tool call has been authenticated; API tests, smoke, and Switch proof are not verified until run against those components. See [the demo rehearsal gate](DEMO-REHEARSAL.md) for environment requirements and a two-run manual checklist.

## Planned commands not implemented yet
`npm run dev`, `npm run lint`, and `npm run seed` will be added as their application/database pieces land.

## Known risk prioritization
P0 blockers: Switch not working, agent cannot reach API, approval execution broken, no driver/customer closure. P1: map glitch, replay charts, second agent, email integration. P2: fancy marketing page and charts.

## Evidence files in submission
`docs/evidence/` screenshots of real Mattermost room, request/response (redacted), dashboard approval, assignment record, delivered tracking, test run. Add screenshots only if authentic and consented.
