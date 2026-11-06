import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  apiRequest,
  approvePlan,
  assertStatus,
  executePlan,
  integrationEnabled,
  proposeRecovery,
  readApproval,
  readIncident,
  readIncidentEvents,
  record,
  reportBreakdown,
  requireIntegrationEnvironment,
  EXPECTED_AFFECTED_SHIPMENT_IDS,
  resetDemo,
  responseData,
  simulate,
} from "./demo-api.mjs";

function addStep(steps, label) {
  steps.push(label);
}

export async function runGoldenPath() {
  requireIntegrationEnvironment();
  if (!integrationEnabled()) throw new Error("Set RELAYOPS_BASE_URL before running the golden path.");

  const runId = randomUUID();
  const steps = [];
  await resetDemo();
  addStep(steps, "reset restored the PRE-INCIDENT seed state with no incident");

  const incidentKey = `${runId}:incident`;
  const incident = await reportBreakdown(incidentKey);
  const incidentId = incident.id ?? incident.incidentId;
  assert.equal(incidentId, "INC-1042", "the driver breakdown report must create the fixed case ID");
  const createdIncident = await readIncident(incidentId);
  assert.equal(createdIncident.status, "OPEN", "the driver report must create an open incident");
  assert.equal(createdIncident.vehicle?.status, "BROKEN_DOWN", "the breakdown must mark VAN-014 unavailable");
  assert.ok(createdIncident.events?.some(({ type }) => type === "INCIDENT_REPORTED"), "incident detail must include the persisted breakdown event");
  assert.deepEqual(
    (createdIncident.affectedShipments ?? []).map(({ id }) => id).sort(),
    [...EXPECTED_AFFECTED_SHIPMENT_IDS].sort(),
    "the created incident must link the six fixed shipments",
  );
  const eventsAfterFirstReport = await readIncidentEvents(incidentId);
  const duplicateIncident = await reportBreakdown(incidentKey);
  const incidentEvents = await readIncidentEvents(incidentId);
  assert.equal(duplicateIncident.id ?? duplicateIncident.incidentId, incidentId, "duplicate report must return the same case");
  assert.equal(incidentEvents.length, eventsAfterFirstReport.length, "duplicate report must not append another event");
  addStep(steps, "driver breakdown created INC-1042 and the duplicate key reused it without another event");

  const invalidBrokenVehicle = await simulate({
    incidentId,
    shipmentId: "MED-2048",
    targetDriverId: "DRV-014",
    targetVehicleId: "VAN-014",
  });
  assert.equal(invalidBrokenVehicle.eligible, false, "broken vehicle must be infeasible");
  addStep(steps, "broken-vehicle simulation rejected");

  const invalidAssignment = await simulate({
    incidentId,
    shipmentId: "MED-2048",
    targetDriverId: "DRV-014",
    targetVehicleId: "VAN-009",
  });
  assert.equal(invalidAssignment.eligible, false, "mismatched driver/vehicle must be infeasible");
  addStep(steps, "mismatched driver/vehicle simulation rejected");

  const feasible = await simulate({
    incidentId,
    shipmentId: "MED-2048",
    targetDriverId: "DRV-009",
    targetVehicleId: "VAN-009",
  });
  assert.equal(feasible.eligible, true, "seeded backup must be feasible");
  assert.equal(feasible.capacityOk, true);
  assert.deepEqual(feasible.conflicts, []);
  const planV1 = await proposeRecovery(incidentId, `${runId}:plan-v1`);
  assert.ok(planV1.id && planV1.hash, "proposal must have a stable ID and hash");
  assert.equal(planV1.version, 1, "first proposal must be version 1");
  const afterProposal = await readIncident(incidentId);
  assert.equal(afterProposal.status, "AWAITING_APPROVAL", "proposal must move the incident into approval review");
  addStep(steps, "agent-read feasibility succeeded and a versioned plan was proposed");

  const missingApprovalLookup = await apiRequest(
    `/api/v1/recovery/approvals/${encodeURIComponent(planV1.id)}`,
    { role: "agentRead" },
  );
  assertStatus(missingApprovalLookup, 404, "approval lookup before dispatcher decision");
  assert.equal(missingApprovalLookup.payload.error.code, "APPROVAL_NOT_FOUND");
  const beforeForbiddenWrites = (await readIncidentEvents(incidentId)).map(({ id }) => id);
  const missingApproval = await apiRequest("/api/v1/recovery/execute", {
    role: "agentExecute",
    method: "POST",
    idempotencyKey: `${runId}:execute-without-approval`,
    body: { approvalId: "APR-NOT-APPROVED", planId: planV1.id, idempotencyKey: `${runId}:execute-without-approval` },
  });
  assertStatus(missingApproval, 403, "execute without approved plan");
  const selfApproval = await apiRequest("/api/v1/recovery/approvals", {
    role: "agentPropose",
    method: "POST",
    idempotencyKey: `${runId}:agent-self-approval`,
    body: { planId: planV1.id, planHash: planV1.hash, decision: "APPROVE" },
  });
  assertStatus(selfApproval, 403, "agent self-approval");
  assert.deepEqual((await readIncidentEvents(incidentId)).map(({ id }) => id), beforeForbiddenWrites, "forbidden actions must not append audit/business events");
  addStep(steps, "execution without approval and agent self-approval both forbidden with no event mutation");

  const approvalV1 = await approvePlan(planV1, `${runId}:approval-v1`);
  assert.ok(approvalV1.id, "dispatcher approval must have an ID");
  assert.equal(approvalV1.planVersion, planV1.version, "approval must bind the exact plan version");
  const approvalV1Read = await readApproval(planV1.id);
  assert.equal(approvalV1Read.id, approvalV1.id);
  assert.equal(approvalV1Read.planHash, planV1.hash);
  assert.equal(approvalV1Read.planVersion, planV1.version);
  assert.equal(approvalV1Read.decision, "APPROVE");
  assert.equal(approvalV1Read.status, "APPROVED");
  addStep(steps, "approval read confirmed the exact plan ID, hash, and version");

  const planV2 = await proposeRecovery(incidentId, `${runId}:plan-v2`);
  assert.equal(planV2.version, planV1.version + 1, "re-proposal must increment the plan version");
  assert.notEqual(planV2.hash, planV1.hash, "re-proposal must invalidate the previous plan hash");
  const beforeStaleExecution = (await readIncidentEvents(incidentId)).map(({ id }) => id);
  const staleExecution = await executePlan(approvalV1, planV1, `${runId}:stale-execution`);
  assertStatus(staleExecution, 409, "execution using stale approval");
  assert.deepEqual((await readIncidentEvents(incidentId)).map(({ id }) => id), beforeStaleExecution, "stale execution must not append business events");
  addStep(steps, "re-plan incremented the version and stale approval was rejected without mutation");

  const approvalV2 = await approvePlan(planV2, `${runId}:approval-v2`);
  assert.equal(approvalV2.planVersion, planV2.version, "approval must bind the current plan version");
  const approvalV2Read = await readApproval(planV2.id);
  assert.equal(approvalV2Read.id, approvalV2.id);
  assert.equal(approvalV2Read.planHash, planV2.hash);
  assert.equal(approvalV2Read.planVersion, planV2.version);
  assert.equal(approvalV2Read.decision, "APPROVE");
  assert.equal(approvalV2Read.status, "APPROVED");
  const currentIncident = await readIncident(incidentId);
  assert.equal(currentIncident.status, "APPROVED", "only dispatcher approval of current plan should approve the incident");

  const executionKey = `${runId}:approved-execution`;
  const firstExecution = await executePlan(approvalV2, planV2, executionKey);
  const receipt1 = record(responseData(firstExecution, [200, 201], "approved execution"), "receipt");
  const secondExecution = await executePlan(approvalV2, planV2, executionKey);
  const receipt2 = record(responseData(secondExecution, [200, 201], "duplicate approved execution"), "receipt");
  const assignmentId = receipt1.assignmentId ?? receipt1.assignment?.id;
  assert.ok(receipt1.id && receipt1.eventId, "execution must return a persisted receipt and event ID");
  assert.equal(receipt1.status, "EXECUTED");
  assert.equal(receipt1.planId, planV2.id);
  assert.equal(receipt1.planHash, planV2.hash);
  assert.equal(receipt1.planVersion, planV2.version);
  assert.equal(receipt1.approvalId, approvalV2.id);
  assert.equal(receipt1.shipmentId, "MED-2048");
  assert.equal(receipt1.caseId, incidentId);
  assert.equal(typeof receipt1.resultingStatus, "string");
  assert.ok(Number.isFinite(Date.parse(receipt1.executedAt)), "execution receipt must include a valid timestamp");
  assert.ok(assignmentId, "execution must return a persisted assignment ID");
  assert.deepEqual(receipt2, receipt1, "duplicate execute must replay the original receipt unchanged");
  const afterExecution = await readIncident(incidentId);
  assert.ok(["MONITORING", "EXECUTING"].includes(afterExecution.status), "successful execution must enter execution/monitoring, not close prematurely");
  addStep(steps, "dispatcher-approved execution persisted once; duplicate returned the same assignment receipt");

  const beforeRejectedDriverActions = (await readIncidentEvents(incidentId)).map(({ id }) => id);
  const wrongDriver = await apiRequest(`/api/v1/assignments/${encodeURIComponent(assignmentId)}/accept`, {
    role: "driver014",
    method: "POST",
    body: {},
  });
  assertStatus(wrongDriver, 403, "wrong driver accepting backup assignment");
  const deliverBeforePickup = await apiRequest(`/api/v1/assignments/${encodeURIComponent(assignmentId)}/deliver`, {
    role: "driver009",
    method: "POST",
    body: { proofOfDeliveryRef: "DEMO-POD-MED-2048" },
  });
  assertStatus(deliverBeforePickup, [400, 409, 422], "delivery before pickup");
  assert.deepEqual((await readIncidentEvents(incidentId)).map(({ id }) => id), beforeRejectedDriverActions, "rejected driver actions must not append business events");
  addStep(steps, "wrong driver and delivery-before-pickup failure paths rejected without mutation");

  const accept = await apiRequest(`/api/v1/assignments/${encodeURIComponent(assignmentId)}/accept`, {
    role: "driver009",
    method: "POST",
    body: {},
  });
  responseData(accept, [200, 201], "backup driver accepts assignment");
  const pickup = await apiRequest(`/api/v1/assignments/${encodeURIComponent(assignmentId)}/pickup`, {
    role: "driver009",
    method: "POST",
    body: {},
  });
  responseData(pickup, [200, 201], "backup driver pickup");
  const delivery = await apiRequest(`/api/v1/assignments/${encodeURIComponent(assignmentId)}/deliver`, {
    role: "driver009",
    method: "POST",
    body: { proofOfDeliveryRef: "DEMO-POD-MED-2048" },
  });
  responseData(delivery, [200, 201], "backup driver delivery");
  addStep(steps, "assigned backup driver accepted, picked up and delivered the critical shipment");

  const events = await readIncidentEvents(incidentId);
  const internalEvents = events.filter(({ visibility }) => visibility === "INTERNAL");
  assert.ok(internalEvents.length > 0, "case history should contain persisted internal audit events");
  const trackResponse = await apiRequest("/api/v1/track/TRK-2048", { role: "customer" });
  const tracking = responseData(trackResponse, 200, "customer tracking projection");
  const shipment = tracking.shipment ?? tracking;
  assert.equal(shipment.status, "DELIVERED", "customer must see the persisted delivery state");
  const publicJson = JSON.stringify(tracking);
  for (const event of internalEvents) {
    assert.ok(!publicJson.includes(event.id), `customer projection leaked internal event ${event.id}`);
  }
  assertNoPrivateProjectionKeys(tracking);
  addStep(steps, "customer sees delivery; internal event IDs and private projection fields are absent");

  return { incidentId, assignmentId, steps };
}

