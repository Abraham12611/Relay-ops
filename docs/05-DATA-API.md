# 05 — Canonical data model, DTOs and API contracts

> **Contract freeze at phase F1.** Backend engineer owns `src/types/contracts.ts`. No parallel engineer may silently alter this contract after freeze. Changes require RFC in PR and sync with affected owners.

## Entities
- `User`: id, displayName, role CUSTOMER|DRIVER|DISPATCHER|DEMO, demo flag.
- `Vehicle`: id, code, capacityUnits, occupiedUnits, status AVAILABLE|IN_SERVICE|BROKEN_DOWN, locationLat/Lng (seed only).
- `Driver`: id, userId, vehicleId, dutyStatus, lastKnownLat/Lng.
- `Shipment`: id, trackingCode, customerId, assignedDriverId, assignedVehicleId, priority NORMAL|CRITICAL, promisedAt, etaAt, status, units, proofOfDeliveryRef?.
- `Incident`: id, type BREAKDOWN|WRONG_PARCEL|FAILED_DELIVERY, vehicleId, reporterId, severity, status, summary, version (optimistic concurrency), createdAt, resolvedAt?, currentPlanId?. Plan proposals supply expected version; stale versions return 409 without writing.
- `IncidentShipment`: incidentId, shipmentId, originalStatus (many-to-many).
- `RecoveryPlan`: id, incidentId, version, targetShipmentId, proposedVehicleId, proposedDriverId, newEtaAt, rationale, feasibilitySnapshot, hash, status.
- `Approval`: id, planId, planHash (the immutable proposal hash commits the plan version), status, approvedBy?, approvedAt?, expiresAt, consumedAt?, decisionReason?. The related immutable `RecoveryPlan.version` is the canonical version; the schema does not duplicate it on `Approval`.
- `Assignment`: id, shipmentId, driverId, vehicleId, incidentId?, status PENDING|ACCEPTED|PICKED_UP|COMPLETED|DECLINED.
- `Event`: id, caseId? (nullable for shipment-only events), shipmentId?, actorType HUMAN|AGENT|SYSTEM, actorId, type, visibility INTERNAL|CUSTOMER, payload JSON (no secrets), createdAt, correlationId, idempotencyKey?.
- `CustomerNotification`: id, shipmentId, caseId? (nullable for shipment-only notices), channel IN_APP, content, status QUEUED|VISIBLE|READ, createdAt.
- `IdempotencyRecord`: actor/action/key, result JSON, createdAt, unique composite index.

## Fixed seed fixture
Reset baseline: `VAN-014` is AVAILABLE, its six assigned shipments are IN_TRANSIT, and `INC-1042` is absent. Seven deterministic customer-visible `SHIPMENT_REGISTERED` events are seeded at `SEEDED_AT` with nullable `caseId` to provide shipment history and a persisted baseline update time. An authenticated `DRV-014` breakdown report creates `INC-1042`, links those shipments, marks the van BROKEN_DOWN and the shipments AT_RISK. Critical shipment `MED-2048` / tracking `TRK-2048`, backup `VAN-009` / driver `DRV-009`. Coordinates are synthetic and dates use ISO timestamps.

## Shared types (illustrative TS contract; implementation chooses module ownership)
```ts
type Role = "CUSTOMER"|"DRIVER"|"DISPATCHER"|"DEMO";
type CaseStatus = "OPEN"|"INVESTIGATING"|"AWAITING_APPROVAL"|"APPROVED"|"EXECUTING"|"MONITORING"|"RESOLVED"|"REJECTED"|"FAILED"|"ESCALATED";
type PlanStatus = "DRAFT"|"PROPOSED"|"APPROVED"|"REJECTED"|"EXPIRED"|"EXECUTED"|"EXECUTION_FAILED";
type ApiError = { error: { code: string; message: string; correlationId: string } };
type RecoveryProposalInput = { incidentId: string; shipmentId: string; targetDriverId: string; targetVehicleId: string; newEtaAt: string; rationale: string; expectedIncidentVersion: number };
type RecoveryProposal = { id: string; incidentId: string; version: number; hash: string; status: PlanStatus; feasibility: { eligible: boolean; capacityOk: boolean; conflicts: string[] } };
type ApprovalRequest = { planId: string; planHash: string; planVersion: number; decision: "APPROVE"|"REJECT"; reason?: string };
type ExecuteRequest = { approvalId: string; planId: string; idempotencyKey: string };
```

## Implemented API inventory (foundation)

