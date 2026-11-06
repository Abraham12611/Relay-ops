import type { PrismaClient } from "@prisma/client";
import { DEMO_SCENARIO } from "../fixtures/scenario.ts";
import type { DemoScenario } from "../types/contracts.ts";

const scenario = DEMO_SCENARIO as unknown as DemoScenario;

export async function resetDemoData(client: PrismaClient): Promise<void> {
  await client.$transaction(async (tx) => {
    await tx.idempotencyRecord.deleteMany();
    await tx.businessEvent.deleteMany();
    await tx.customerNotification.deleteMany();
    await tx.approval.deleteMany();
    await tx.recoveryPlan.deleteMany();
    await tx.incidentShipment.deleteMany();
    await tx.assignment.deleteMany();
    await tx.incident.deleteMany();
    await tx.shipment.deleteMany();
    await tx.driver.deleteMany();
    await tx.vehicle.deleteMany();
    await tx.user.deleteMany();

    if (scenario.users.length) await tx.user.createMany({ data: scenario.users.map((record) => ({ ...record })) });
    if (scenario.vehicles.length) await tx.vehicle.createMany({ data: scenario.vehicles.map((record) => ({ ...record })) });
    if (scenario.drivers.length) await tx.driver.createMany({ data: scenario.drivers.map((record) => ({ ...record })) });
    if (scenario.shipments.length) await tx.shipment.createMany({
      data: scenario.shipments.map((record) => ({
        ...record,
        promisedAt: new Date(record.promisedAt),
        etaAt: new Date(record.etaAt),
      })),
    });
    if (scenario.incidents.length) await tx.incident.createMany({
      data: scenario.incidents.map((record) => ({
        ...record,
        createdAt: new Date(record.createdAt),
        resolvedAt: record.resolvedAt ? new Date(record.resolvedAt) : null,
      })),
    });
    if (scenario.incidentShipments.length) await tx.incidentShipment.createMany({
      data: scenario.incidentShipments.map((record) => ({ ...record })),
    });
    if (scenario.recoveryPlans.length) await tx.recoveryPlan.createMany({
      data: scenario.recoveryPlans.map((record) => ({
        id: record.id,
        incidentId: record.incidentId,
        version: record.version,
        targetShipmentId: record.targetShipmentId,
        proposedVehicleId: record.proposedVehicleId,
        proposedDriverId: record.proposedDriverId,
        newEtaAt: new Date(record.newEtaAt),
        rationale: record.rationale,
        feasibilitySnapshot: JSON.stringify(record.feasibilitySnapshot),
        hash: record.hash,
        status: record.status,
      })),
    });
    if (scenario.approvals.length) await tx.approval.createMany({
      data: scenario.approvals.map((record) => ({
        ...record,
        approvedAt: record.approvedAt ? new Date(record.approvedAt) : null,
        expiresAt: new Date(record.expiresAt),
        consumedAt: record.consumedAt ? new Date(record.consumedAt) : null,
      })),
    });
    if (scenario.assignments.length) await tx.assignment.createMany({ data: scenario.assignments.map((record) => ({ ...record })) });
    if (scenario.events.length) await tx.businessEvent.createMany({
      data: scenario.events.map((record) => ({
        ...record,
        payload: JSON.stringify(record.payload),
        createdAt: new Date(record.createdAt),
      })),
    });
    if (scenario.notifications.length) await tx.customerNotification.createMany({
      data: scenario.notifications.map((record) => ({
        ...record,
        createdAt: new Date(record.createdAt),
      })),
    });
    if (scenario.idempotencyRecords.length) await tx.idempotencyRecord.createMany({
      data: scenario.idempotencyRecords.map((record) => ({
        ...record,
        result: JSON.stringify(record.result),
        createdAt: new Date(record.createdAt),
      })),
    });
  });
}
