# Demo reliability and rehearsal gate

This checklist supplements the [demo runbook](07-DEMO-RUNBOOK.md), [quality gates](08-QUALITY-GATES.md), workflow contract (03-WORKFLOWS.md), and API contract (05-DATA-API.md). It separates verified Next.js/SQLite foundation behavior from the still-unverified full approval, delivery, UI, and Switch workflow.

## Local checks and deterministic reset

Node.js 22.6+ is required. From a clean checkout:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run seed
npm run reset:demo
npm run smoke:foundation
```

`npm test` exercises the SQLite-backed API persistence/authorization tests, the deterministic domain tests, and the scoped agent adapter tests. The three live API-contract tests are skipped unless explicitly enabled with `npm run test:integration`; a skipped test is not a pass. `npm run seed` and `npm run reset:demo` mutate the local SQLite database. The `smoke:foundation` check confirms the deterministic **PRE-INCIDENT** baseline: `VAN-014` is operational, its six assigned shipments are `IN_TRANSIT`, and `INC-1042` does not exist.

The actual driver breakdown report creates `INC-1042`, marks `VAN-014` broken, and changes those six affected shipments to `AT_RISK`. The persistence tests verify that the incident, shipment changes, duplicate-request behavior, and optimistic version conflict survive separate database reads.

## Optional live API checks

Only run mutating checks against an isolated demo service. They use a demo operator key to issue signed persona cookies and separate read/propose/execute agent keys; all request IDs and credentials must stay out of logs and evidence. Configure these values in the local environment or a secret manager, never in source control:

```bash
RELAYOPS_BASE_URL=http://127.0.0.1:3000 \
RELAYOPS_DEMO_OPERATOR_TOKEN=... \
RELAYOPS_AGENT_READ_TOKEN=... \
RELAYOPS_AGENT_PROPOSE_TOKEN=... \
RELAYOPS_AGENT_EXECUTE_TOKEN=... \
npm run test:integration
```

The ellipses above are placeholders, not usable credentials. `npm run reset:service` resets a configured running service through its authenticated API. This is separate from `npm run reset:demo`, which resets the local database directly.

`npm run smoke` is the live, end-to-end golden-path API harness. It mutates the configured service and expects approval lookup/decision, recovery execution, assignment lifecycle, and customer tracking endpoints. Those downstream workflow endpoints are not implemented by the foundation, so a full successful run is not currently available. Do not interpret it as a local smoke check or run it against production. Even after the complete API flow is implemented, a passing API run is not proof of an authentic Switch/Mattermost conversation or browser UI.

## Critical automated cases

- **Reset baseline:** No incident exists; `VAN-014` is operational; exactly six assigned shipments are `IN_TRANSIT`. The local seed/reset smoke and API persistence tests pass.
- **Incident intake:** A driver breakdown creates `INC-1042`, breaks the van, marks six shipments `AT_RISK`, and deduplicates a repeated key. The local API persistence test passes; an externally deployed service was not exercised.
- **Capacity:** Feasible backup, broken target rejection, mismatched driver/vehicle, exact-capacity and overload cases pass local domain/API tests.
- **Plan versioning:** A proposal advances the incident version; stale expected versions return a conflict. The local API persistence test passes.
- **Approval/execution:** Dispatcher-only approval, stale/rejected plan protection, single execution, and assignment receipt are not implemented in this foundation and require downstream API work.
- **Customer projection:** Delivered shipment and private-field projection checks are not verified against an integrated customer route.
- **Switch proof:** A real human message, agent response, business-tool call, and persisted receipt require an authentic Switch/Mattermost environment and evidence.

## Current blocker snapshot

The Next.js App Router, Prisma/SQLite persistence, deterministic reset, signed server-enforced demo personas, scoped agent credentials, incident intake/list/detail, shipment reads, vehicle availability, recovery simulation, and version-checked recovery proposals are implemented and locally tested. Approval lookup and `POST /api/v1/recovery/execute` are not implemented. The full assignment/tracking journey, role-specific UI integration, and authentic Switch/Mattermost interaction remain unverified. The live integration suite was not run against an external service in this validation; local tests are not represented as end-to-end or Switch evidence.

## Golden-path operator checklist

Complete one row at a time for each run. Do not mark a row complete without observed evidence from that run.

### Clean reset and service preflight

- [ ] Record run number, date/time, branch/commit, operator, and target environment.
- [ ] Confirm this is an isolated demo database and the operator is authorized to reset it.
- [ ] Run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build`; retain the unedited output.
- [ ] Reset the database and verify PRE-INCIDENT state: no `INC-1042`, `VAN-014` available, six shipments `IN_TRANSIT`.
- [ ] Confirm `MED-2048` is critical and `VAN-009` / `DRV-009` are available/on duty.
- [ ] Open the demo, tracking, driver, and operations surfaces in separate profiles/tabs. Refresh at least one persisted view.
- [ ] Verify Switch Console, Mattermost, the real `relayops-dispatch` room, connected agent, and agent-to-API reachability. Record versions and actual endpoint health; never infer these from configuration alone.
- [ ] Verify recording display/audio, 1080p, readable text zoom, safe windows, no tokens, and a timestamped run record.

