# Demo reliability and rehearsal gate

This checklist supplements the [demo runbook](07-DEMO-RUNBOOK.md), [quality gates](08-QUALITY-GATES.md), workflow contract (03-WORKFLOWS.md), and API contract (05-DATA-API.md). It distinguishes the integrated foundation from the still-unverified full approval, delivery, UI, and Switch workflow.

## Local foundation checks and reset

Node.js 22.6+ is required. From a clean checkout, run:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run seed
npm run reset:demo
npm run smoke:foundation
```

`npm test` runs isolated SQLite persistence/authorization tests, domain tests, the agent adapter tests, and smoke-helper contract tests. Live API contract tests are skipped unless explicitly enabled with `npm run test:integration`; a skipped test is not a pass. `npm run seed` and `npm run reset:demo` mutate the local SQLite database. The foundation smoke verifies the deterministic PRE-INCIDENT state: `VAN-014` is available, its six shipments are `IN_TRANSIT`, and `INC-1042` does not exist. The seed also contains customer-visible shipment-registration events; these do not create an incident.

There are two distinct reset paths; keep their semantics separate:

- `npm run reset:demo` runs the Prisma CLI reset for the local database.
- `npm run reset:service` runs `scripts/reset-demo.mjs`, which calls the protected `POST /api/v1/demo/reset` endpoint and then reads/verifies service state. The live `npm run smoke` helper also begins with this protected HTTP reset. These mutating commands must target an isolated demo service, never production or a shared live demo.

A driver breakdown report creates `INC-1042`, marks `VAN-014` broken, and changes its six affected shipments to `AT_RISK`. Only then should incident-dependent smoke checks run.

## Optional live API checks

Configure the service URL, demo operator key, and separate agent keys in the local environment or secret manager. The examples use placeholders, not credentials; never commit or capture actual values.

```bash
RELAYOPS_BASE_URL=http://127.0.0.1:3000 \
RELAYOPS_DEMO_OPERATOR_TOKEN=... \
RELAYOPS_AGENT_READ_TOKEN=... \
RELAYOPS_AGENT_PROPOSE_TOKEN=... \
RELAYOPS_AGENT_EXECUTE_TOKEN=... \
npm run test:integration
```

Demo personas are created through `POST /api/v1/demo/session` with `x-demo-operator-key`; the signed identity is returned in an HTTP-only cookie. `DRV-009` is selected with `{ role: "DRIVER", driverId: "DRV-009" }`; the default `DRV-014` session omits `driverId`. Agent calls use `x-agent-api-key` with separate read, proposal, and execution keys. Every request carries `X-Request-ID`; business mutations also carry `Idempotency-Key`. Success uses `{ data, correlationId }`; failures use `{ error: { code, message, correlationId } }`.

The full smoke uses the approval/execute contract from E06: approval lookup at `GET /api/v1/recovery/approvals/:planId`; dispatcher approval/rejection bound to `planId`, `planHash`, and `planVersion`; and `POST /api/v1/recovery/execute` with `approvalId`, `planId`, and the matching body/header idempotency key. Execution returns a receipt with the plan, approval, assignment, shipment, case, event, resulting status, and execution time. The smoke checks authorization failures, stale/rejected decisions, idempotent receipt replay, backup-driver accept/pickup/delivery, and the delivered customer projection.

Run the full smoke once with:

```bash
npm run smoke
```

Each invocation performs a fresh protected HTTP reset. Run it twice as two independent executions only after all required routes are integrated, the isolated test service and credentials are available, and the first execution is complete. Save unedited console output for each run, including failures. A skipped API test or passing local helper test is not a live API result.

## Current integration and evidence status

E01's foundation, nullable case links, PRE-INCIDENT seed, allowlisted driver sessions, and incident/event routes landed in `develop` through merged PR #12. E06's approval/read/execute, driver lifecycle, tracking, and closure work remains in draft PR #19. After PR #12 merged, GitHub reported that PR #19 diverges from and conflicts with the current `develop` tip; Engineer 6 has been asked to reconcile it, including the selected `DRV-009` session behavior. After merging current `develop` (base `57cb965`) into PR #17, local validation passed: `npm ci`; `npm test` with 29 passed, 0 failed, and 3 live API contract cases skipped; `npm run typecheck`; and `npm run build`. These are local foundation/helper checks only, not evidence for E06 or an external service. The full smoke has not run against an integrated E06 backend. No live API URL or role credentials were verified in this Session.

Engineer 2's latest check found no real Switch/Mattermost exchange, `relay-recovery` reply, reachable RelayOps API, or live business-tool call. Adapter tests using mocked fetch are not live evidence. Do not claim API, Switch, or golden-path success until actually observed against the integrated service or authentic room.

## Critical automated cases

| Area | Assertion | Evidence boundary |
|---|---|---|
| Reset baseline | PRE-INCIDENT; no incident or incident-shipment links; six fixed shipments remain `IN_TRANSIT` on available `VAN-014` | Local tests can validate fixture shape; service reset requires isolated API |
| Incident intake | Driver report creates `INC-1042`; same idempotency key returns the same case without a duplicate event | Requires integrated API for persistence evidence |
| Capacity | Feasible backup; broken vehicle and mismatched driver/vehicle rejected | Local domain tests cover feasibility; API simulation needs service |
| Approval and versioning | Approval binds exact plan ID/hash/version; stale, rejected, expired, and consumed approvals cannot execute | Requires E06 API integration |
| Execution | No-approval and agent self-approval writes fail; duplicate execute replays the same receipt | Requires E06 API integration and persistence |
| Driver lifecycle | Wrong driver and delivery-before-pickup fail; backup driver accepts, picks up, and delivers | Requires integrated assignment routes |
| Customer projection | Delivered status is visible without internal event IDs or private fields | Requires integrated tracking route |
| Switch | Real human message, agent response, and actual business-tool call | Requires authentic Switch/Mattermost evidence; API output is not proof |

## Quick live-demo checklist

1. **Customer:** reset the isolated service to PRE-INCIDENT; open `/track/TRK-2048` before the incident and note the actual status/ETA.
2. **Driver:** sign in as `DRV-014`, report the `VAN-014` breakdown, and record the created `INC-1042` receipt.
3. **Switch agent:** in the real `relayops-dispatch` Mattermost room, ask `relay-recovery` to investigate and propose a feasible backup without executing; verify the real reply and read/simulation tool calls.
4. **Dispatcher:** review the same plan in the authenticated operations UI and approve the exact current plan version/hash.
5. **Backup driver:** as `DRV-009`, accept the returned assignment, confirm pickup, and deliver with the demo proof reference.
6. **Delivered customer:** refresh `/track/TRK-2048`; verify `DELIVERED`, the customer-visible timeline, and no private/internal fields.

**If Switch is unavailable:** say that the Switch step and full Switch-mediated golden path are blocked. Do not stage chat, replay a generated message, or call API smoke output Switch proof. If the application/API portions are genuinely available, they may be shown as an explicitly labeled degraded/API-only walkthrough using truthful live state. Dated authentic Switch evidence may be shown only as prior evidence, not as a live exchange.

## Golden-path operator checklist

Complete each item from evidence of the current run; do not infer success from configuration.

### Clean reset and service preflight

- [ ] Record run number, date/time, branch/commit, operator, and target environment.
- [ ] Confirm the service uses an isolated demo database and the operator is authorized to reset it.
- [ ] Run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build`; retain unedited output.
- [ ] Verify the correct reset path: local `npm run reset:demo` for Prisma DB reset, or `npm run reset:service` for the protected HTTP service reset.
- [ ] Confirm PRE-INCIDENT: no `INC-1042` or incident links; six shipments are `IN_TRANSIT` on available `VAN-014`; `MED-2048` is critical; `VAN-009` / `DRV-009` are available/on duty.
- [ ] Verify the real Switch Console, Mattermost room, connected agent, and agent-to-API reachability; record actual health rather than inferring it from configuration.
- [ ] Verify recording display/audio, readability, safe windows, no tokens, and a timestamped run record.