export function assertNoPrivateProjectionKeys(value, path = "customer projection") {
  const forbidden = /^(internalnotes?|staffnotes?|secret|agentprompt|authorization|approvalid)$/i;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateProjectionKeys(item, `${path}[${index}]`));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = key.replace(/[^a-z]/gi, "").toLowerCase();
      assert.ok(!forbidden.test(normalizedKey), `${path} exposed forbidden field ${key}`);
      assertNoPrivateProjectionKeys(item, `${path}.${key}`);
    }
  }
}

export async function runRejectedApprovalProbe() {
  requireIntegrationEnvironment();
  const runId = randomUUID();
  await resetDemo();
  const incident = await reportBreakdown(`${runId}:incident`);
  const incidentId = incident.id ?? incident.incidentId;
  const result = await simulate({
    incidentId,
    shipmentId: "MED-2048",
    targetDriverId: "DRV-009",
    targetVehicleId: "VAN-009",
  });
  assert.equal(result.eligible, true, "seeded plan must be feasible for rejection test");
  const plan = await proposeRecovery(incidentId, `${runId}:plan`);
  const approval = await approvePlan(plan, `${runId}:reject`, "REJECT");
  assert.equal(approval.planVersion, plan.version);
  const storedApproval = await readApproval(plan.id);
  assert.equal(storedApproval.status, "REJECTED");
  assert.equal(storedApproval.decision, "REJECT");
  const beforeRejectedExecution = (await readIncidentEvents(incidentId)).map(({ id }) => id);
  const attempt = await executePlan(approval, plan, `${runId}:execute-rejected`);
  assertStatus(attempt, [403, 409], "execution after rejected approval");
  assert.deepEqual((await readIncidentEvents(incidentId)).map(({ id }) => id), beforeRejectedExecution, "rejected approval execution must not append business events");
}
