import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  RecoveryFeasibility,
  RecoveryProposal,
  RecoveryProposalInput,
  RecoverySimulationInput,
} from "../types/contracts.ts";
import type { Principal } from "../lib/auth.ts";
import { prisma } from "../lib/db.ts";
import { ApiFault } from "../lib/http.ts";
import { loadDemoScenario } from "../lib/scenario-from-db.ts";
import { simulateReassignment } from "../domain/recovery-feasibility.ts";

export async function simulateRecovery(input: RecoverySimulationInput): Promise<RecoveryFeasibility> {
  const scenario = await loadDemoScenario(prisma);
  return simulateReassignment(scenario, input);
}

function principalActor(principal: Principal): { actorId: string; actorType: "AGENT" | "HUMAN" } {
  return principal.kind === "agent"
    ? { actorId: principal.actorId, actorType: "AGENT" }
    : { actorId: principal.userId, actorType: "HUMAN" };
}

function parsedResult(value: string): RecoveryProposal {
  return JSON.parse(value) as RecoveryProposal;
}

type ProposalTransaction = Prisma.TransactionClient;

export async function proposeRecovery(
  input: RecoveryProposalInput,
  principal: Principal,
  key: string,
  correlationId: string,
): Promise<RecoveryProposal> {
  if (principal.kind === "agent" && !principal.scopes.includes("recovery:propose")) {
    throw new ApiFault(403, "AGENT_SCOPE_REQUIRED", "A recovery:propose agent scope is required.");
  }
  if (principal.kind === "persona" && principal.role !== "DISPATCHER") {
    throw new ApiFault(403, "DISPATCHER_REQUIRED", "Only a dispatcher may propose a recovery plan.");
  }
  if (!Number.isFinite(Date.parse(input.newEtaAt))) {
    throw new ApiFault(400, "INVALID_INPUT", "newEtaAt must be a valid ISO date-time.");
  }

  return prisma.$transaction(async (tx) => proposeInTransaction(tx, input, principal, key, correlationId));
}

async function proposeInTransaction(
  tx: ProposalTransaction,
  input: RecoveryProposalInput,
  principal: Principal,
  key: string,
  correlationId: string,
): Promise<RecoveryProposal> {
  const actor = principal.kind === "persona" ? principal.userId : principal.actorId;
  const prior = await tx.idempotencyRecord.findUnique({
    where: { actor_action_key: { actor, action: "recovery.propose", key } },
  });
  if (prior) return parsedResult(prior.result);

  const incident = await tx.incident.findUnique({ where: { id: input.incidentId } });
  if (!incident) throw new ApiFault(404, "INCIDENT_NOT_FOUND", `Incident ${input.incidentId} was not found.`);
  if (incident.version !== input.expectedIncidentVersion) {
    throw new ApiFault(409, "STALE_INCIDENT_VERSION", `Expected incident version ${input.expectedIncidentVersion}, but the current version is ${incident.version}.`);
  }
  if (!["OPEN", "INVESTIGATING", "AWAITING_APPROVAL"].includes(incident.status)) {
    throw new ApiFault(409, "INCIDENT_NOT_PROPOSABLE", `Incident ${incident.id} is not open for recovery proposals.`);
  }

  const current = await loadDemoScenario(tx);
  const feasibility = simulateReassignment(current, {
    incidentId: input.incidentId,
    shipmentId: input.shipmentId,
    targetDriverId: input.targetDriverId,
    targetVehicleId: input.targetVehicleId,
  });
  if (!feasibility.eligible) {
    throw new ApiFault(422, "RECOVERY_INFEASIBLE", feasibility.conflicts.join(" "));
  }

  const version = incident.version + 1;
  const id = `PLAN-${incident.id}-${String(version).padStart(2, "0")}`;
  const hash = createHash("sha256").update(JSON.stringify({
    id,
    incidentId: incident.id,
    version,
    targetShipmentId: input.shipmentId,
    proposedVehicleId: input.targetVehicleId,
    proposedDriverId: input.targetDriverId,
    newEtaAt: new Date(input.newEtaAt).toISOString(),
    rationale: input.rationale,
    feasibility,
  })).digest("hex");

  const result: RecoveryProposal = {
    id,
    incidentId: incident.id,
    version,
    hash,
    status: "PROPOSED",
    feasibility,
  };

  const changed = await tx.incident.updateMany({
    where: { id: incident.id, version: input.expectedIncidentVersion },
    data: { version: { increment: 1 }, status: "AWAITING_APPROVAL", currentPlanId: id },
  });
  if (changed.count !== 1) {
    throw new ApiFault(409, "STALE_INCIDENT_VERSION", "The incident changed while this recovery proposal was being saved.");
  }
  await tx.recoveryPlan.create({
    data: {
      id,
      incidentId: incident.id,
      version,
      targetShipmentId: input.shipmentId,
      proposedVehicleId: input.targetVehicleId,
      proposedDriverId: input.targetDriverId,
      newEtaAt: new Date(input.newEtaAt),
      rationale: input.rationale,
      feasibilitySnapshot: JSON.stringify(feasibility),
      hash,
      status: "PROPOSED",
    },
  });
  const { actorId, actorType } = principalActor(principal);
  await tx.businessEvent.create({
    data: {
      id: `EVT-${randomUUID()}`,
      caseId: incident.id,
      shipmentId: input.shipmentId,
      actorType,
      actorId,
      type: "RECOVERY_PLAN_PROPOSED",
      visibility: "INTERNAL",
      payload: JSON.stringify({ planId: id, planVersion: version, hash, feasibility }),
      createdAt: new Date(),
      correlationId,
      idempotencyKey: key,
    },
  });
  await tx.idempotencyRecord.create({
    data: { actor, action: "recovery.propose", key, result: JSON.stringify(result), createdAt: new Date() },
  });
  return result;
}

export async function availableVehicles() {
  return prisma.vehicle.findMany({
    where: { status: "AVAILABLE" },
    orderBy: { code: "asc" },
  });
}

export async function readShipment(shipmentId: string) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: {
      assignedDriver: { include: { user: { select: { id: true, displayName: true } } } },
      assignedVehicle: true,
      incidentLinks: { include: { incident: { select: { id: true, status: true, version: true } } } },
      assignments: { orderBy: { id: "asc" } },
    },
  });
  if (!shipment) throw new ApiFault(404, "SHIPMENT_NOT_FOUND", `Shipment ${shipmentId} was not found.`);
  return shipment;
}
