import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Principal } from "../lib/auth.ts";
import { prisma } from "../lib/db.ts";
import { ApiFault } from "../lib/http.ts";
import { SEEDED_AT } from "../fixtures/scenario.ts";

export interface ShipmentDto {
  id: string;
  trackingCode: string;
  customerId: string;
  assignedDriverId: string;
  assignedVehicleId: string;
  priority: string;
  promisedAt: string;
  etaAt: string;
  status: string;
  units: number;
  proofOfDeliveryRef: string | null;
}

export interface AssignmentDto {
  id: string;
  shipmentId: string;
  driverId: string;
  vehicleId: string;
  incidentId: string | null;
  status: string;
}

export interface DriverJobDto {
  assignment: AssignmentDto;
  shipment: Omit<ShipmentDto, "customerId" | "units">;
}

export interface CustomerTrackingSnapshot {
  shipment: {
    id: string;
    trackingCode: string;
    priority: string;
    status: string;
    promisedAt: string;
    etaAt: string;
    updatedAt: string;
    deliveredAt: string | null;
  };
  timeline: Array<{
    id: string;
    kind: "STATUS" | "BREAKDOWN" | "RECOVERY" | "ETA_REVISED" | "DELIVERY";
    visibility: "CUSTOMER";
    title: string;
    message: string;
    createdAt: string;
  }>;
  notifications: Array<{
    id: string;
    kind: "STATUS" | "BREAKDOWN" | "RECOVERY" | "ETA_REVISED" | "DELIVERY" | "GENERAL";
    message: string;
    createdAt: string;
  }>;
}

export interface AssignmentMutationResult {
  data: AssignmentDto;
  replayed: boolean;
}

type Transaction = Prisma.TransactionClient;
type Transition = "accept" | "pickup" | "deliver";

const ACTIVE_ASSIGNMENT_STATUSES = ["PENDING", "ACCEPTED", "PICKED_UP"];
const TERMINAL_SHIPMENT_STATUSES = ["DELIVERED", "DELIVERY_FAILED"];

function assertDriver(principal: Principal): asserts principal is Extract<Principal, { kind: "persona" }> {
  if (principal.kind !== "persona" || principal.role !== "DRIVER") {
    throw new ApiFault(403, "DRIVER_REQUIRED", "Only an authenticated driver persona may use driver operations.");
  }
}

function shipmentDto(shipment: {
  id: string;
  trackingCode: string;
  customerId: string;
  assignedDriverId: string;
  assignedVehicleId: string;
  priority: string;
  promisedAt: Date;
  etaAt: Date;
  status: string;
  units: number;
  proofOfDeliveryRef: string | null;
}): ShipmentDto {
  return {
    id: shipment.id,
    trackingCode: shipment.trackingCode,
    customerId: shipment.customerId,
    assignedDriverId: shipment.assignedDriverId,
    assignedVehicleId: shipment.assignedVehicleId,
    priority: shipment.priority,
    promisedAt: shipment.promisedAt.toISOString(),
    etaAt: shipment.etaAt.toISOString(),
    status: shipment.status,
    units: shipment.units,
    proofOfDeliveryRef: shipment.proofOfDeliveryRef,
  };
}

function assignmentDto(assignment: {
  id: string;
  shipmentId: string;
  driverId: string;
  vehicleId: string;
  incidentId: string | null;
  status: string;
}): AssignmentDto {
  return {
    id: assignment.id,
    shipmentId: assignment.shipmentId,
    driverId: assignment.driverId,
    vehicleId: assignment.vehicleId,
    incidentId: assignment.incidentId,
    status: assignment.status,
  };
}

interface StoredAssignmentResult {
  assignment: AssignmentDto;
  proofOfDeliveryRef?: string | null;
}

