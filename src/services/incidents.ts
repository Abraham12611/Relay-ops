import { randomUUID } from "node:crypto";
import type { Incident } from "../types/contracts.ts";
import type { Principal as AuthPrincipal } from "../lib/auth.ts";
import { prisma } from "../lib/db.ts";
import { ApiFault } from "../lib/http.ts";

export interface BreakdownReportInput {
  vehicleId?: string;
  summary: string;
}

export interface BreakdownReportResult {
  incident: Incident;
  affectedShipmentIds: string[];
  duplicate: boolean;
}

const ACTIVE_INCIDENT_STATUSES = ["OPEN", "INVESTIGATING", "AWAITING_APPROVAL", "APPROVED", "EXECUTING", "MONITORING"];

function actorId(principal: AuthPrincipal): string {
  return principal.kind === "persona" ? principal.userId : principal.actorId;
}

function parseStoredResult(value: string): BreakdownReportResult {
  return JSON.parse(value) as BreakdownReportResult;
}

function nextIncidentId(ids: readonly string[]): string {
  const next = ids.reduce((max, id) => {
    const suffix = /^INC-(\d+)$/.exec(id)?.[1];
    return suffix ? Math.max(max, Number(suffix)) : max;
  }, 1041) + 1;
  return `INC-${next}`;
}

function incidentDto(record: {
  id: string;
  type: string;
  vehicleId: string;
  reporterId: string;
  severity: string;
  status: string;
  summary: string;
  version: number;
  createdAt: Date;
  resolvedAt: Date | null;
  currentPlanId: string | null;
}): Incident {
  return {
    ...record,
    type: record.type as Incident["type"],
    severity: record.severity as Incident["severity"],
    status: record.status as Incident["status"],
    createdAt: record.createdAt.toISOString(),
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
  };
}

