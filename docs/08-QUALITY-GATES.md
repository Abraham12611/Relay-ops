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
- `npm test` — migrate an isolated SQLite test database and run domain, API-persistence, agent-adapter, and smoke-helper tests; live API contract cases skip unless explicitly enabled.
- `npm run typecheck` — generate the Prisma client and type-check the app, services, and tests.
- `npm run build` — generate Prisma client and build the Next.js App Router app.
- `npm run seed` / `npm run reset:demo` — restore the deterministic pre-incident baseline in the local database; `reset:demo` remains the Prisma CLI path.
- `npm run reset:service` — use the protected HTTP reset endpoint for an isolated running demo service.
- `npm run smoke:foundation` — verify the local persisted pre-incident fixture.
- `npm run test:integration` — exercise the optional live API contract suite; requires the service URL and role-scoped credentials.
- `npm run smoke` — run the live golden path; it starts by resetting the configured service through the protected HTTP endpoint and requires downstream workflow endpoints.

The smoke helper reports the driver's breakdown to create INC-1042 before incident-specific checks and exercises E06 approval, execution, driver lifecycle, and customer tracking. E01 (#12), agent tooling (#18), and E06 (#19) are integrated into `develop`. The opt-in API integration suite and two independent smoke invocations have passed against an isolated local Next.js service and disposable SQLite database; these establish local HTTP workflow behavior only, not a deployed service, role-specific UI rehearsal, or authentic Switch/Mattermost exchange. No external RelayOps URL/credentials or real Switch proof were verified. See [the demo rehearsal gate](DEMO-REHEARSAL.md) for the exact verification boundary, environment requirements, and six-step demo checklist.

`npm run dev` starts the Next.js app on port 3000 by default. `npm run lint` is not configured yet.

## Known risk prioritization
P0 blockers: Switch not working, agent cannot reach API, approval execution broken, no driver/customer closure. P1: map glitch, replay charts, second agent, email integration. P2: fancy marketing page and charts.

## Evidence files in submission
`docs/evidence/` screenshots of real Mattermost room, request/response (redacted), dashboard approval, assignment record, delivered tracking, test run. Add screenshots only if authentic and consented.