- `GET /api/v1/health` — health status and database reachability.
- `POST /api/v1/demo/session` — accepts `x-demo-operator-key` and a role; DRIVER may select only `DRV-014` or `DRV-009` via `driverId`; issues a signed, HTTP-only persona cookie. Client-supplied `userId` is rejected.
- `POST /api/demo/session` — same-origin browser bridge for demo sessions; it keeps the operator key server-side and returns the same signed cookie.
- `GET /api/v1/demo/state` and `POST /api/v1/demo/reset` — demo-operator-only inspection/reset.
- `POST /api/v1/incidents` — authenticated driver breakdown report; creates/deduplicates `INC-1042`, returns the incident fields directly plus a legacy `incident` alias, and marks affected shipments at risk.
- `GET /api/v1/incidents` — dispatcher or `incident:read` scope.
- `GET /api/v1/incidents/:id` — dispatcher or `incident:read` scope; includes version, affected shipments, events, and a `currentPlan` DTO with version/hash/feasibility when a proposal exists.
- `GET /api/v1/incidents/:id/events` — dispatcher or `incident:read` scope; returns chronological incident events.
- `GET /api/v1/incidents/:id/shipments` — dispatcher or `incident:read` scope.
- `GET /api/v1/driver/jobs` — signed DRIVER persona only; returns the scoped `DriverJobDto` rows for the signed driver, with customer ID and internal shipment units omitted.
- `GET /api/v1/shipments/:id` — dispatcher, assigned driver, or `shipment:read` scope; returns the canonical direct `Shipment` DTO, not raw Prisma relations.
- `GET /api/v1/vehicles/available` — dispatcher or `vehicle:read` scope.
- `POST /api/v1/recovery/simulate` — dispatcher or `recovery:simulate` scope; read-only feasibility.
- `POST /api/v1/recovery/plans` — dispatcher or `recovery:propose` scope; creates a version-checked proposal.
- `POST /api/v1/recovery/approvals` — an authenticated dispatcher persona only; accepts `{ planId, planHash, planVersion, decision, reason? }`, verifies the current immutable plan/version, and records an approval or rejection plus an audit event.
- `GET /api/v1/recovery/approvals/:planId` — dispatcher or `incident:read` scope; reads the persisted decision from its related plan and atomically records expiry when an approval has elapsed. `isCurrent` is true only while the approval is approved, unconsumed, unexpired, and still matches the current incident plan/version.
- `POST /api/v1/recovery/execute` — `recovery:execute` agent scope only; accepts `{ approvalId, planId, idempotencyKey }`, rechecks approval/version/expiry/shipment/capacity in one transaction, and returns a persisted execution receipt.
- `POST /api/v1/assignments/:id/accept` and `/pickup` — signed-in assigned driver only; ordered and idempotent state transitions with audit events; pickup also writes a customer-visible update.
- `POST /api/v1/assignments/:id/deliver` — signed-in assigned driver only; requires a delivery proof reference after acceptance and pickup, and persists delivery, customer update, audit event, and eligible incident closure together.
- `GET /api/v1/track/:trackingCode` — public tracking projection from persisted shipment data; returns only customer-visible timeline events and visible/read notifications.

The backend recovery, driver, and customer service flow is implemented on top of this foundation. Customer notifications are persisted and surfaced through tracking; there is no separate notifications endpoint. Real Switch/Mattermost agent conversation and live-service golden-path evidence remain unverified.

Persona requests use the server-issued signed HTTP-only `relayops_demo_session` cookie. Role/driver identity is validated and signed server-side; an arbitrary role header or `userId` body field cannot switch identity. Direct session creation and demo reset/state access require `x-demo-operator-key`; the same-origin browser bridge uses the server-held key and only runs through the demo session handler. Agent requests use `x-agent-api-key` with separate server-configured read, propose, and execute secrets; bearer `Authorization` credentials are not accepted by the foundation API. Read grants incident/shipment/vehicle reads and recovery simulation; propose additionally grants plan proposals; execute grants only execution when that downstream endpoint exists.

## API conventions
Business mutations require `Idempotency-Key`. Approval, execution, and driver lifecycle mutations also require a valid `X-Request-ID`; execution's body `idempotencyKey` must match the header. A valid request ID is echoed as `correlationId`; otherwise reads and other foundation routes generate one. Return `{data, correlationId}` on success and the shared API error envelope on failure. Duplicate recovery execution returns the original receipt without another assignment; driver delivery replays bind to the same proof reference. HTTP: 200/201 success, 400 invalid, 401 unauthenticated, 403 forbidden, 404 unknown, 409 stale/duplicate conflict, 422 infeasible plan, 503 downstream unavailable. Never return private fields in customer response.

## Critical transactional implementation
On approval and execution:
1. A dispatcher-only decision must match the exact plan ID, immutable hash, and version; the canonical hash is recomputed from persisted plan fields/snapshot so version drift cannot reuse a stale approval.
2. After validating the caller's `recovery:execute` scope, start one execution transaction and recheck the persisted dispatcher decision, approval status/expiry/consumption, current incident/plan version, shipment eligibility, driver/vehicle eligibility, and available capacity.
3. If the execution idempotency key is already committed, return its original receipt unchanged without creating another assignment.
4. Create the new assignment, reassign the shipment, update source/target vehicle loads and incident status, consume the approval, and append internal audit plus customer-visible event/notification records atomically. The superseded assignment remains historical but is not listed as a current driver job.
5. Commit once; return `assignmentId`, `shipmentId`, `caseId`, `eventId`, `planHash`, `planVersion`, and resulting status.
6. Driver acceptance, pickup, and delivery require the current assigned driver and ordered status; delivery also persists the proof reference. Every transition writes an auditable event; pickup and delivery also persist customer-safe updates.
7. Resolve an incident only after every linked shipment is `DELIVERED` or `DELIVERY_FAILED`. Customer tracking reads persisted shipment state and excludes INTERNAL events and staff-only fields.
No approval route should accept an AI credential; no execution route should accept a dispatcher impersonated by agent.

## Contract test fixtures
- Valid target vehicle has spare capacity and no conflicting critical delivery.
- Invalid target is broken down, overloaded or double-booked.
- Duplicate incident submit and duplicate execute must be idempotent.
- Old proposal hash after replan must fail.
- Rejected/expired approval must fail.
- Delivered shipment cannot be reassigned.
- Customer API must strip INTERNAL events and all staff notes.
