# 05 — Canonical data model, DTOs and API contracts

> **Contract freeze at phase F1.** Backend engineer owns `src/types/contracts.ts`. No parallel engineer may silently alter this contract after freeze. Changes require RFC in PR and sync with affected owners.

## Entities
- `User`: id, displayName, role CUSTOMER|DRIVER|DISPATCHER|DEMO, demo flag.
- `Vehicle`: id, code, capacityUnits, occupiedUnits, status AVAILABLE|IN_SERVICE|BROKEN_DOWN, locationLat/Lng (seed only).
- `Driver`: id, userId, vehicleId, dutyStatus, lastKnownLat/Lng.
- `Shipment`: id, trackingCode, customerId, assignedDriverId, assignedVehicleId, priority NORMAL|CRITICAL, promisedAt, etaAt, status, units, proofOfDeliveryRef?.
- `Incident`: id, type BREAKDOWN|WRONG_PARCEL|FAILED_DELIVERY, vehicleId, reporterId, severity, status, summary, createdAt, resolvedAt?, currentPlanId?.
- `IncidentShipment`: incidentId, shipmentId, originalStatus (many-to-many).
- `RecoveryPlan`: id, incidentId, version, targetShipmentId, proposedVehicleId, proposedDriverId, newEtaAt, rationale, feasibilitySnapshot, hash, status.
- `Approval`: id, planId, planHash, status, approvedBy?, approvedAt?, expiresAt, consumedAt?, decisionReason?.
- `Assignment`: id, shipmentId, driverId, vehicleId, incidentId?, status PENDING|ACCEPTED|PICKED_UP|COMPLETED|DECLINED.
- `Event`: id, caseId, shipmentId?, actorType HUMAN|AGENT|SYSTEM, actorId, type, visibility INTERNAL|CUSTOMER, payload JSON (no secrets), createdAt, correlationId, idempotencyKey?.
- `CustomerNotification`: id, shipmentId, caseId, channel IN_APP, content, status QUEUED|VISIBLE|READ, createdAt.
- `IdempotencyRecord`: actor/action/key, result JSON, createdAt, unique composite index.

## Fixed seed fixture
Case: `INC-1042`; critical shipment `MED-2048`; tracking `TRK-2048`; broken vehicle `VAN-014`; backup `VAN-009`; backup driver `DRV-009`; primary driver `DRV-014`; six affected shipments. All coordinates synthetic in one city and time clock anchored to seed time. Keep dates explicitly in local/ISO format, not arbitrary browser time.

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

## API inventory
| Method | Route | Caller | Response / side effect |
|---|---|---|---|
| GET | /api/v1/health | all | db healthy, configured integration hints |
| POST | /api/v1/demo/reset | demo only | re-seed, clear case events |
| GET | /api/v1/demo/state | demo only | fixture state and health |
| GET | /api/v1/track/:code | public token | safe shipment and public timeline |
| GET | /api/v1/driver/jobs | driver | assigned jobs |
| POST | /api/v1/incidents | driver | create/dedupe case, mark at-risk |
| GET | /api/v1/incidents | dispatcher | filtered list |
| GET | /api/v1/incidents/:id | dispatcher/agent-read | case details/events |
| GET | /api/v1/shipments/:id | authorized | shipment detail |
| GET | /api/v1/vehicles/available | dispatcher/agent-read | candidate vehicles |
| POST | /api/v1/recovery/simulate | dispatcher/agent-read | capacity/conflict check only |
| POST | /api/v1/recovery/plans | agent-propose/dispatcher | versioned proposal |
| POST | /api/v1/recovery/approvals | dispatcher | approve/reject exact plan hash |
| POST | /api/v1/recovery/execute | agent-execute | transactionally reassign, consume approval |
| POST | /api/v1/assignments/:id/accept | assigned driver | acceptance |
| POST | /api/v1/assignments/:id/pickup | assigned driver | pickup confirmation |
| POST | /api/v1/assignments/:id/deliver | assigned driver | proof + delivery |
| GET | /api/v1/incidents/:id/events | authorized | internal audit or safe projection |
| GET | /api/v1/notifications | customer | own customer-safe entries |

Agent tool gateway may expose aliases in `/api/agent/*`; map them to SAME business functions above, keeping role/scopes enforced.

## API conventions
All mutation calls require request ID and `Idempotency-Key` (the UI may generate this). Return `{data, correlationId}` on success and `ApiError` on failure. HTTP: 200/201 success, 400 invalid, 401 unauthenticated, 403 forbidden, 404 unknown, 409 stale/duplicate conflict, 422 infeasible plan, 503 downstream unavailable. Never return private fields in customer response.

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
