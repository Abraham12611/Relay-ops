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
- `Approval`: id, planId, planHash, status, approvedBy?, approvedAt?, expiresAt, consumedAt?, decisionReason?.
- `Assignment`: id, shipmentId, driverId, vehicleId, incidentId?, status PENDING|ACCEPTED|PICKED_UP|COMPLETED|DECLINED.
- `Event`: id, caseId, shipmentId?, actorType HUMAN|AGENT|SYSTEM, actorId, type, visibility INTERNAL|CUSTOMER, payload JSON (no secrets), createdAt, correlationId, idempotencyKey?.
- `CustomerNotification`: id, shipmentId, caseId, channel IN_APP, content, status QUEUED|VISIBLE|READ, createdAt.
- `IdempotencyRecord`: actor/action/key, result JSON, createdAt, unique composite index.

## Fixed seed fixture
Reset baseline: `VAN-014` is AVAILABLE, its six assigned shipments are IN_TRANSIT, and `INC-1042` is absent. An authenticated `DRV-014` breakdown report creates `INC-1042`, links those shipments, marks the van BROKEN_DOWN and the shipments AT_RISK. Critical shipment `MED-2048` / tracking `TRK-2048`, backup `VAN-009` / driver `DRV-009`. Coordinates are synthetic and dates use ISO timestamps.

## Shared types (illustrative TS contract; implementation chooses module ownership)
```ts
type Role = "CUSTOMER"|"DRIVER"|"DISPATCHER"|"DEMO";
type CaseStatus = "OPEN"|"INVESTIGATING"|"AWAITING_APPROVAL"|"APPROVED"|"EXECUTING"|"MONITORING"|"RESOLVED"|"REJECTED"|"FAILED"|"ESCALATED";
type PlanStatus = "DRAFT"|"PROPOSED"|"APPROVED"|"REJECTED"|"EXPIRED"|"EXECUTED"|"EXECUTION_FAILED";
type ApiError = { error: { code: string; message: string; correlationId: string } };
type RecoveryProposalInput = { incidentId: string; shipmentId: string; targetDriverId: string; targetVehicleId: string; newEtaAt: string; rationale: string; expectedIncidentVersion: number };
type RecoveryProposal = { id: string; incidentId: string; version: number; hash: string; status: PlanStatus; feasibility: { eligible: boolean; capacityOk: boolean; conflicts: string[] } };
type ApprovalRequest = { planId: string; planHash: string; decision: "APPROVE"|"REJECT"; reason?: string };
type ExecuteRequest = { approvalId: string; planId: string; idempotencyKey: string };
```

## Implemented API inventory (foundation)

- `GET /api/v1/health` — health status and database reachability.
- `POST /api/v1/demo/session` — accepts `x-demo-operator-key` and a role; issues a signed, HTTP-only persona cookie.
- `GET /api/v1/demo/state` and `POST /api/v1/demo/reset` — demo-operator-only inspection/reset.
- `POST /api/v1/incidents` — authenticated driver breakdown report; creates/deduplicates `INC-1042` and marks the affected shipments at risk.
- `GET /api/v1/incidents` — dispatcher or `incident:read` scope.
- `GET /api/v1/incidents/:id` — dispatcher or `incident:read` scope; includes version, affected shipments, and incident events.
- `GET /api/v1/incidents/:id/shipments` — dispatcher or `incident:read` scope.
- `GET /api/v1/shipments/:id` — dispatcher, assigned driver, or `shipment:read` scope.
- `GET /api/v1/vehicles/available` — dispatcher or `vehicle:read` scope.
- `POST /api/v1/recovery/simulate` — dispatcher or `recovery:simulate` scope; read-only feasibility.
- `POST /api/v1/recovery/plans` — dispatcher or `recovery:propose` scope; creates a version-checked proposal.

The full workflow is not implemented by this foundation. Planned routes still include customer tracking, driver jobs, approval decisions, recovery execution, assignment lifecycle, standalone incident-event reads, and notifications. Do not treat the planned routes below or in the end-to-end workflow as live API behavior.

Persona requests use the server-issued signed HTTP-only `relayops_demo_session` cookie. The client cannot select or spoof its role with a header. Initial session creation and demo reset/state access require `x-demo-operator-key`. Agent requests use `x-agent-api-key` with separate server-configured read, propose, and execute secrets; bearer `Authorization` credentials are not accepted by the foundation API. Read grants incident/shipment/vehicle reads and recovery simulation; propose additionally grants plan proposals; execute grants only execution when that downstream endpoint exists.

## API conventions
Business mutation calls require `Idempotency-Key`. A valid `X-Request-ID` is returned as `correlationId`; otherwise the server generates one. Return `{data, correlationId}` on success and the shared API error envelope on failure. HTTP: 200/201 success, 400 invalid, 401 unauthenticated, 403 forbidden, 404 unknown, 409 stale/duplicate conflict, 422 infeasible plan, 503 downstream unavailable. Never return private fields in customer response.

## Critical transactional implementation
On execution:
1. Start transaction; lock/read case, plan, approval, target vehicle and shipment.
2. Verify caller agent-execute scope, approval decided by DISPATCHER, `APPROVED`, not expired/consumed, exact hash/version, available target capacity.
3. If idempotency key already committed, return original receipt unchanged.
4. Create assignment, mark original superseded, update shipment and case, consume approval, append event + notification.
5. Commit once; return `assignmentId`, `shipmentId`, `caseId`, resulting status, `eventId`.
6. Driver acceptance/pickup and delivery require assigned driver and expected current status.
No approval route should accept an AI credential; no execution route should accept a dispatcher impersonated by agent.

## Contract test fixtures
- Valid target vehicle has spare capacity and no conflicting critical delivery.
- Invalid target is broken down, overloaded or double-booked.
- Duplicate incident submit and duplicate execute must be idempotent.
- Old proposal hash after replan must fail.
- Rejected/expired approval must fail.
- Delivered shipment cannot be reassigned.
- Customer API must strip INTERNAL events and all staff notes.
