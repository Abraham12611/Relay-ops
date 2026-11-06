# 08 — QA matrix, acceptance and release gates

## Test layers
- Domain unit tests: transitions, prioritization and capacity/ETA checks.
- API integration: persistence, idempotency, authorization and transaction boundaries.
- Browser smoke: report → queue → approval → execution → driver fulfilment → customer timeline.
- Live Switch proof: actual human→agent chat, read tool call, approved write tool call, agent reply with persisted receipt.
- Resilience: refresh, retry, disconnected Switch, duplicate message, declined backup.

## Golden-path acceptance (P0)
- [ ] Driver submits breakdown for VAN-014 once and gets INC-1042.
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

## Commands to provide when code exists
`npm install`, `npm run dev`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run seed`, `npm run reset:demo`, `npm run smoke`. **These are planned script names; they do not yet exist.** Document exact commands once implemented.

## Known risk prioritization
P0 blockers: Switch not working, agent cannot reach API, approval execution broken, no driver/customer closure. P1: map glitch, replay charts, second agent, email integration. P2: fancy marketing page and charts.

## Evidence files in submission
`docs/evidence/` screenshots of real Mattermost room, request/response (redacted), dashboard approval, assignment record, delivered tracking, test run. Add screenshots only if authentic and consented.
