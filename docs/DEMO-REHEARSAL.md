# Demo reliability and rehearsal gate

This checklist supplements [the demo runbook](07-DEMO-RUNBOOK.md), [quality gates](08-QUALITY-GATES.md), the workflow contract (03-WORKFLOWS.md), and the API contract (05-DATA-API.md). It does not claim that the application server, persistence, UI, or Switch integration exists until those components are actually exercised.

## Automated commands

Node.js 22.6+ is required. Install the exact lockfile dependencies first:

```bash
npm ci
npm test
npm run typecheck
```

`npm test` runs deterministic local fixture/feasibility tests and reports the live API contract tests as **skipped**. They run only through `npm run test:integration`, which requires all integration variables and explicitly opts into mutating the configured demo service; a skipped integration test is not a pass. Run:

```bash
RELAYOPS_BASE_URL=http://127.0.0.1:3000 \
RELAYOPS_DEMO_OPERATOR_TOKEN=... \
RELAYOPS_DRIVER_014_TOKEN=... \
RELAYOPS_DRIVER_009_TOKEN=... \
RELAYOPS_DISPATCHER_TOKEN=... \
RELAYOPS_AGENT_READ_TOKEN=... \
RELAYOPS_AGENT_PROPOSE_TOKEN=... \
RELAYOPS_AGENT_EXECUTE_TOKEN=... \
RELAYOPS_CUSTOMER_TOKEN=... \
npm run test:integration
```

The ellipses above are placeholders, not usable credentials. Set each variable in the local environment or secret manager; never commit tokens, paste them into evidence, or capture them on screen. The harness uses bearer tokens, request IDs, and idempotency keys. It checks the API envelope and routes defined in `docs/05-DATA-API.md`.

A verified deterministic reset is:

```bash
RELAYOPS_BASE_URL=http://127.0.0.1:3000 \
RELAYOPS_DEMO_OPERATOR_TOKEN=... \
npm run reset:demo
```

The reset command posts to the demo-only reset endpoint, fetches the resulting state, and verifies the fixed seed timestamp, open `INC-1042`, `MED-2048` / `TRK-2048`, available `VAN-009`, and exactly six linked shipments. It mutates the configured demo database; point it only at an isolated demo environment. Reset does not create fabricated evidence.

One business-API smoke run is:

```bash
# Provide all variables from the integration-test command above.
npm run smoke
```

The smoke script resets state, rejects broken/mismatched targets, reports the breakdown twice with one idempotency key, creates and revises a plan, rejects an unapproved and stale write, rejects agent self-approval, accepts only the dispatcher decision, repeats execution with the same key, verifies wrong-driver and pre-pickup delivery failures, completes backup-driver delivery, and checks the customer projection against internal event IDs and sensitive field names. It is direct API evidence, **not** proof of a live Switch conversation or a browser UI. Run `npm run smoke` twice separately; each run performs a fresh reset. Capture the console output from both actual runs, including any failure, without editing it into a success claim.

The current checkout has no server routes, persistent database, or UI. Therefore live commands will not pass until those application components and role credentials are available. The source-only tests cannot establish API authorization or persistence behavior.

## Critical automated cases

| Area | Automated assertion | Evidence boundary |
|---|---|---|
| Incident intake | Same idempotency key yields the same `INC-1042` and does not append a second event | Requires live API and driver token |
| Capacity | Feasible seeded backup, broken vehicle rejected, mismatched driver/vehicle rejected | Local feasibility tests run now; API simulation waits for service |
| Incident/plan state | Proposal awaits approval; dispatcher approval advances state; execution does not prematurely resolve remaining work | Requires live API |
| Authorization | Execute without approval and agent approval attempt return 403; wrong driver cannot accept | Requires role-scoped live credentials |
| Plan versioning | Reproposal increments version and changes hash; prior approval cannot execute | Requires live API |
| Execution idempotency | Repeated execution key returns same assignment receipt | Requires persistence and live API |
| Failure paths | Rejected/stale approval, broken target, wrong driver, delivery before pickup are rejected | Requires live API except local feasibility cases |
| Customer projection | Delivered shipment is visible; internal event IDs and named private fields are absent | Current seed has no staff-note sentinel; the harness verifies hidden internal event IDs and forbidden field names, not a real note's text |

## Current blocker snapshot

At this rehearsal-plan revision, the attached checkout contains only the typed fixture and read-only feasibility module; it has no runnable server, persistent store, reset route, or customer/driver/operations UI. Engineer 2 reports that no real Switch/Mattermost message, agent response, business-tool call, API reachability, or authentic evidence has been captured; their cloud environment has no Docker CLI/Compose or running Switch/API service, and the base URL plus agent credentials are unavailable. The API/service implementation is still in progress, and approval-read is not yet contracted, so execution remains fail-closed. No logs or screenshots are represented as successful evidence here. Recheck this section against actual E01/E02 service and room state before rehearsal; it is a blocker report, not an integration result.

## Golden-path operator checklist

Complete one row at a time for each run. Do not mark a row complete without observed evidence from that run.

### Clean reset and service preflight

- [ ] Record run number, date/time, branch/commit, operator, and target environment.
- [ ] Confirm this is an isolated demo database and the operator is authorized to reset it.
- [ ] Run `npm ci`, `npm test`, and `npm run typecheck`; retain unedited output.
- [ ] Run `npm run reset:demo`; verify health and the expected deterministic fixture IDs and timestamp.
- [ ] Confirm `INC-1042` is open, six affected shipments are linked, `MED-2048` is critical, and `VAN-009` / `DRV-009` are available/on duty.
- [ ] Open the demo, tracking, driver, and operations surfaces in separate profiles/tabs. Refresh at least one persisted view.
- [ ] Verify Switch Console, Mattermost, the real `relayops-dispatch` room, connected agent, and agent-to-API reachability. Record versions and actual endpoint health; never infer these from configuration alone.
- [ ] Verify recording display/audio, 1080p, readable text zoom, safe windows, no tokens, and a timestamped run record.

### Driver, Switch agent, dispatcher, backup driver, customer

- [ ] **Original driver:** report the `VAN-014` breakdown once; record the returned incident ID and persisted incident event.
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