function parseStoredAssignment(value: string): StoredAssignmentResult {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Invalid result.");
    const record = parsed as Record<string, unknown>;
    const assignment = (record.assignment ?? record) as AssignmentDto;
    if (!assignment || typeof assignment !== "object" || typeof assignment.id !== "string") throw new Error("Invalid assignment.");
    return {
      assignment,
      ...(typeof record.proofOfDeliveryRef === "string" || record.proofOfDeliveryRef === null
        ? { proofOfDeliveryRef: record.proofOfDeliveryRef }
        : {}),
    };
  } catch {
    throw new ApiFault(500, "IDEMPOTENCY_RESULT_INVALID", "Stored assignment result could not be read.");
  }
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function appendEvent(
  tx: Transaction,
  event: {
    caseId: string | null;
    shipmentId: string;
    actorType: "HUMAN" | "SYSTEM";
    actorId: string;
    type: string;
    visibility: "INTERNAL" | "CUSTOMER";
    payload: Record<string, unknown>;
    createdAt: Date;
    correlationId: string;
    idempotencyKey?: string;
  },
): Promise<string> {
  const id = `EVT-${randomUUID()}`;
  await tx.businessEvent.create({
    data: {
      id,
      caseId: event.caseId,
      shipmentId: event.shipmentId,
      actorType: event.actorType,
      actorId: event.actorId,
      type: event.type,
      visibility: event.visibility,
      payload: JSON.stringify(event.payload),
      createdAt: event.createdAt,
      correlationId: event.correlationId,
      idempotencyKey: event.idempotencyKey ?? null,
    },
  });
  return id;
}

async function appendCustomerUpdate(
  tx: Transaction,
  input: {
    caseId: string | null;
    shipmentId: string;
    kind: "STATUS" | "RECOVERY" | "DELIVERY";
    title: string;
    message: string;
    correlationId: string;
    idempotencyKey: string;
    createdAt: Date;
  },
): Promise<void> {
  await appendEvent(tx, {
    caseId: input.caseId,
    shipmentId: input.shipmentId,
    actorType: "SYSTEM",
    actorId: "SYSTEM",
    type: "CUSTOMER_STATUS_UPDATED",
    visibility: "CUSTOMER",
    payload: { kind: input.kind, title: input.title, message: input.message },
    createdAt: input.createdAt,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
  });
  await tx.customerNotification.create({
    data: {
      id: `NTF-${randomUUID()}`,
      shipmentId: input.shipmentId,
      caseId: input.caseId,
      channel: "IN_APP",
      content: input.message,
      status: "VISIBLE",
      createdAt: input.createdAt,
    },
  });
}

async function driverForUser(tx: Transaction, userId: string, requireOnDuty = false) {
  const driver = await tx.driver.findUnique({ where: { userId } });
  if (!driver) throw new ApiFault(403, "DRIVER_NOT_FOUND", "The authenticated persona is not assigned to a driver.");
  if (requireOnDuty && driver.dutyStatus !== "ON_DUTY") {
    throw new ApiFault(403, "DRIVER_OFF_DUTY", "An off-duty driver cannot change an assignment.");
  }
  return driver;
}

export async function readDriver(principal: Principal) {
  assertDriver(principal);
  return driverForUser(prisma, principal.userId);
}

export async function listDriverJobs(principal: Principal): Promise<DriverJobDto[]> {
  assertDriver(principal);
  const driver = await driverForUser(prisma, principal.userId);
  const assignments = await prisma.assignment.findMany({
    where: {
      driverId: driver.id,
      status: { in: ACTIVE_ASSIGNMENT_STATUSES },
      shipment: { is: { assignedDriverId: driver.id } },
    },
    include: { shipment: true },
    orderBy: { id: "asc" },
  });
  return assignments.map(({ shipment, ...assignment }) => {
    const fullShipment = shipmentDto(shipment);
    const { customerId: _customerId, units: _units, ...jobShipment } = fullShipment;
    return { assignment: assignmentDto(assignment), shipment: jobShipment };
  });
}

export async function readShipmentDto(shipmentId: string): Promise<ShipmentDto> {
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new ApiFault(404, "SHIPMENT_NOT_FOUND", `Shipment ${shipmentId} was not found.`);
  return shipmentDto(shipment);
}

