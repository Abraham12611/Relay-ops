export type Role = "CUSTOMER" | "DRIVER" | "DISPATCHER" | "DEMO";

export type CaseStatus =
  | "OPEN"
  | "INVESTIGATING"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "EXECUTING"
  | "MONITORING"
  | "RESOLVED"
  | "REJECTED"
  | "FAILED"
  | "ESCALATED";

export type PlanStatus =
  | "DRAFT"
  | "PROPOSED"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "EXECUTED"
  | "EXECUTION_FAILED";

export type VehicleStatus = "AVAILABLE" | "IN_SERVICE" | "BROKEN_DOWN";
export type DutyStatus = "ON_DUTY" | "OFF_DUTY";
export type ShipmentPriority = "NORMAL" | "CRITICAL";
export type ShipmentStatus =
  | "IN_TRANSIT"
  | "AT_RISK"
  | "REASSIGNMENT_PENDING"
  | "REASSIGNED"
  | "PICKED_UP_BY_BACKUP"
  | "DELIVERED"
  | "EXCEPTION"
  | "DELIVERY_FAILED";
export type IncidentType = "BREAKDOWN" | "WRONG_PARCEL" | "FAILED_DELIVERY";
export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AssignmentStatus = "PENDING" | "ACCEPTED" | "PICKED_UP" | "COMPLETED" | "DECLINED";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "CONSUMED";
export type ActorType = "HUMAN" | "AGENT" | "SYSTEM";
export type EventVisibility = "INTERNAL" | "CUSTOMER";
export type NotificationChannel = "IN_APP";
export type NotificationStatus = "QUEUED" | "VISIBLE" | "READ";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface User {
  id: string;
  displayName: string;
  role: Role;
  demo: boolean;
}

export interface Vehicle {
  id: string;
  code: string;
  capacityUnits: number;
  occupiedUnits: number;
  status: VehicleStatus;
  locationLat: number;
  locationLng: number;
}

export interface Driver {
  id: string;
  userId: string;
  vehicleId: string;
  dutyStatus: DutyStatus;
  lastKnownLat: number;
  lastKnownLng: number;
}

export interface Shipment {
  id: string;
  trackingCode: string;
  customerId: string;
  assignedDriverId: string;
  assignedVehicleId: string;
  priority: ShipmentPriority;
  promisedAt: string;
  etaAt: string;
  status: ShipmentStatus;
  units: number;
  proofOfDeliveryRef: string | null;
}

export interface Incident {
  id: string;
  type: IncidentType;
  vehicleId: string;
  reporterId: string;
  severity: IncidentSeverity;
  status: CaseStatus;
  summary: string;
  createdAt: string;
  resolvedAt: string | null;
  currentPlanId: string | null;
}

export interface IncidentShipment {
  incidentId: string;
  shipmentId: string;
  originalStatus: ShipmentStatus;
}

export interface RecoveryFeasibility {
  eligible: boolean;
  capacityOk: boolean;
  conflicts: string[];
}

export interface RecoveryPlan {
  id: string;
  incidentId: string;
  version: number;
  targetShipmentId: string;
  proposedVehicleId: string;
  proposedDriverId: string;
  newEtaAt: string;
  rationale: string;
  feasibilitySnapshot: RecoveryFeasibility;
  hash: string;
  status: PlanStatus;
}

export interface Approval {
  id: string;
  planId: string;
  planHash: string;
  status: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  expiresAt: string;
  consumedAt: string | null;
  decisionReason: string | null;
}

export interface Assignment {
  id: string;
  shipmentId: string;
  driverId: string;
  vehicleId: string;
  incidentId: string | null;
  status: AssignmentStatus;
}

export interface Event {
  id: string;
  caseId: string;
  shipmentId: string | null;
  actorType: ActorType;
  actorId: string;
  type: string;
  visibility: EventVisibility;
  payload: JsonValue;
  createdAt: string;
  correlationId: string;
  idempotencyKey: string | null;
}

export interface CustomerNotification {
  id: string;
  shipmentId: string;
  caseId: string;
  channel: NotificationChannel;
  content: string;
  status: NotificationStatus;
  createdAt: string;
}

export interface IdempotencyRecord {
  actor: string;
  action: string;
  key: string;
  result: JsonValue;
  createdAt: string;
}

export interface RecoveryProposalInput {
  incidentId: string;
  shipmentId: string;
  targetDriverId: string;
  targetVehicleId: string;
  newEtaAt: string;
  rationale: string;
  expectedIncidentVersion: number;
}

export interface RecoveryProposal {
  id: string;
  incidentId: string;
  version: number;
  hash: string;
  status: PlanStatus;
  feasibility: RecoveryFeasibility;
}

export interface ApprovalRequest {
  planId: string;
  planHash: string;
  decision: "APPROVE" | "REJECT";
  reason?: string;
}

export interface ExecuteRequest {
  approvalId: string;
  planId: string;
  idempotencyKey: string;
}

export interface ApiSuccess<T> {
  data: T;
  correlationId: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    correlationId: string;
  };
}

export interface DemoScenario {
  seededAt: string;
  users: readonly User[];
  vehicles: readonly Vehicle[];
  drivers: readonly Driver[];
  shipments: readonly Shipment[];
  incidents: readonly Incident[];
  incidentShipments: readonly IncidentShipment[];
  recoveryPlans: readonly RecoveryPlan[];
  approvals: readonly Approval[];
  assignments: readonly Assignment[];
  events: readonly Event[];
  notifications: readonly CustomerNotification[];
  idempotencyRecords: readonly IdempotencyRecord[];
}

export interface RecoverySimulationInput {
  incidentId: string;
  shipmentId: string;
  targetDriverId: string;
  targetVehicleId: string;
}