### Customer, driver, Switch agent, dispatcher, backup driver, delivered customer

- [ ] **Original driver:** submit the `VAN-014` breakdown once; record returned incident ID and persisted event.
- [ ] **Switch agent (authentic):** ask the real room agent to investigate `INC-1042` and recommend a backup without executing; retain the human message, agent reply, and actual read/simulation tool evidence.
- [ ] **Switch agent:** verify affected shipment count, critical shipment, capacity/conflict evidence, target `VAN-009` / `DRV-009`, plan ID/version/hash, and that no write occurred.
- [ ] **Dispatcher:** inspect the exact current plan in the authenticated UI; record the dispatcher actor and approval ID.
- [ ] **Switch agent:** request execution only after approval; verify the actual receipt matches the persisted assignment and audit event. Repeating the same idempotency key must not create a second assignment.
- [ ] **Negative checks:** verify no-approval execution, agent self-approval, stale approval, wrong-driver acceptance, and delivery-before-pickup rejection without business mutation.
- [ ] **Backup driver:** as `DRV-009`, accept the assigned job, confirm pickup, and deliver with the demo proof reference; verify each transition after refresh.
- [ ] **Customer:** refresh `TRK-2048`; verify revised status/ETA and final delivery without private/internal fields.
- [ ] **Dispatcher/audit:** verify actor, case, plan version/hash, approval, assignment, event, and idempotency evidence; do not imply remaining affected shipments were delivered.
- [ ] Record failures/degraded integrations; never invent a successful tool receipt.

## Two-run release gate

A run is uninterrupted only if it starts from a verified clean reset and reaches customer-visible delivery plus persisted audit review without staged messages, manual DB repair, or silently restarting a failed step. A retry/restart is a failed run; reset and count a new run.

- [ ] Run 1: reset verified; all P0 steps completed; timestamped notes and authentic evidence saved.
- [ ] Run 2: independently reset and repeat; stable fixture IDs and equivalent business outcomes, with no manual repair.
- [ ] Compare the two run records for stable IDs, plan/assignment outcomes, one execution per idempotency key, and matching event relationships.
- [ ] E02 confirms a real Switch room interaction and business-tool evidence; API smoke alone does not satisfy this gate.
- [ ] A teammate can follow setup and reset from a clean checkout.
- [ ] Video uses the real recorded run, readable text, a clear fictional-data disclaimer, limitations, and no secrets.

**Readiness rule:** filming is not cleared until both independent golden-path runs pass and authentic Switch evidence is available. A passing local suite or open PR is not equivalent to this gate.
