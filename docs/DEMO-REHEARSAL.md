# Demo reliability and rehearsal gate

This checklist supplements [the demo runbook](07-DEMO-RUNBOOK.md), [quality gates](08-QUALITY-GATES.md), the workflow contract (03-WORKFLOWS.md), and the API contract (05-DATA-API.md). It does not claim that the application server, persistence, UI, or Switch integration exists until those components are actually exercised.

## Automated commands

Node.js 22.6+ is required. Install the exact lockfile dependencies first:

```bash
npm ci
npm test
npm run typecheck
```

`npm test` runs deterministic fixture/feasibility plus reset, request-header, and response-envelope helper checks; it reports the live API contract tests as **skipped**. They run only through `npm run test:integration`, which requires all integration variables and explicitly opts into mutating the configured demo service; a skipped integration test is not a pass. Run:

```bash
RELAYOPS_BASE_URL=http://127.0.0.1:3000 \
RELAYOPS_DEMO_OPERATOR_TOKEN=... \
RELAYOPS_AGENT_READ_TOKEN=... \
RELAYOPS_AGENT_PROPOSE_TOKEN=... \
RELAYOPS_AGENT_EXECUTE_TOKEN=... \
npm run test:integration
```

The ellipses above are placeholders, not usable credentials. Set each variable in the local environment or secret manager; never commit tokens, paste them into evidence, or capture them on screen. The backend contract in PR #12 uses the demo operator key to create signed, role-scoped HTTP-only persona sessions; the three separate agent keys use `x-agent-api-key`. Every request carries `X-Request-ID`, every business mutation also carries `Idempotency-Key`, success uses `{ data, correlationId }`, and failures use `{ error: { code, message, correlationId } }`. The harness checks these contracts against the integrated service; the current `develop` branch does not yet contain that backend.

A verified deterministic reset is:

```bash
RELAYOPS_BASE_URL=http://127.0.0.1:3000 \
RELAYOPS_DEMO_OPERATOR_TOKEN=... \
npm run reset:demo
```

The reset command posts to the demo-only reset endpoint, fetches the resulting state, and verifies the fixed seed timestamp, `PRE-INCIDENT` state, no incident or incident-shipment links, six `IN_TRANSIT` shipments still assigned to available `VAN-014`, critical `MED-2048` / `TRK-2048`, and available `VAN-009`. It mutates the configured demo database; point it only at an isolated demo environment. Reset does not create fabricated evidence.

One business-API smoke run is:

```bash
# Provide all variables from the integration-test command above.
npm run smoke
```

The smoke script resets state, reports the `VAN-014` breakdown to create `INC-1042`, confirms six affected shipments, and only then runs case-dependent simulations. It rejects broken/mismatched targets, checks duplicate incident idempotency, creates and revises a plan, rejects an unapproved and stale write, rejects agent self-approval, accepts only the dispatcher decision bound to plan ID/hash/version, reads the resulting approval, repeats execution with the same key and verifies the unchanged receipt, then checks driver acceptance/delivery and the customer projection. It is direct API evidence, **not** proof of a live Switch conversation or a browser UI. Run `npm run smoke` twice separately; each run performs a fresh reset. Capture the console output from both actual runs, including any failure, without editing it into a success claim.

As of this rehearsal-plan revision, E01's updated app/bootstrap, persistence, nullable case links, seed, and allowlisted driver-session work remains open in PR #12; E06's approval-read/execute and driver lifecycle work is published as draft PR #19. Neither PR is integrated into `develop`, so there is no integrated API here to exercise. Before API verification, reconcile the session route so `DRV-009` can be selected using the PR #12 allowlist, and use only an isolated test database. The Switch owner has not reported a real room exchange, agent response, or live business-tool call; authentic Switch evidence remains unverified. Do not mark API or Switch checks passed until actually exercised.

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

At this rehearsal-plan revision, `develop` still lacks the integrated service needed for the full smoke: E01's updated foundation is open in PR #12 and E06's approval/read/execute plus driver lifecycle implementation is open as draft PR #19. PR #19 must incorporate the updated PR #12 nullable-case and selected-driver session behavior before the smoke can exercise the DRV-009 path. Engineer 2 has not reported a real Switch/Mattermost message, agent response, business-tool call, or authentic evidence. No live API URL or role credentials were verified in this Session. No logs or screenshots are represented as successful evidence here. Recheck against the integrated service and actual room state before rehearsal; this is a blocker report, not an integration result.

## Quick live-demo checklist

Run these steps in order and record evidence from this run only:

1. **Customer:** run the demo reset to PRE-INCIDENT, open `/track/TRK-2048` before the incident, and note the actual current status/ETA.
2. **Driver:** sign in as `DRV-014`, report the `VAN-014` breakdown, and record the created `INC-1042` receipt.
3. **Switch agent:** in the real `relayops-dispatch` Mattermost room, ask `relay-recovery` to investigate and propose a feasible backup without executing; verify the real reply and read/simulation tool calls.
4. **Dispatcher:** review the same plan in the authenticated operations UI and approve the exact plan version/hash.
5. **Backup driver:** as `DRV-009`, accept the returned assignment, confirm pickup, and deliver with the demo proof reference.
6. **Delivered customer:** refresh `/track/TRK-2048` and verify `DELIVERED`, the customer-visible timeline, and no private/internal fields.

**If Switch is unavailable:** say that the Switch step and full golden path are blocked. Do not stage chat, replay a generated message, or call API smoke output Switch proof. If the application/API portions are genuinely available, they may be shown as an explicitly labeled degraded/API-only walkthrough; continue only with truthful live state. Previously captured authentic Switch evidence may be shown only as dated prior evidence, not as a live exchange.

## Golden-path operator checklist

Complete one row at a time for each run. Do not mark a row complete without observed evidence from that run.

### Clean reset and service preflight

- [ ] Record run number, date/time, branch/commit, operator, and target environment.
- [ ] Confirm this is an isolated demo database and the operator is authorized to reset it.
- [ ] Run `npm ci`, `npm test`, and `npm run typecheck`; retain unedited output.
- [ ] Run `npm run reset:demo`; verify health and the expected deterministic fixture IDs and timestamp.
- [ ] Confirm reset is PRE-INCIDENT: no `INC-1042` or incident links; six shipments are IN_TRANSIT on available `VAN-014`; `MED-2048` is critical; `VAN-009` / `DRV-009` are available/on duty.
- [ ] Open the demo, tracking, driver, and operations surfaces in separate profiles/tabs. Refresh at least one persisted view.
- [ ] Verify Switch Console, Mattermost, the real `relayops-dispatch` room, connected agent, and agent-to-API reachability. Record versions and actual endpoint health; never infer these from configuration alone.
- [ ] Verify recording display/audio, 1080p, readable text zoom, safe windows, no tokens, and a timestamped run record.

### Customer, driver, Switch agent, dispatcher, backup driver, delivered customer

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