### Driver, Switch agent, dispatcher, backup driver, customer

- [ ] **Original driver:** submit the actual `VAN-014` breakdown report once; verify the returned `INC-1042`, broken vehicle, six `AT_RISK` shipments, and persisted incident event.
- [ ] **Switch agent (authentic):** in the real room ask `relay-recovery` to investigate `INC-1042` and recommend a backup without executing. Capture the real human message, genuine agent response, and actual read/simulation tool evidence. Do not stage or edit chat.
- [ ] **Switch agent:** verify affected shipment count, critical shipment, vehicle capacity/conflict evidence, proposed target `VAN-009` / `DRV-009`, plan ID/version/hash, and that no write occurred.
- [ ] **Dispatcher:** inspect the same plan in the authenticated operations UI, challenge an assumption if feasible, then approve that exact current plan. Record the dispatcher actor and approval ID from persisted audit evidence.
- [ ] **Switch agent:** request execution only after approval. Verify the actual tool receipt's assignment ID matches the persisted assignment and audit event. Repeating the same idempotency key must not create a second assignment.
- [ ] **Negative checks:** demonstrate that no-approval execution, agent self-approval, stale approval, wrong-driver acceptance, and delivery before pickup are rejected without business mutation.
- [ ] **Backup driver:** as `DRV-009`, accept the assigned job, confirm pickup, and deliver with the demo proof reference. Verify each transition after refresh.
- [ ] **Customer:** refresh `TRK-2048`; verify revised status/ETA and final delivery without any internal staff note or private event.
- [ ] **Dispatcher/audit:** inspect the same case and verify actor, case, plan version/hash, approval, assignment, event, and idempotency evidence; remaining affected shipments must not be implied delivered.
- [ ] Record exact failures/degraded integrations and use the transparent backup mode from the runbook; never invent a successful tool receipt.

## Two-run release gate and evidence

A run is **uninterrupted** only if it begins from the verified clean reset and reaches the customer-visible delivery plus the persisted audit review without substituting staged messages, manually editing database state, or silently restarting a failed step. A retry/restart is a failed run; reset and count a new run.

- [ ] Run 1: reset verified; all P0 steps completed; timestamped run notes and authentic evidence saved.
- [ ] Run 2: independently reset and repeat; same fixed scenario IDs and equivalent business outcomes; no manual state repair.
- [ ] Compare both run records: stable fixture IDs, plan/assignment outcome shape, one execution per idempotency key, and matching event relationships.
- [ ] E02 confirms real Switch room interaction and business-tool evidence; API smoke output alone does not satisfy this gate.
- [ ] A teammate other than the author can follow the setup and reset steps from a clean checkout.
- [ ] Video uses the real recorded run, readable text, 3–5 minute narrative, clear fictional-data disclaimer, limitations, and no secrets.
- [ ] Test the final shared video/evidence links in a private browser before submission.

**Readiness rule:** filming is not cleared until both uninterrupted golden-path runs pass and authentic Switch evidence is available. A passing local test suite or an open PR is not equivalent to that gate.
