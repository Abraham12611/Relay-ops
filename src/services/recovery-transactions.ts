import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Principal } from "../lib/auth.ts";
import { prisma } from "../lib/db.ts";
import { ApiFault } from "../lib/http.ts";
import { loadDemoScenario } from "../lib/scenario-from-db.ts";
import { simulateReassignment } from "../domain/recovery-feasibility.ts";

export type RecoveryDecision = "APPROVE" | "REJECT";

export interface RecoveryDecisionInput {
  planId: string;
  planHash: string;
  planVersion: number;
  decision: RecoveryDecision;
  reason?: string;
}

export interface ApprovalProjection {
  id: string;
  planId: string;
  planHash: string;
  planVersion: number;
  decision: RecoveryDecision;
  status: "APPROVED" | "REJECTED" | "EXPIRED" | "CONSUMED";
  approvedBy: string | null;
  approvedAt: string | null;
  expiresAt: string;
  consumedAt: string | null;
  decisionReason: string | null;
  eventId?: string;
  isCurrent: boolean;
}

export interface RecoveryExecutionReceipt {
  id: string;
  status: "EXECUTED";
  planId: string;
  planHash: string;
  planVersion: number;
  approvalId: string;
  assignmentId: string;
  shipmentId: string;
  caseId: string;
  eventId: string;
  resultingStatus: "REASSIGNED";
  executedAt: string;
}

export interface RecoveryServiceResult<T> {
  data: T;
  replayed: boolean;
}

const APPROVAL_TTL_MS = 15 * 60 * 1000;
type Transaction = Prisma.TransactionClient;

type EventInput = {
  caseId: string;
  shipmentId?: string | null;
  actorType: "HUMAN" | "AGENT" | "SYSTEM";
  actorId: string;
  type: string;
  visibility: "INTERNAL" | "CUSTOMER";
  payload: Record<string, unknown>;
  createdAt: Date;
  correlationId: string;
  idempotencyKey?: string | null;
};

function canonicalPlanHash(plan: {
  id: string;
  incidentId: string;
  version: number;
  targetShipmentId: string;
  proposedVehicleId: string;
  proposedDriverId: string;
  newEtaAt: Date;
  rationale: string;
  feasibilitySnapshot: string;
}): string {
  let feasibility: unknown;
  try {
    feasibility = JSON.parse(plan.feasibilitySnapshot) as unknown;
  } catch {
    throw new ApiFault(409, "PLAN_HASH_INVALID", "The persisted recovery plan snapshot cannot be verified.");
  }
  return createHash("sha256").update(JSON.stringify({
    id: plan.id,
    incidentId: plan.incidentId,
    version: plan.version,
    targetShipmentId: plan.targetShipmentId,
    proposedVehicleId: plan.proposedVehicleId,
    proposedDriverId: plan.proposedDriverId,
    newEtaAt: plan.newEtaAt.toISOString(),
    rationale: plan.rationale,
    feasibility,
  })).digest("hex");
}