export async function reportBreakdown(
  input: BreakdownReportInput,
  principal: AuthPrincipal,
  key: string,
  correlationId: string,
): Promise<BreakdownReportResult> {
  if (principal.kind !== "persona" || principal.role !== "DRIVER") {
    throw new ApiFault(403, "DRIVER_REQUIRED", "Only an authenticated driver can report a vehicle breakdown.");
  }

  return prisma.$transaction(async (tx) => {
    const actor = actorId(principal);
    const prior = await tx.idempotencyRecord.findUnique({
      where: { actor_action_key: { actor, action: "incident.breakdown", key } },
    });
    if (prior) return parseStoredResult(prior.result);

    const driver = await tx.driver.findUnique({ where: { userId: principal.userId } });
    if (!driver) throw new ApiFault(403, "DRIVER_NOT_FOUND", "This demo persona is not assigned to a driver.");
    const vehicleId = input.vehicleId ?? driver.vehicleId;
    if (vehicleId !== driver.vehicleId) {
      throw new ApiFault(403, "VEHICLE_NOT_ASSIGNED", "Drivers may report only their assigned vehicle.");
    }

    const existing = await tx.incident.findFirst({
      where: { vehicleId, type: "BREAKDOWN", status: { in: ACTIVE_INCIDENT_STATUSES } },
      orderBy: { createdAt: "asc" },
    });
    if (existing) {
      const related = await tx.incidentShipment.findMany({ where: { incidentId: existing.id }, select: { shipmentId: true } });
      const result: BreakdownReportResult = {
        incident: incidentDto(existing),
        affectedShipmentIds: related.map(({ shipmentId }) => shipmentId),
        duplicate: true,
      };
      await tx.idempotencyRecord.create({
        data: { actor, action: "incident.breakdown", key, result: JSON.stringify(result), createdAt: new Date() },
      });
      return result;
    }

    const affected = await tx.shipment.findMany({
      where: { assignedVehicleId: vehicleId, status: "IN_TRANSIT" },
      orderBy: { id: "asc" },
    });
    if (affected.length === 0) {
      throw new ApiFault(409, "NO_AFFECTED_SHIPMENTS", "No in-transit shipments are assigned to this vehicle.");
    }

    const vehicleLock = await tx.vehicle.updateMany({
      where: { id: vehicleId, status: "AVAILABLE" },
      data: { status: "BROKEN_DOWN" },
    });
    if (vehicleLock.count !== 1) {
      throw new ApiFault(409, "VEHICLE_NOT_AVAILABLE", "This vehicle is already unavailable or has an active incident.");
    }

    const incidentIds = await tx.incident.findMany({ select: { id: true } });
    const id = nextIncidentId(incidentIds.map(({ id: incidentId }) => incidentId));
    const createdAt = new Date();
    const primary = affected.some(({ priority }) => priority === "CRITICAL");
    const incidentRecord = await tx.incident.create({
      data: {
        id,
        type: "BREAKDOWN",
        vehicleId,
        reporterId: principal.userId,
        severity: primary ? "CRITICAL" : "HIGH",
        status: "OPEN",
        summary: input.summary,
        version: 1,
        createdAt,
      },
    });
    await tx.incidentShipment.createMany({
      data: affected.map(({ id: shipmentId, status }) => ({ incidentId: id, shipmentId, originalStatus: status })),
    });
    const shipmentIds = affected.map(({ id: shipmentId }) => shipmentId);
    const updated = await tx.shipment.updateMany({
      where: { id: { in: shipmentIds }, status: "IN_TRANSIT" },
      data: { status: "AT_RISK" },
    });
    if (updated.count !== affected.length) {
      throw new ApiFault(409, "SHIPMENT_STATE_CHANGED", "One or more affected shipments changed while the incident was being reported.");
    }
    await tx.assignment.updateMany({
      where: { shipmentId: { in: shipmentIds }, incidentId: null },
      data: { incidentId: id },
    });
    await tx.businessEvent.create({
      data: {
        id: `EVT-${randomUUID()}`,
        caseId: id,
        actorType: "HUMAN",
        actorId: principal.userId,
        type: "INCIDENT_REPORTED",
        visibility: "INTERNAL",
        payload: JSON.stringify({ vehicleId, affectedShipmentIds: shipmentIds, summary: input.summary }),
        createdAt,
        correlationId,
        idempotencyKey: key,
      },
    });

    const result: BreakdownReportResult = {
      incident: incidentDto(incidentRecord),
      affectedShipmentIds: shipmentIds,
      duplicate: false,
    };
    await tx.idempotencyRecord.create({
      data: { actor, action: "incident.breakdown", key, result: JSON.stringify(result), createdAt },
    });
    return result;
  });
}

function eventDto<T extends { payload: string }>(event: T): Omit<T, "payload"> & { payload: unknown } {
  return { ...event, payload: JSON.parse(event.payload) };
}

export async function listIncidents() {
  const incidents = await prisma.incident.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      shipmentLinks: { include: { shipment: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  return incidents.map(({ shipmentLinks, events, ...incident }) => ({
    ...incident,
    affectedShipments: shipmentLinks.map(({ shipment }) => shipment),
    events: events.map(eventDto),
  }));
}

export async function getIncident(incidentId: string) {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: {
      vehicle: true,
      reporter: { select: { id: true, displayName: true, role: true } },
      shipmentLinks: { include: { shipment: true } },
      plans: { orderBy: { version: "desc" }, include: { approval: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!incident) throw new ApiFault(404, "INCIDENT_NOT_FOUND", `Incident ${incidentId} was not found.`);
  const { shipmentLinks, events, ...rest } = incident;
  return {
    ...rest,
    affectedShipments: shipmentLinks.map(({ shipment }) => shipment),
    events: events.map(eventDto),
  };
}

export async function getAffectedShipments(incidentId: string) {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    select: { id: true, shipmentLinks: { include: { shipment: true } } },
  });
  if (!incident) throw new ApiFault(404, "INCIDENT_NOT_FOUND", `Incident ${incidentId} was not found.`);
  return { incidentId: incident.id, shipments: incident.shipmentLinks.map(({ shipment }) => shipment) };
}
