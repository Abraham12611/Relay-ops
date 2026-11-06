import type { PrismaClient } from "@prisma/client";
import { DEMO_SCENARIO } from "../fixtures/scenario.ts";
import type { DemoScenario } from "../types/contracts.ts";

type ScenarioReader = Pick<
  PrismaClient,
  | "user"
  | "vehicle"
  | "driver"
  | "shipment"
  | "incident"
  | "incidentShipment"
  | "recoveryPlan"
  | "approval"
  | "assignment"
  | "businessEvent"
  | "customerNotification"
  | "idempotencyRecord"
>;

const iso = (date: Date | null): string | null => date?.toISOString() ?? null;

export async function loadDemoScenario(client: ScenarioReader): Promise<DemoScenario> {
  const [users, vehicles, drivers, shipments, incidents, incidentShipments, recoveryPlans, approvals, assignments, events, notifications, idempotencyRecords] = await Promise.all([
    client.user.findMany(),
    client.vehicle.findMany(),
    client.driver.findMany(),
    client.shipment.findMany(),
    client.incident.findMany(),
    client.incidentShipment.findMany(),
    client.recoveryPlan.findMany(),
    client.approval.findMany(),
    client.assignment.findMany(),
    client.businessEvent.findMany(),
    client.customerNotification.findMany(),
    client.idempotencyRecord.findMany(),
  ]);

  return {
    seededAt: DEMO_SCENARIO.seededAt,
    users,
    vehicles,
    drivers,
    shipments: shipments.map((shipment) => ({
      ...shipment,
      promisedAt: shipment.promisedAt.toISOString(),
      etaAt: shipment.etaAt.toISOString(),
    })),
    incidents: incidents.map((incident) => ({
      ...incident,
      createdAt: incident.createdAt.toISOString(),
      resolvedAt: iso(incident.resolvedAt),
    })),
    incidentShipments,
    recoveryPlans: recoveryPlans.map((plan) => ({
      ...plan,
      newEtaAt: plan.newEtaAt.toISOString(),
      feasibilitySnapshot: JSON.parse(plan.feasibilitySnapshot),
    })),
    approvals: approvals.map((approval) => ({
      ...approval,
      approvedAt: iso(approval.approvedAt),
      expiresAt: approval.expiresAt.toISOString(),
      consumedAt: iso(approval.consumedAt),
    })),
    assignments,
    events: events.map((event) => ({
      ...event,
      payload: JSON.parse(event.payload),
      createdAt: event.createdAt.toISOString(),
    })),
    notifications: notifications.map((notification) => ({
      ...notification,
      createdAt: notification.createdAt.toISOString(),
    })),
    idempotencyRecords: idempotencyRecords.map((record) => ({
      ...record,
      result: JSON.parse(record.result),
      createdAt: record.createdAt.toISOString(),
    })),
  } as unknown as DemoScenario;
}