export async function transitionDriverAssignment(
  assignmentId: string,
  transition: Transition,
  principal: Principal,
  key: string,
  correlationId: string,
  proofOfDeliveryRef?: string,
  now = new Date(),
): Promise<AssignmentMutationResult> {
  assertDriver(principal);
  if (transition === "deliver" && !proofOfDeliveryRef?.trim()) {
    throw new ApiFault(400, "DELIVERY_PROOF_REQUIRED", "proofOfDeliveryRef is required to confirm delivery.");
  }
  if (proofOfDeliveryRef && (proofOfDeliveryRef.trim().length > 500 || /[\r\n\u0000]/.test(proofOfDeliveryRef))) {
    throw new ApiFault(400, "INVALID_DELIVERY_PROOF", "proofOfDeliveryRef must be a single non-empty reference of at most 500 characters.");
  }

  return prisma.$transaction(async (tx) => {
    const driver = await driverForUser(tx, principal.userId, true);
    const assignment = await tx.assignment.findUnique({
      where: { id: assignmentId },
      include: { shipment: true },
    });
    if (!assignment) throw new ApiFault(404, "ASSIGNMENT_NOT_FOUND", `Assignment ${assignmentId} was not found.`);
    if (assignment.driverId !== driver.id) {
      throw new ApiFault(403, "ASSIGNMENT_NOT_OWNED", "A driver may change only their own assignments.");
    }
    if (
      assignment.shipment.assignedDriverId !== driver.id ||
      assignment.shipment.assignedVehicleId !== assignment.vehicleId
    ) {
      throw new ApiFault(409, "ASSIGNMENT_SUPERSEDED", "This assignment is no longer the shipment's current assignment.");
    }
    const incidentId = assignment.incidentId ?? (await tx.incidentShipment.findFirst({
      where: { shipmentId: assignment.shipmentId },
      select: { incidentId: true },
      orderBy: { incidentId: "asc" },
    }))?.incidentId ?? null;

    const action = `assignment.${transition}`;
    const prior = await tx.idempotencyRecord.findUnique({
      where: { actor_action_key: { actor: principal.userId, action, key } },
    });
    if (prior) {
      const stored = parseStoredAssignment(prior.result);
      const storedProof = stored.proofOfDeliveryRef === undefined
        ? assignment.shipment.proofOfDeliveryRef
        : stored.proofOfDeliveryRef;
      if (
        stored.assignment.id !== assignment.id ||
        (transition === "deliver" && storedProof !== proofOfDeliveryRef?.trim())
      ) {
        throw new ApiFault(409, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different assignment request.");
      }
      return { data: stored.assignment, replayed: true };
    }

    const currentStatus = assignment.status;
    const expectedStatus = transition === "accept" ? "PENDING" : transition === "pickup" ? "ACCEPTED" : "PICKED_UP";
    const nextStatus = transition === "accept" ? "ACCEPTED" : transition === "pickup" ? "PICKED_UP" : "COMPLETED";
    if (currentStatus === nextStatus) {
      if (transition === "deliver" && assignment.shipment.proofOfDeliveryRef !== proofOfDeliveryRef?.trim()) {
        throw new ApiFault(409, "DELIVERY_ALREADY_CONFIRMED", "Delivery was already confirmed with a different proof reference.");
      }
      const alreadyApplied = assignmentDto(assignment);
      await tx.idempotencyRecord.create({
        data: {
          actor: principal.userId,
          action,
          key,
          result: JSON.stringify({ assignment: alreadyApplied, proofOfDeliveryRef: assignment.shipment.proofOfDeliveryRef }),
          createdAt: now,
        },
      });
      return { data: alreadyApplied, replayed: true };
    }
    if (currentStatus !== expectedStatus) {
      throw new ApiFault(409, "INVALID_ASSIGNMENT_TRANSITION", `Cannot ${transition} an assignment in ${currentStatus} state.`);
    }
    const shipment = assignment.shipment;
    if (transition === "pickup" && !["REASSIGNED", "IN_TRANSIT"].includes(shipment.status)) {
      throw new ApiFault(409, "SHIPMENT_NOT_READY_FOR_PICKUP", "The shipment must be assigned and available for pickup.");
    }
    if (transition === "deliver" && !["PICKED_UP_BY_BACKUP", "IN_TRANSIT"].includes(shipment.status)) {
      throw new ApiFault(409, "PICKUP_REQUIRED", "A driver must accept and pick up the shipment before confirming delivery.");
    }

    const updatedAssignmentCount = await tx.assignment.updateMany({
      where: { id: assignment.id, driverId: driver.id, status: expectedStatus },
      data: { status: nextStatus },
    });
    if (updatedAssignmentCount.count !== 1) {
      throw new ApiFault(409, "ASSIGNMENT_STATE_CHANGED", "The assignment changed before this transition could be saved.");
    }

    let resultingShipmentStatus = shipment.status;
    if (transition === "pickup" && shipment.status === "REASSIGNED") resultingShipmentStatus = "PICKED_UP_BY_BACKUP";
    if (transition === "deliver") resultingShipmentStatus = "DELIVERED";
    if (transition !== "accept") {
      const shipmentChange = await tx.shipment.updateMany({
        where: {
          id: shipment.id,
          assignedDriverId: driver.id,
          assignedVehicleId: assignment.vehicleId,
          status: shipment.status,
        },
        data: {
          status: resultingShipmentStatus,
          ...(transition === "deliver" ? { proofOfDeliveryRef: proofOfDeliveryRef?.trim() ?? null } : {}),
        },
      });
      if (shipmentChange.count !== 1) {
        throw new ApiFault(409, "SHIPMENT_STATE_CHANGED", "The shipment changed before this transition could be saved.");
      }
    }

    const eventType = transition === "accept" ? "DRIVER_ASSIGNMENT_ACCEPTED" : transition === "pickup" ? "DRIVER_PICKUP_CONFIRMED" : "DRIVER_DELIVERY_CONFIRMED";
    await appendEvent(tx, {
      caseId: incidentId,
      shipmentId: shipment.id,
      actorType: "HUMAN",
      actorId: principal.userId,
      type: eventType,
      visibility: "INTERNAL",
      payload: {
        assignmentId: assignment.id,
        shipmentId: shipment.id,
        driverId: driver.id,
        fromStatus: currentStatus,
        toStatus: nextStatus,
        shipmentStatus: resultingShipmentStatus,
        ...(transition === "deliver" ? { proofOfDeliveryRef: proofOfDeliveryRef?.trim() } : {}),
      },
      createdAt: now,
      correlationId,
      idempotencyKey: key,
    });

    if (transition === "pickup") {
      await appendCustomerUpdate(tx, {
        caseId: incidentId,
        shipmentId: shipment.id,
        kind: "STATUS",
        title: "Your delivery is moving",
        message: shipment.status === "REASSIGNED"
          ? "The backup driver has picked up your shipment."
          : "Your driver has confirmed pickup of your shipment.",
        correlationId,
        idempotencyKey: key,
        createdAt: now,
      });
    } else if (transition === "deliver") {
      await appendCustomerUpdate(tx, {
        caseId: incidentId,
        shipmentId: shipment.id,
        kind: "DELIVERY",
        title: "Delivery complete",
        message: "Your shipment was delivered.",
        correlationId,
        idempotencyKey: key,
        createdAt: now,
      });
      const related = incidentId === null ? [] : await tx.incidentShipment.findMany({
        where: { incidentId },
        include: { shipment: { select: { status: true } } },
      });
      if (incidentId !== null && related.length > 0 && related.every(({ shipment: linked }) => TERMINAL_SHIPMENT_STATUSES.includes(linked.status))) {
        const incidentUpdate = await tx.incident.updateMany({
          where: { id: incidentId, status: { not: "RESOLVED" }, resolvedAt: null },
          data: { status: "RESOLVED", resolvedAt: now },
        });
        if (incidentUpdate.count === 1) {
          await appendEvent(tx, {
            caseId: incidentId,
            shipmentId: shipment.id,
            actorType: "SYSTEM",
            actorId: "SYSTEM",
            type: "INCIDENT_RESOLVED",
            visibility: "INTERNAL",
            payload: { incidentId, resolvedAt: now.toISOString(), reason: "ALL_AFFECTED_SHIPMENTS_TERMINAL" },
            createdAt: now,
            correlationId,
            idempotencyKey: key,
          });
        }
      }
    }

    const updated = await tx.assignment.findUnique({ where: { id: assignment.id } });
    if (!updated) throw new ApiFault(500, "ASSIGNMENT_WRITE_FAILED", "The assignment transition was not persisted.");
    const result = assignmentDto(updated);
    await tx.idempotencyRecord.create({
      data: {
        actor: principal.userId,
        action,
        key,
        result: JSON.stringify({
          assignment: result,
          proofOfDeliveryRef: transition === "deliver" ? proofOfDeliveryRef!.trim() : assignment.shipment.proofOfDeliveryRef,
        }),
        createdAt: now,
      },
    });
    return { data: result, replayed: false };
  });
}

function customerKind(value: unknown): CustomerTrackingSnapshot["timeline"][number]["kind"] | null {
  return value === "STATUS" || value === "BREAKDOWN" || value === "RECOVERY" || value === "ETA_REVISED" || value === "DELIVERY"
    ? value
    : null;
}

export async function readCustomerTracking(trackingCode: string): Promise<CustomerTrackingSnapshot> {
  const shipment = await prisma.shipment.findUnique({
    where: { trackingCode },
    include: {
      events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      notifications: {
        where: { status: { in: ["VISIBLE", "READ"] } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!shipment) throw new ApiFault(404, "TRACKING_NOT_FOUND", `Tracking code ${trackingCode} was not found.`);

  const publicEvents = shipment.events.filter((event) => event.visibility === "CUSTOMER");
  const timeline: CustomerTrackingSnapshot["timeline"] = publicEvents.flatMap((event) => {
    const payload = parsePayload(event.payload);
    const kind = customerKind(payload.kind);
    const title = typeof payload.title === "string" ? payload.title : null;
    const message = typeof payload.message === "string" ? payload.message : null;
    if (!kind || !title || !message) return [];
    return [{ id: event.id, kind, visibility: "CUSTOMER" as const, title, message, createdAt: event.createdAt.toISOString() }];
  });
  const notifications: CustomerTrackingSnapshot["notifications"] = shipment.notifications.map((notification) => {
    const corresponding = publicEvents.find((event) => {
      if (event.createdAt.getTime() !== notification.createdAt.getTime()) return false;
      return parsePayload(event.payload).message === notification.content;
    });
    const payload = corresponding ? parsePayload(corresponding.payload) : {};
    const kind = customerKind(payload.kind) ?? "GENERAL";
    return {
      id: notification.id,
      kind,
      message: notification.content,
      createdAt: notification.createdAt.toISOString(),
    };
  });
  const latestCustomerEvent = publicEvents[publicEvents.length - 1];
  const deliveryEvent = [...publicEvents]
    .filter((event) => customerKind(parsePayload(event.payload).kind) === "DELIVERY")
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id))[0];

  return {
    shipment: {
      id: shipment.id,
      trackingCode: shipment.trackingCode,
      priority: shipment.priority,
      status: shipment.status,
      promisedAt: shipment.promisedAt.toISOString(),
      etaAt: shipment.etaAt.toISOString(),
      updatedAt: (latestCustomerEvent?.createdAt ?? new Date(SEEDED_AT)).toISOString(),
      deliveredAt: shipment.status === "DELIVERED" ? deliveryEvent?.createdAt.toISOString() ?? null : null,
    },
    timeline,
    notifications,
  };
}

export async function readIncidentEvents(incidentId: string) {
  const incident = await prisma.incident.findUnique({ where: { id: incidentId }, select: { id: true } });
  if (!incident) throw new ApiFault(404, "INCIDENT_NOT_FOUND", `Incident ${incidentId} was not found.`);
  const events = await prisma.businessEvent.findMany({
    where: { caseId: incidentId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return {
    incidentId,
    events: events.map((event) => ({
      ...event,
      payload: parsePayload(event.payload),
      createdAt: event.createdAt.toISOString(),
    })),
  };
}