async function appendEvent(tx: Transaction, event: EventInput): Promise<string> {
  const id = `EVT-${randomUUID()}`;
  await tx.businessEvent.create({
    data: {
      id,
      caseId: event.caseId,
      shipmentId: event.shipmentId ?? null,
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

function parseStored<T>(serialized: string, label: string): T {
  try {
    return JSON.parse(serialized) as T;
  } catch {
    throw new ApiFault(500, "IDEMPOTENCY_RESULT_INVALID", `Stored ${label} result could not be read.`);
  }
}

function approvalProjection(
  approval: {
    id: string;
    planId: string;
    planHash: string;
    status: string;
    approvedBy: string | null;
    approvedAt: Date | null;
    expiresAt: Date;
    consumedAt: Date | null;
    decisionReason: string | null;
  },
  plan: {
    id: string;
    incidentId: string;
    hash: string;
    version: number;
    targetShipmentId: string;
    proposedVehicleId: string;
    proposedDriverId: string;
    newEtaAt: Date;
    rationale: string;
    feasibilitySnapshot: string;
    incident: { currentPlanId: string | null; version: number };
  },
  eventId?: string,
): ApprovalProjection {
  const status = approval.status as ApprovalProjection["status"];
  return {
    id: approval.id,
    planId: approval.planId,
    planHash: approval.planHash,
    planVersion: plan.version,
    decision: status === "REJECTED" ? "REJECT" : "APPROVE",
    status,
    approvedBy: approval.approvedBy,
    approvedAt: approval.approvedAt?.toISOString() ?? null,
    expiresAt: approval.expiresAt.toISOString(),
    consumedAt: approval.consumedAt?.toISOString() ?? null,
    decisionReason: approval.decisionReason,
    ...(eventId === undefined ? {} : { eventId }),
    isCurrent: status !== "EXPIRED" &&
      approval.planId === plan.id &&
      approval.planHash === plan.hash &&
      plan.hash === canonicalPlanHash(plan) &&
      plan.incident.currentPlanId === plan.id &&
      plan.incident.version === plan.version,
  };
}

function assertDispatcher(principal: Principal): asserts principal is Extract<Principal, { kind: "persona" }> {
  if (principal.kind !== "persona" || principal.role !== "DISPATCHER") {
    throw new ApiFault(403, "DISPATCHER_REQUIRED", "Only an authenticated dispatcher can approve or reject a recovery plan.");
  }
}

function assertExecutionAgent(principal: Principal): asserts principal is Extract<Principal, { kind: "agent" }> {
  if (principal.kind !== "agent" || !principal.scopes.includes("recovery:execute")) {
    throw new ApiFault(403, "AGENT_SCOPE_REQUIRED", "A recovery:execute agent scope is required.");
  }
}

function matchIdempotentApproval(
  stored: ApprovalProjection,
  input: RecoveryDecisionInput,
): void {
  if (
    stored.planId !== input.planId || stored.planHash !== input.planHash ||
    stored.planVersion !== input.planVersion || stored.decision !== input.decision
  ) {
    throw new ApiFault(409, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different recovery decision.");
  }
}

export async function decideRecoveryPlan(
  input: RecoveryDecisionInput,
  principal: Principal,
  key: string,
  correlationId: string,
  now = new Date(),
): Promise<RecoveryServiceResult<ApprovalProjection>> {
  assertDispatcher(principal);

  return prisma.$transaction(async (tx) => {
    const actor = principal.userId;
    const prior = await tx.idempotencyRecord.findUnique({
      where: { actor_action_key: { actor, action: "recovery.approve", key } },
    });
    if (prior) {
      const stored = parseStored<ApprovalProjection>(prior.result, "approval");
      matchIdempotentApproval(stored, input);
      return { data: stored, replayed: true };
    }

    const plan = await tx.recoveryPlan.findUnique({
      where: { id: input.planId },
      include: { incident: true, approval: true },
    });
    if (!plan) throw new ApiFault(404, "PLAN_NOT_FOUND", `Recovery plan ${input.planId} was not found.`);
    if (plan.hash !== canonicalPlanHash(plan)) {
      throw new ApiFault(409, "PLAN_HASH_INVALID", "The persisted recovery plan no longer matches its immutable hash.");
    }
    if (plan.hash !== input.planHash) {
      throw new ApiFault(409, "PLAN_HASH_MISMATCH", "The submitted hash does not match this recovery plan.");
    }
    if (
      plan.version !== input.planVersion || plan.incident.version !== input.planVersion ||
      plan.incident.currentPlanId !== plan.id
    ) {
      throw new ApiFault(409, "STALE_PLAN_VERSION", "This approval does not match the current incident plan version.");
    }
    if (plan.status !== "PROPOSED" || plan.incident.status !== "AWAITING_APPROVAL") {
      throw new ApiFault(409, "PLAN_NOT_AWAITING_APPROVAL", "Only the current proposed plan can receive a dispatcher decision.");
    }
    let feasibility: { eligible?: unknown };
    try {
      feasibility = JSON.parse(plan.feasibilitySnapshot) as { eligible?: unknown };
    } catch {
      throw new ApiFault(409, "PLAN_EVIDENCE_INVALID", "The stored feasibility evidence is invalid.");
    }
    if (input.decision === "APPROVE" && feasibility.eligible !== true) {
      throw new ApiFault(409, "PLAN_NOT_FEASIBLE", "An ineligible recovery plan cannot be approved.");
    }

    const dispatcher = await tx.user.findUnique({ where: { id: principal.userId } });
    if (!dispatcher || dispatcher.role !== "DISPATCHER") {
      throw new ApiFault(403, "DISPATCHER_REQUIRED", "The authenticated identity is not a persisted dispatcher.");
    }

    if (plan.approval) {
      const priorApproval = approvalProjection(plan.approval, plan);
      if (
        plan.approval.planHash === input.planHash &&
        priorApproval.planVersion === input.planVersion &&
        priorApproval.decision === input.decision &&
        plan.approval.approvedBy === principal.userId
      ) {
        await tx.idempotencyRecord.create({
          data: { actor, action: "recovery.approve", key, result: JSON.stringify(priorApproval), createdAt: now },
        });
        return { data: priorApproval, replayed: true };
      }
      throw new ApiFault(409, "DECISION_ALREADY_RECORDED", "A decision is already recorded for this plan.");
    }

    const approvalId = `APR-${randomUUID()}`;
    const expiresAt = new Date(now.getTime() + APPROVAL_TTL_MS);
    const nextStatus = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const approval = await tx.approval.create({
      data: {
        id: approvalId,
        planId: plan.id,
        planHash: plan.hash,
        status: nextStatus,
        approvedBy: principal.userId,
        approvedAt: input.decision === "APPROVE" ? now : null,
        expiresAt,
        consumedAt: null,
        decisionReason: input.reason ?? null,
      },
    });
    const planChange = await tx.recoveryPlan.updateMany({
      where: { id: plan.id, version: input.planVersion, hash: input.planHash, status: "PROPOSED" },
      data: { status: nextStatus },
    });
    if (planChange.count !== 1) {
      throw new ApiFault(409, "STALE_PLAN_VERSION", "The recovery plan changed while the dispatcher decision was being saved.");
    }
    const incidentChange = await tx.incident.updateMany({
      where: { id: plan.incidentId, version: input.planVersion, currentPlanId: plan.id, status: "AWAITING_APPROVAL" },
      data: { status: nextStatus },
    });
    if (incidentChange.count !== 1) {
      throw new ApiFault(409, "STALE_PLAN_VERSION", "The incident changed while the dispatcher decision was being saved.");
    }

    const eventId = await appendEvent(tx, {
      caseId: plan.incidentId,
      shipmentId: plan.targetShipmentId,
      actorType: "HUMAN",
      actorId: principal.userId,
      type: input.decision === "APPROVE" ? "RECOVERY_PLAN_APPROVED" : "RECOVERY_PLAN_REJECTED",
      visibility: "INTERNAL",
      payload: {
        approvalId,
        planId: plan.id,
        planHash: plan.hash,
        planVersion: plan.version,
        decision: input.decision,
        status: nextStatus,
        approvedBy: principal.userId,
        decisionReason: input.reason ?? null,
        expiresAt: expiresAt.toISOString(),
      },
      createdAt: now,
      correlationId,
      idempotencyKey: key,
    });
    const result = approvalProjection(approval, plan, eventId);
    await tx.idempotencyRecord.create({
      data: { actor, action: "recovery.approve", key, result: JSON.stringify(result), createdAt: now },
    });
    return { data: result, replayed: false };
  });
}

export async function readRecoveryApproval(
  planId: string,
  correlationId: string,
  now = new Date(),
): Promise<ApprovalProjection> {
  return prisma.$transaction(async (tx) => {
    const plan = await tx.recoveryPlan.findUnique({
      where: { id: planId },
      include: { incident: true, approval: true },
    });
    if (!plan) throw new ApiFault(404, "PLAN_NOT_FOUND", `Recovery plan ${planId} was not found.`);
    if (!plan.approval) throw new ApiFault(404, "APPROVAL_NOT_FOUND", `No decision has been recorded for plan ${planId}.`);

    let approval = plan.approval;
    if (approval.status === "APPROVED" && approval.expiresAt.getTime() <= now.getTime()) {
      const expired = await tx.approval.updateMany({
        where: { id: approval.id, status: "APPROVED", consumedAt: null, expiresAt: { lte: now } },
        data: { status: "EXPIRED" },
      });
      if (expired.count === 1) {
        await tx.recoveryPlan.updateMany({
          where: { id: plan.id, status: "APPROVED" },
          data: { status: "EXPIRED" },
        });
        await tx.incident.updateMany({
          where: { id: plan.incidentId, currentPlanId: plan.id, status: "APPROVED" },
          data: { status: "INVESTIGATING", currentPlanId: null },
        });
        const eventId = await appendEvent(tx, {
          caseId: plan.incidentId,
          shipmentId: plan.targetShipmentId,
          actorType: "SYSTEM",
          actorId: "SYSTEM",
          type: "RECOVERY_APPROVAL_EXPIRED",
          visibility: "INTERNAL",
          payload: { approvalId: approval.id, planId: plan.id, planVersion: plan.version, expiresAt: approval.expiresAt.toISOString() },
          createdAt: now,
          correlationId,
        });
        approval = { ...approval, status: "EXPIRED" };
        return approvalProjection(approval, plan, eventId);
      }
      approval = (await tx.approval.findUnique({ where: { id: approval.id } })) ?? approval;
    }
    return approvalProjection(approval, plan);
  });
}

function matchIdempotentExecution(
  stored: RecoveryExecutionReceipt,
  input: { approvalId: string; planId: string },
): void {
  if (stored.planId !== input.planId || stored.approvalId !== input.approvalId) {
    throw new ApiFault(409, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different recovery execution.");
  }
}

async function expireApprovalForExecution(
  tx: Transaction,
  plan: { id: string; incidentId: string; targetShipmentId: string; version: number; status: string },
  approval: { id: string; status: string; expiresAt: Date },
  correlationId: string,
  now: Date,
): Promise<void> {
  const changed = await tx.approval.updateMany({
    where: { id: approval.id, status: "APPROVED", consumedAt: null, expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  if (changed.count !== 1) return;
  await tx.recoveryPlan.updateMany({ where: { id: plan.id, status: "APPROVED" }, data: { status: "EXPIRED" } });
  await tx.incident.updateMany({
    where: { id: plan.incidentId, currentPlanId: plan.id, status: "APPROVED" },
    data: { status: "INVESTIGATING", currentPlanId: null },
  });
  await appendEvent(tx, {
    caseId: plan.incidentId,
    shipmentId: plan.targetShipmentId,
    actorType: "SYSTEM",
    actorId: "SYSTEM",
    type: "RECOVERY_APPROVAL_EXPIRED",
    visibility: "INTERNAL",
    payload: { approvalId: approval.id, planId: plan.id, planVersion: plan.version, expiresAt: approval.expiresAt.toISOString() },
    createdAt: now,
    correlationId,
  });
}

export async function executeRecovery(
  input: { approvalId: string; planId: string },
  principal: Principal,
  key: string,
  correlationId: string,
  now = new Date(),
): Promise<RecoveryServiceResult<RecoveryExecutionReceipt>> {
  assertExecutionAgent(principal);
  const transactionOutcome = await prisma.$transaction(async (tx) => {
    const actor = principal.actorId;
    const prior = await tx.idempotencyRecord.findUnique({
      where: { actor_action_key: { actor, action: "recovery.execute", key } },
    });
    if (prior) {
      const stored = parseStored<RecoveryExecutionReceipt>(prior.result, "execution");
      matchIdempotentExecution(stored, input);
      return { result: { data: stored, replayed: true } as RecoveryServiceResult<RecoveryExecutionReceipt> };
    }

    const plan = await tx.recoveryPlan.findUnique({
      where: { id: input.planId },
      include: {
        incident: true,
        approval: true,
        targetShipment: true,
        proposedVehicle: true,
        proposedDriver: true,
      },
    });
    if (!plan) throw new ApiFault(404, "PLAN_NOT_FOUND", `Recovery plan ${input.planId} was not found.`);
    const approval = plan.approval;
    if (!approval || approval.id !== input.approvalId) {
      throw new ApiFault(403, "APPROVAL_REQUIRED", "The supplied approval does not belong to this recovery plan.");
    }
    if (approval.planId !== plan.id || approval.planHash !== plan.hash || plan.hash !== canonicalPlanHash(plan)) {
      throw new ApiFault(409, "APPROVAL_BINDING_MISMATCH", "The approval is not bound to this immutable plan ID, hash, and version.");
    }
    if (approval.status === "APPROVED" && approval.expiresAt.getTime() <= now.getTime()) {
      await expireApprovalForExecution(tx, plan, approval, correlationId, now);
      return { fault: new ApiFault(409, "APPROVAL_EXPIRED", "The dispatcher approval has expired.") };
    }
    if (approval.status === "CONSUMED" || approval.consumedAt !== null) {
      throw new ApiFault(409, "APPROVAL_CONSUMED", "This single-use approval has already been consumed.");
    }
    if (approval.status === "EXPIRED") {
      throw new ApiFault(409, "APPROVAL_EXPIRED", "The dispatcher approval has expired.");
    }
    if (approval.status !== "APPROVED") {
      throw new ApiFault(403, "APPROVAL_NOT_APPROVED", "A dispatcher-approved plan is required for execution.");
    }
    if (
      plan.status !== "APPROVED" || plan.incident.status !== "APPROVED" ||
      plan.incident.currentPlanId !== plan.id || plan.incident.version !== plan.version
    ) {
      throw new ApiFault(409, "STALE_PLAN_VERSION", "The approval no longer matches the current plan version.");
    }
    const dispatcher = approval.approvedBy
      ? await tx.user.findUnique({ where: { id: approval.approvedBy } })
      : null;
    if (!dispatcher || dispatcher.role !== "DISPATCHER") {
      throw new ApiFault(403, "DISPATCHER_APPROVAL_REQUIRED", "The approval was not recorded by a persisted dispatcher identity.");
    }

    const shipment = plan.targetShipment;
    if (shipment.status === "DELIVERED") {
      throw new ApiFault(409, "SHIPMENT_ALREADY_DELIVERED", "A delivered shipment cannot be reassigned.");
    }
    if (!["AT_RISK", "REASSIGNMENT_PENDING"].includes(shipment.status)) {
      throw new ApiFault(409, "SHIPMENT_NOT_REASSIGNABLE", `Shipment ${shipment.id} is not in a recoverable state.`);
    }
    if (plan.proposedVehicle.status !== "AVAILABLE") {
      throw new ApiFault(422, "TARGET_VEHICLE_UNAVAILABLE", "The proposed recovery vehicle is no longer available.");
    }
    if (plan.proposedDriver.dutyStatus !== "ON_DUTY" || plan.proposedDriver.vehicleId !== plan.proposedVehicleId) {
      throw new ApiFault(422, "TARGET_DRIVER_UNAVAILABLE", "The proposed recovery driver is no longer eligible for this vehicle.");
    }
    if (plan.proposedVehicle.occupiedUnits + shipment.units > plan.proposedVehicle.capacityUnits) {
      throw new ApiFault(422, "TARGET_CAPACITY_UNAVAILABLE", "The proposed recovery vehicle no longer has enough capacity.");
    }
    const activeCritical = await tx.shipment.findFirst({
      where: {
        id: { not: shipment.id },
        assignedVehicleId: plan.proposedVehicleId,
        priority: "CRITICAL",
        status: { notIn: ["DELIVERED", "DELIVERY_FAILED"] },
      },
      select: { id: true },
    });
    if (activeCritical) {
      throw new ApiFault(422, "TARGET_VEHICLE_CONFLICT", "The proposed recovery vehicle has another active critical shipment.");
    }
    const currentAssignment = await tx.assignment.findFirst({
      where: {
        shipmentId: shipment.id,
        driverId: shipment.assignedDriverId,
        vehicleId: shipment.assignedVehicleId,
        status: { in: ["PENDING", "ACCEPTED", "PICKED_UP"] },
      },
    });
    if (!currentAssignment) {
      throw new ApiFault(409, "CURRENT_ASSIGNMENT_NOT_FOUND", "The shipment's current assignment changed before execution.");
    }
    if (shipment.assignedVehicleId === plan.proposedVehicleId && shipment.assignedDriverId === plan.proposedDriverId) {
      throw new ApiFault(409, "RECOVERY_TARGET_UNCHANGED", "The proposed assignment is already active for this shipment.");
    }
    const scenario = await loadDemoScenario(tx);
    const feasibility = simulateReassignment(scenario, {
      incidentId: plan.incidentId,
      shipmentId: shipment.id,
      targetDriverId: plan.proposedDriverId,
      targetVehicleId: plan.proposedVehicleId,
    });
    if (!feasibility.eligible) {
      throw new ApiFault(422, "RECOVERY_NO_LONGER_FEASIBLE", feasibility.conflicts.join(" "));
    }

    const targetCapacity = await tx.vehicle.updateMany({
      where: {
        id: plan.proposedVehicleId,
        status: "AVAILABLE",
        occupiedUnits: { lte: plan.proposedVehicle.capacityUnits - shipment.units },
      },
      data: { occupiedUnits: { increment: shipment.units } },
    });
    if (targetCapacity.count !== 1) {
      throw new ApiFault(422, "TARGET_CAPACITY_UNAVAILABLE", "The proposed recovery vehicle capacity changed during execution.");
    }
    const sourceCapacity = await tx.vehicle.updateMany({
      where: { id: shipment.assignedVehicleId, occupiedUnits: { gte: shipment.units } },
      data: { occupiedUnits: { decrement: shipment.units } },
    });
    if (sourceCapacity.count !== 1) {
      throw new ApiFault(409, "SOURCE_CAPACITY_CHANGED", "The original vehicle load changed during execution.");
    }

    const assignmentId = `ASG-${randomUUID()}`;
    const assignment = await tx.assignment.create({
      data: {
        id: assignmentId,
        shipmentId: shipment.id,
        driverId: plan.proposedDriverId,
        vehicleId: plan.proposedVehicleId,
        incidentId: plan.incidentId,
        status: "PENDING",
      },
    });
    const shipmentUpdate = await tx.shipment.updateMany({
      where: {
        id: shipment.id,
        status: shipment.status,
        assignedDriverId: shipment.assignedDriverId,
        assignedVehicleId: shipment.assignedVehicleId,
      },
      data: {
        assignedDriverId: plan.proposedDriverId,
        assignedVehicleId: plan.proposedVehicleId,
        status: "REASSIGNED",
        etaAt: plan.newEtaAt,
        proofOfDeliveryRef: null,
      },
    });
    if (shipmentUpdate.count !== 1) {
      throw new ApiFault(409, "SHIPMENT_STATE_CHANGED", "The shipment changed during recovery execution.");
    }
    const planUpdate = await tx.recoveryPlan.updateMany({
      where: { id: plan.id, status: "APPROVED", version: plan.version, hash: approval.planHash },
      data: { status: "EXECUTED" },
    });
    if (planUpdate.count !== 1) {
      throw new ApiFault(409, "STALE_PLAN_VERSION", "The recovery plan changed during execution.");
    }
    const approvalUpdate = await tx.approval.updateMany({
      where: { id: approval.id, status: "APPROVED", consumedAt: null, expiresAt: { gt: now } },
      data: { status: "CONSUMED", consumedAt: now },
    });
    if (approvalUpdate.count !== 1) {
      throw new ApiFault(409, "APPROVAL_CONSUMED", "The approval expired or was consumed during execution.");
    }
    const incidentUpdate = await tx.incident.updateMany({
      where: { id: plan.incidentId, currentPlanId: plan.id, version: plan.version, status: "APPROVED" },
      data: { status: "MONITORING" },
    });
    if (incidentUpdate.count !== 1) {
      throw new ApiFault(409, "STALE_PLAN_VERSION", "The incident changed during recovery execution.");
    }

    const eventId = await appendEvent(tx, {
      caseId: plan.incidentId,
      shipmentId: shipment.id,
      actorType: "AGENT",
      actorId: principal.actorId,
      type: "REASSIGNMENT_EXECUTED",
      visibility: "INTERNAL",
      payload: {
        planId: plan.id,
        planHash: plan.hash,
        planVersion: plan.version,
        approvalId: approval.id,
        assignmentId: assignment.id,
        shipmentId: shipment.id,
        caseId: plan.incidentId,
        resultingStatus: "REASSIGNED",
        executedAt: now.toISOString(),
        newEtaAt: plan.newEtaAt.toISOString(),
      },
      createdAt: now,
      correlationId,
      idempotencyKey: key,
    });
    const receipt: RecoveryExecutionReceipt = {
      id: `REC-${randomUUID()}`,
      status: "EXECUTED",
      planId: plan.id,
      planHash: plan.hash,
      planVersion: plan.version,
      approvalId: approval.id,
      assignmentId: assignment.id,
      shipmentId: shipment.id,
      caseId: plan.incidentId,
      eventId,
      resultingStatus: "REASSIGNED",
      executedAt: now.toISOString(),
    };
    const publicMessage = `Your delivery is assigned to a backup driver. Updated estimated arrival: ${plan.newEtaAt.toISOString()}.`;
    await appendEvent(tx, {
      caseId: plan.incidentId,
      shipmentId: shipment.id,
      actorType: "SYSTEM",
      actorId: "SYSTEM",
      type: "CUSTOMER_RECOVERY_UPDATE",
      visibility: "CUSTOMER",
      payload: { kind: "RECOVERY", title: "A backup driver is assigned", message: publicMessage },
      createdAt: now,
      correlationId,
      idempotencyKey: key,
    });
    await tx.customerNotification.create({
      data: {
        id: `NTF-${randomUUID()}`,
        shipmentId: shipment.id,
        caseId: plan.incidentId,
        channel: "IN_APP",
        content: publicMessage,
        status: "VISIBLE",
        createdAt: now,
      },
    });
    await tx.idempotencyRecord.create({
      data: { actor, action: "recovery.execute", key, result: JSON.stringify(receipt), createdAt: now },
    });
    return { result: { data: receipt, replayed: false } as RecoveryServiceResult<RecoveryExecutionReceipt> };
  });

  if ("fault" in transactionOutcome) throw transactionOutcome.fault;
  return transactionOutcome.result;
}
