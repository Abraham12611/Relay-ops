import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { POST as createDemoSession } from "../src/app/api/v1/demo/session/route.ts";
import { GET as demoState } from "../src/app/api/v1/demo/state/route.ts";
import { GET as listIncidents, POST as reportIncident } from "../src/app/api/v1/incidents/route.ts";
import { GET as getIncident } from "../src/app/api/v1/incidents/[id]/route.ts";
import { GET as getAffectedShipments } from "../src/app/api/v1/incidents/[id]/shipments/route.ts";
import { GET as getShipment } from "../src/app/api/v1/shipments/[id]/route.ts";
import { GET as getAvailableVehicles } from "../src/app/api/v1/vehicles/available/route.ts";
import { POST as simulateRecovery } from "../src/app/api/v1/recovery/simulate/route.ts";
import { POST as proposeRecovery } from "../src/app/api/v1/recovery/plans/route.ts";
import { POST as approveRecovery } from "../src/app/api/v1/recovery/approvals/route.ts";
import { GET as readRecoveryApproval } from "../src/app/api/v1/recovery/approvals/[planId]/route.ts";
import { POST as executeRecovery } from "../src/app/api/v1/recovery/execute/route.ts";
import { GET as driverJobs } from "../src/app/api/v1/driver/jobs/route.ts";
import { POST as acceptAssignment } from "../src/app/api/v1/assignments/[id]/accept/route.ts";
import { POST as pickupAssignment } from "../src/app/api/v1/assignments/[id]/pickup/route.ts";
import { POST as deliverAssignment } from "../src/app/api/v1/assignments/[id]/deliver/route.ts";
import { GET as trackShipment } from "../src/app/api/v1/track/[code]/route.ts";
import { GET as incidentEvents } from "../src/app/api/v1/incidents/[id]/events/route.ts";
import { prisma } from "../src/lib/db.ts";
import { resetDemoData } from "../src/lib/seed.ts";

const operatorKey = "test-operator-key-which-is-at-least-32-characters";
const readKey = "test-agent-read-key-distinct-at-least-32-characters";
const proposeKey = "test-agent-propose-key-distinct-at-least-32-characters";
const executeKey = "test-agent-execute-key-distinct-at-least-32-characters";

process.env.DEMO_MODE = "true";
process.env.DEMO_OPERATOR_KEY = operatorKey;
process.env.AGENT_READ_API_KEY = readKey;
process.env.AGENT_PROPOSE_API_KEY = proposeKey;
process.env.AGENT_EXECUTE_API_KEY = executeKey;

function jsonRequest(path, { method = "GET", headers = {}, body } = {}) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function bodyOf(response) {
  return response.json();
}

function mutationRequest(path, key, body, headers = {}) {
  return jsonRequest(path, {
    method: "POST",
    headers: {
      "x-request-id": `request-${key}`,
      "idempotency-key": key,
      ...headers,
    },
    body,
  });
}

function bodylessMutationRequest(path, key, headers = {}) {
  return jsonRequest(path, {
    method: "POST",
    headers: {
      "x-request-id": `request-${key}`,
      "idempotency-key": key,
      ...headers,
    },
  });
}

async function createRecoveryFixture() {
  await resetDemoData(prisma);
  const driverCookie = await sessionCookie("DRIVER", "DRV-014");
  const dispatcherCookie = await sessionCookie("DISPATCHER");
  const report = await reportIncident(mutationRequest("/api/v1/incidents", "fixture-breakdown", {
    type: "BREAKDOWN",
    vehicleId: "VAN-014",
    summary: "Seeded recovery transaction test.",
  }, { cookie: driverCookie }));
  assert.equal(report.status, 201);
  const proposalResponse = await proposeRecovery(mutationRequest("/api/v1/recovery/plans", "fixture-proposal", {
    incidentId: "INC-1042",
    shipmentId: "MED-2048",
    targetDriverId: "DRV-009",
    targetVehicleId: "VAN-009",
    newEtaAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    rationale: "Backup vehicle capacity is available.",
    expectedIncidentVersion: 1,
  }, { "x-agent-api-key": proposeKey }));
  assert.equal(proposalResponse.status, 201);
  return {
    driverCookie,
    dispatcherCookie,
    proposal: (await bodyOf(proposalResponse)).data,
  };
}

async function sessionCookie(role, driverId) {
  const response = await createDemoSession(jsonRequest("/api/v1/demo/session", {
    method: "POST",
    headers: { "x-demo-operator-key": operatorKey },
    body: { role, ...(driverId === undefined ? {} : { driverId }) },
  }));
  assert.equal(response.status, 201);
  return response.headers.get("set-cookie").split(";")[0];
}

before(async () => {
  await resetDemoData(prisma);
});

after(async () => {
  await prisma.$disconnect();
});

test("persisted driver breakdown, scoped APIs, and optimistic proposal versions", async () => {
  const unauthenticatedState = await demoState(jsonRequest("/api/v1/demo/state"));
  assert.equal(unauthenticatedState.status, 401);

  const baselineResponse = await demoState(jsonRequest("/api/v1/demo/state", {
    headers: { "x-demo-operator-key": operatorKey },
  }));
  assert.equal(baselineResponse.status, 200);
  const baseline = (await bodyOf(baselineResponse)).data.scenario;
  assert.equal(baselineResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(baseline.incidents, []);
  assert.equal(baseline.shipments.filter(({ assignedVehicleId }) => assignedVehicleId === "VAN-014").length, 6);
  assert.ok(baseline.shipments.filter(({ assignedVehicleId }) => assignedVehicleId === "VAN-014").every(({ status }) => status === "IN_TRANSIT"));
  assert.equal(baseline.vehicles.find(({ id }) => id === "VAN-014").status, "AVAILABLE");

  const driverCookie = await sessionCookie("DRIVER");
  const dispatcherCookie = await sessionCookie("DISPATCHER");
  const spoofedPersona = await reportIncident(jsonRequest("/api/v1/incidents", {
    method: "POST",
    headers: { "x-demo-role": "DRIVER", "idempotency-key": "spoofed-report" },
    body: { summary: "Vehicle breakdown reported without an authenticated persona" },
  }));
  assert.equal(spoofedPersona.status, 401);

  const driverCannotList = await listIncidents(jsonRequest("/api/v1/incidents", { headers: { cookie: driverCookie } }));
  assert.equal(driverCannotList.status, 403);

  const createdResponse = await reportIncident(jsonRequest("/api/v1/incidents", {
    method: "POST",
    headers: { cookie: driverCookie, "idempotency-key": "driver-breakdown-1042", "x-request-id": "incident-report-test" },
    body: { vehicleId: "VAN-014", summary: "Actual demo-driver breakdown report." },
  }));
  assert.equal(createdResponse.status, 201);
  const createdEnvelope = await bodyOf(createdResponse);
  assert.equal(createdEnvelope.correlationId, "incident-report-test");
  assert.equal(createdEnvelope.data.incident.id, "INC-1042");
  assert.equal(createdEnvelope.data.incident.version, 1);
  assert.equal(createdEnvelope.data.affectedShipmentIds.length, 6);
  assert.equal(createdEnvelope.data.duplicate, false);

  const replayResponse = await reportIncident(jsonRequest("/api/v1/incidents", {
    method: "POST",
    headers: { cookie: driverCookie, "idempotency-key": "driver-breakdown-1042" },
    body: { vehicleId: "VAN-014", summary: "Actual demo-driver breakdown report." },
  }));
  assert.equal(replayResponse.status, 201);
  assert.equal((await bodyOf(replayResponse)).data.incident.id, "INC-1042");

  const afterReportState = (await bodyOf(await demoState(jsonRequest("/api/v1/demo/state", {
    headers: { "x-demo-operator-key": operatorKey },
  })))).data.scenario;
  assert.deepEqual(afterReportState.incidents.map(({ id }) => id), ["INC-1042"]);
  assert.equal(afterReportState.vehicles.find(({ id }) => id === "VAN-014").status, "BROKEN_DOWN");
  const atRiskShipments = afterReportState.shipments.filter(({ assignedVehicleId }) => assignedVehicleId === "VAN-014");
  assert.equal(atRiskShipments.length, 6);
  assert.ok(atRiskShipments.every(({ status }) => status === "AT_RISK"));

  const listResponse = await listIncidents(jsonRequest("/api/v1/incidents", { headers: { cookie: dispatcherCookie } }));
  assert.equal(listResponse.status, 200);
  assert.equal((await bodyOf(listResponse)).data.length, 1);

  const detailResponse = await getIncident(jsonRequest("/api/v1/incidents/INC-1042", { headers: { cookie: dispatcherCookie } }), {
    params: Promise.resolve({ id: "INC-1042" }),
  });
  assert.equal(detailResponse.status, 200);
  const detail = (await bodyOf(detailResponse)).data;
  assert.equal(detail.version, 1);
  assert.equal(detail.affectedShipments.length, 6);
  assert.equal(detail.events.length, 1);

  const affectedResponse = await getAffectedShipments(jsonRequest("/api/v1/incidents/INC-1042/shipments", {
    headers: { cookie: dispatcherCookie },
  }), { params: Promise.resolve({ id: "INC-1042" }) });
  assert.equal((await bodyOf(affectedResponse)).data.shipments.length, 6);

  const shipmentResponse = await getShipment(jsonRequest("/api/v1/shipments/MED-2048", {
    headers: { cookie: driverCookie },
  }), { params: Promise.resolve({ id: "MED-2048" }) });
  assert.equal(shipmentResponse.status, 200);
  assert.equal((await bodyOf(shipmentResponse)).data.status, "AT_RISK");

  const availableResponse = await getAvailableVehicles(jsonRequest("/api/v1/vehicles/available", {
    headers: { "x-agent-api-key": readKey },
  }));
  assert.equal(availableResponse.status, 200);
  assert.deepEqual((await bodyOf(availableResponse)).data.map(({ id }) => id), ["VAN-009"]);

  const simulationResponse = await simulateRecovery(jsonRequest("/api/v1/recovery/simulate", {
    method: "POST",
    headers: { "x-agent-api-key": readKey },
    body: { incidentId: "INC-1042", shipmentId: "MED-2048", targetDriverId: "DRV-009", targetVehicleId: "VAN-009" },
  }));
  assert.equal(simulationResponse.status, 200);
  assert.deepEqual((await bodyOf(simulationResponse)).data, { eligible: true, capacityOk: true, conflicts: [] });

  const executeKeyCannotRead = await listIncidents(jsonRequest("/api/v1/incidents", {
    headers: { "x-agent-api-key": executeKey },
  }));
  assert.equal(executeKeyCannotRead.status, 403);

  const proposalInput = {
    incidentId: "INC-1042",
    shipmentId: "MED-2048",
    targetDriverId: "DRV-009",
    targetVehicleId: "VAN-009",
    newEtaAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    rationale: "Backup van has verified capacity for the critical shipment.",
    expectedIncidentVersion: 1,
  };
  const proposalResponse = await proposeRecovery(jsonRequest("/api/v1/recovery/plans", {
    method: "POST",
    headers: { "x-agent-api-key": proposeKey, "idempotency-key": "proposal-1042-v1" },
    body: proposalInput,
  }));
  assert.equal(proposalResponse.status, 201);
  const proposal = (await bodyOf(proposalResponse)).data;
  assert.equal(proposal.incidentId, "INC-1042");
  assert.equal(proposal.version, 2);
  assert.equal(proposal.status, "PROPOSED");
  assert.equal(proposal.feasibility.eligible, true);

  const staleProposalResponse = await proposeRecovery(jsonRequest("/api/v1/recovery/plans", {
    method: "POST",
    headers: { "x-agent-api-key": proposeKey, "idempotency-key": "proposal-1042-stale" },
    body: proposalInput,
  }));
  assert.equal(staleProposalResponse.status, 409);
  assert.equal((await bodyOf(staleProposalResponse)).error.code, "STALE_INCIDENT_VERSION");

  const refreshedIncidentResponse = await getIncident(jsonRequest("/api/v1/incidents/INC-1042", {
    headers: { cookie: dispatcherCookie },
  }), { params: Promise.resolve({ id: "INC-1042" }) });
  const refreshed = (await bodyOf(refreshedIncidentResponse)).data;
  assert.equal(refreshed.version, 2);
  assert.equal(refreshed.currentPlanId, proposal.id);
  assert.equal(refreshed.affectedShipments.length, 6);
  assert.equal(refreshed.events.length, 2);
  assert.equal(refreshed.plans.length, 1);
});

test("dispatcher approval, atomic execution, driver completion, and customer projection use persisted state", async () => {
  const { driverCookie, dispatcherCookie, proposal } = await createRecoveryFixture();
  const backupCookie = await sessionCookie("DRIVER", "DRV-009");
  const approvalPath = `/api/v1/recovery/approvals/${encodeURIComponent(proposal.id)}`;
  const noDecision = await readRecoveryApproval(jsonRequest(approvalPath, { headers: { cookie: dispatcherCookie } }), {
    params: Promise.resolve({ planId: proposal.id }),
  });
  assert.equal(noDecision.status, 404);
  assert.equal((await bodyOf(noDecision)).error.code, "APPROVAL_NOT_FOUND");

  const approvalBody = {
    planId: proposal.id,
    planHash: proposal.hash,
    planVersion: proposal.version,
    decision: "APPROVE",
  };
  const agentCannotApprove = await approveRecovery(mutationRequest("/api/v1/recovery/approvals", "agent-approval-denied", approvalBody, {
    "x-agent-api-key": executeKey,
  }));
  assert.equal(agentCannotApprove.status, 403);
  assert.equal((await bodyOf(agentCannotApprove)).error.code, "FORBIDDEN");
  const driverCannotApprove = await approveRecovery(mutationRequest("/api/v1/recovery/approvals", "driver-approval-denied", approvalBody, {
    cookie: driverCookie,
  }));
  assert.equal(driverCannotApprove.status, 403);

  const missingRequestId = await approveRecovery(jsonRequest("/api/v1/recovery/approvals", {
    method: "POST",
    headers: { cookie: dispatcherCookie, "idempotency-key": "missing-request-id" },
    body: approvalBody,
  }));
  assert.equal(missingRequestId.status, 400);
  assert.equal((await bodyOf(missingRequestId)).error.code, "REQUEST_ID_REQUIRED");

  const wrongVersion = await approveRecovery(mutationRequest("/api/v1/recovery/approvals", "stale-plan-version", {
    ...approvalBody,
    planVersion: proposal.version + 1,
  }, { cookie: dispatcherCookie }));
  assert.equal(wrongVersion.status, 409);
  assert.equal((await bodyOf(wrongVersion)).error.code, "STALE_PLAN_VERSION");
  const wrongHash = await approveRecovery(mutationRequest("/api/v1/recovery/approvals", "stale-plan-hash", {
    ...approvalBody,
    planHash: "not-the-persisted-plan-hash",
  }, { cookie: dispatcherCookie }));
  assert.equal(wrongHash.status, 409);
  assert.equal((await bodyOf(wrongHash)).error.code, "PLAN_HASH_MISMATCH");

  const approvalResponse = await approveRecovery(mutationRequest("/api/v1/recovery/approvals", "dispatcher-approve-v2", approvalBody, {
    cookie: dispatcherCookie,
  }));
  assert.equal(approvalResponse.status, 201);
  const approval = (await bodyOf(approvalResponse)).data;
  assert.equal(approval.status, "APPROVED");
  assert.equal(approval.decision, "APPROVE");
  assert.equal(approval.planId, proposal.id);
  assert.equal(approval.planHash, proposal.hash);
  assert.equal(approval.planVersion, proposal.version);
  assert.equal(approval.approvedBy, "USR-DISPATCHER-01");
  assert.equal(approval.isCurrent, true);

  const dispatcherApprovalRead = await readRecoveryApproval(jsonRequest(approvalPath, {
    headers: { cookie: dispatcherCookie },
  }), { params: Promise.resolve({ planId: proposal.id }) });
  assert.equal(dispatcherApprovalRead.status, 200);
  assert.equal((await bodyOf(dispatcherApprovalRead)).data.id, approval.id);
  const agentApprovalRead = await readRecoveryApproval(jsonRequest(approvalPath, {
    headers: { "x-agent-api-key": readKey },
  }), { params: Promise.resolve({ planId: proposal.id }) });
  assert.equal(agentApprovalRead.status, 200);
  assert.equal((await bodyOf(agentApprovalRead)).data.planVersion, proposal.version);

  const executePath = "/api/v1/recovery/execute";
  const execute = (key, approvalId = approval.id, planId = proposal.id, headers = { "x-agent-api-key": executeKey }) =>
    executeRecovery(mutationRequest(executePath, key, { approvalId, planId, idempotencyKey: key }, headers));
  const dispatcherCannotExecute = await execute("dispatcher-execution-denied", approval.id, proposal.id, { cookie: dispatcherCookie });
  assert.equal(dispatcherCannotExecute.status, 403);

  const wrongApproval = await execute("wrong-approval", "APR-NOT-FOR-THIS-PLAN");
  assert.equal(wrongApproval.status, 403);
  assert.equal((await bodyOf(wrongApproval)).error.code, "APPROVAL_REQUIRED");

  await prisma.recoveryPlan.update({ where: { id: proposal.id }, data: { hash: "tampered-plan-hash" } });
  const hashMismatch = await execute("tampered-plan-hash");
  assert.equal(hashMismatch.status, 409);
  assert.equal((await bodyOf(hashMismatch)).error.code, "APPROVAL_BINDING_MISMATCH");
  await prisma.recoveryPlan.update({ where: { id: proposal.id }, data: { hash: proposal.hash } });

  await prisma.recoveryPlan.update({ where: { id: proposal.id }, data: { version: proposal.version + 1 } });
  await prisma.incident.update({ where: { id: "INC-1042" }, data: { version: proposal.version + 1 } });
  const versionTamper = await execute("tampered-plan-version");
  assert.equal(versionTamper.status, 409);
  assert.equal((await bodyOf(versionTamper)).error.code, "APPROVAL_BINDING_MISMATCH");
  await prisma.recoveryPlan.update({ where: { id: proposal.id }, data: { version: proposal.version } });
  await prisma.incident.update({ where: { id: "INC-1042" }, data: { version: proposal.version } });

  await prisma.incident.update({ where: { id: "INC-1042" }, data: { version: proposal.version + 1 } });
  const staleExecution = await execute("stale-execution-version");
  assert.equal(staleExecution.status, 409);
  assert.equal((await bodyOf(staleExecution)).error.code, "STALE_PLAN_VERSION");
  await prisma.incident.update({ where: { id: "INC-1042" }, data: { version: proposal.version } });

  await prisma.shipment.update({ where: { id: "MED-2048" }, data: { status: "DELIVERED" } });
  const deliveredExecution = await execute("already-delivered");
  assert.equal(deliveredExecution.status, 409);
  assert.equal((await bodyOf(deliveredExecution)).error.code, "SHIPMENT_ALREADY_DELIVERED");
  await prisma.shipment.update({ where: { id: "MED-2048" }, data: { status: "AT_RISK" } });

  const assignmentsBeforeCapacityFailure = await prisma.assignment.count({ where: { shipmentId: "MED-2048" } });
  await prisma.vehicle.update({ where: { id: "VAN-009" }, data: { occupiedUnits: 9 } });
  const noCapacity = await execute("capacity-changed");
  assert.equal(noCapacity.status, 422);
  assert.equal((await bodyOf(noCapacity)).error.code, "TARGET_CAPACITY_UNAVAILABLE");
  assert.equal((await prisma.approval.findUnique({ where: { id: approval.id } })).status, "APPROVED");
  assert.equal(await prisma.assignment.count({ where: { shipmentId: "MED-2048" } }), assignmentsBeforeCapacityFailure);
  await prisma.vehicle.update({ where: { id: "VAN-009" }, data: { occupiedUnits: 2 } });

  const assignmentsBefore = await prisma.assignment.count({ where: { shipmentId: "MED-2048" } });
  const executedResponse = await execute("execute-med-2048");
  assert.equal(executedResponse.status, 201);
  const receipt = (await bodyOf(executedResponse)).data;
  assert.equal(receipt.status, "EXECUTED");
  assert.equal(receipt.planId, proposal.id);
  assert.equal(receipt.planHash, proposal.hash);
  assert.equal(receipt.planVersion, proposal.version);
  assert.equal(receipt.approvalId, approval.id);
  assert.ok(receipt.assignmentId);
  assert.equal(receipt.shipmentId, "MED-2048");
  assert.equal(receipt.caseId, "INC-1042");
  assert.ok(receipt.eventId);
  assert.equal(receipt.resultingStatus, "REASSIGNED");
  assert.equal((await prisma.approval.findUnique({ where: { id: approval.id } })).status, "CONSUMED");
  assert.equal((await prisma.recoveryPlan.findUnique({ where: { id: proposal.id } })).status, "EXECUTED");
  assert.equal((await prisma.incident.findUnique({ where: { id: "INC-1042" } })).status, "MONITORING");
  assert.equal((await prisma.shipment.findUnique({ where: { id: "MED-2048" } })).status, "REASSIGNED");
  assert.equal((await prisma.vehicle.findUnique({ where: { id: "VAN-014" } })).occupiedUnits, 10);
  assert.equal((await prisma.vehicle.findUnique({ where: { id: "VAN-009" } })).occupiedUnits, 4);

  const afterExecutionCount = await prisma.assignment.count({ where: { shipmentId: "MED-2048" } });
  assert.equal(afterExecutionCount, assignmentsBefore + 1);
  const duplicateExecution = await execute("execute-med-2048");
  assert.equal(duplicateExecution.status, 200);
  assert.deepEqual((await bodyOf(duplicateExecution)).data, receipt);
  assert.equal(await prisma.assignment.count({ where: { shipmentId: "MED-2048" } }), afterExecutionCount);
  const reusedKey = await execute("execute-med-2048", approval.id, "PLAN-OTHER");
  assert.equal(reusedKey.status, 409);
  assert.equal((await bodyOf(reusedKey)).error.code, "IDEMPOTENCY_KEY_REUSED");
  const secondExecutionKey = await execute("second-execution-key");
  assert.equal(secondExecutionKey.status, 409);
  assert.equal((await bodyOf(secondExecutionKey)).error.code, "APPROVAL_CONSUMED");

  const jobsResponse = await driverJobs(jsonRequest("/api/v1/driver/jobs", { headers: { cookie: backupCookie } }));
  assert.equal(jobsResponse.status, 200);
  const jobs = (await bodyOf(jobsResponse)).data;
  const recoveryJob = jobs.find(({ assignment }) => assignment.id === receipt.assignmentId);
  assert.ok(recoveryJob);
  assert.equal(recoveryJob.assignment.driverId, "DRV-009");
  assert.equal(recoveryJob.shipment.id, "MED-2048");
  assert.equal(recoveryJob.shipment.status, "REASSIGNED");

  const staleDriverRead = await getShipment(jsonRequest("/api/v1/shipments/MED-2048", {
    headers: { cookie: driverCookie },
  }), { params: Promise.resolve({ id: "MED-2048" }) });
  assert.equal(staleDriverRead.status, 403);
  const currentDriverRead = await getShipment(jsonRequest("/api/v1/shipments/MED-2048", {
    headers: { cookie: backupCookie },
  }), { params: Promise.resolve({ id: "MED-2048" }) });
  assert.equal(currentDriverRead.status, 200);
  const shipmentDto = (await bodyOf(currentDriverRead)).data;
  assert.equal(shipmentDto.id, "MED-2048");
  assert.equal(shipmentDto.status, "REASSIGNED");
  assert.equal("shipment" in shipmentDto, false);
  assert.equal("assignment" in shipmentDto, false);

  const assignmentPath = (action) => `/api/v1/assignments/${encodeURIComponent(receipt.assignmentId)}/${action}`;
  const someoneElsesAccept = await acceptAssignment(mutationRequest(assignmentPath("accept"), "wrong-driver-accept", {}, {
    cookie: driverCookie,
  }), { params: Promise.resolve({ id: receipt.assignmentId }) });
  assert.equal(someoneElsesAccept.status, 403);
  const pickupBeforeAccept = await pickupAssignment(mutationRequest(assignmentPath("pickup"), "pickup-before-accept", {}, {
    cookie: backupCookie,
  }), { params: Promise.resolve({ id: receipt.assignmentId }) });
  assert.equal(pickupBeforeAccept.status, 409);
  const deliverBeforeAccept = await deliverAssignment(mutationRequest(assignmentPath("deliver"), "deliver-before-accept", {
    proofOfDeliveryRef: "POD-2048",
  }, { cookie: backupCookie }), { params: Promise.resolve({ id: receipt.assignmentId }) });
  assert.equal(deliverBeforeAccept.status, 409);

  const accepted = await acceptAssignment(bodylessMutationRequest(assignmentPath("accept"), "accept-med-2048", {
    cookie: backupCookie,
  }), { params: Promise.resolve({ id: receipt.assignmentId }) });
  assert.equal(accepted.status, 200);
  assert.equal((await bodyOf(accepted)).data.status, "ACCEPTED");
  const eventCountAfterAccept = await prisma.businessEvent.count({ where: { shipmentId: "MED-2048" } });
  const duplicateAccept = await acceptAssignment(mutationRequest(assignmentPath("accept"), "accept-med-2048", {}, {
    cookie: backupCookie,
  }), { params: Promise.resolve({ id: receipt.assignmentId }) });
  assert.equal(duplicateAccept.status, 200);
  assert.equal((await prisma.businessEvent.count({ where: { shipmentId: "MED-2048" } })), eventCountAfterAccept);

  const deliverBeforePickup = await deliverAssignment(mutationRequest(assignmentPath("deliver"), "deliver-before-pickup", {
    proofOfDeliveryRef: "POD-2048",
  }, { cookie: backupCookie }), { params: Promise.resolve({ id: receipt.assignmentId }) });
  assert.equal(deliverBeforePickup.status, 409);
  assert.equal((await bodyOf(deliverBeforePickup)).error.code, "INVALID_ASSIGNMENT_TRANSITION");
  const pickedUp = await pickupAssignment(mutationRequest(assignmentPath("pickup"), "pickup-med-2048", {}, {
    cookie: backupCookie,
  }), { params: Promise.resolve({ id: receipt.assignmentId }) });
  assert.equal(pickedUp.status, 200);
  assert.equal((await bodyOf(pickedUp)).data.status, "PICKED_UP");
  const pickedShipment = await getShipment(jsonRequest("/api/v1/shipments/MED-2048", {
    headers: { cookie: backupCookie },
  }), { params: Promise.resolve({ id: "MED-2048" }) });
  assert.equal((await bodyOf(pickedShipment)).data.status, "PICKED_UP_BY_BACKUP");

  const delivered = await deliverAssignment(mutationRequest(assignmentPath("deliver"), "deliver-med-2048", {
    proofOfDeliveryRef: "POD-2048",
  }, { cookie: backupCookie }), { params: Promise.resolve({ id: receipt.assignmentId }) });
  assert.equal(delivered.status, 200);
  const deliveredAssignment = (await bodyOf(delivered)).data;
  assert.equal(deliveredAssignment.status, "COMPLETED");
  assert.equal(deliveredAssignment.id, receipt.assignmentId);
  const deliveryEventCount = await prisma.businessEvent.count({
    where: { shipmentId: "MED-2048", type: "DRIVER_DELIVERY_CONFIRMED" },
  });
  const duplicateDelivery = await deliverAssignment(mutationRequest(assignmentPath("deliver"), "deliver-med-2048", {
    proofOfDeliveryRef: "POD-2048",
  }, { cookie: backupCookie }), { params: Promise.resolve({ id: receipt.assignmentId }) });
  assert.equal(duplicateDelivery.status, 200);
  assert.deepEqual((await bodyOf(duplicateDelivery)).data, deliveredAssignment);
  const changedProofReplay = await deliverAssignment(mutationRequest(assignmentPath("deliver"), "deliver-med-2048", {
    proofOfDeliveryRef: "POD-OTHER",
  }, { cookie: backupCookie }), { params: Promise.resolve({ id: receipt.assignmentId }) });
  assert.equal(changedProofReplay.status, 409);
  assert.equal((await bodyOf(changedProofReplay)).error.code, "IDEMPOTENCY_KEY_REUSED");
  const secondProof = await deliverAssignment(mutationRequest(assignmentPath("deliver"), "deliver-med-2048-second-key", {
    proofOfDeliveryRef: "POD-OTHER",
  }, { cookie: backupCookie }), { params: Promise.resolve({ id: receipt.assignmentId }) });
  assert.equal(secondProof.status, 409);
  assert.equal((await bodyOf(secondProof)).error.code, "DELIVERY_ALREADY_CONFIRMED");
  assert.equal(await prisma.businessEvent.count({
    where: { shipmentId: "MED-2048", type: "DRIVER_DELIVERY_CONFIRMED" },
  }), deliveryEventCount);
  const deliveredShipmentResponse = await getShipment(jsonRequest("/api/v1/shipments/MED-2048", {
    headers: { cookie: backupCookie },
  }), { params: Promise.resolve({ id: "MED-2048" }) });
  const deliveredShipment = (await bodyOf(deliveredShipmentResponse)).data;
  assert.equal(deliveredShipment.status, "DELIVERED");
  assert.equal(deliveredShipment.proofOfDeliveryRef, "POD-2048");

  const trackingResponse = await trackShipment(jsonRequest("/api/v1/track/TRK-2048"), {
    params: Promise.resolve({ code: "TRK-2048" }),
  });
  assert.equal(trackingResponse.status, 200);
  const tracking = (await bodyOf(trackingResponse)).data;
  assert.equal(tracking.shipment.status, "DELIVERED");
  assert.ok(tracking.shipment.updatedAt);
  assert.equal(tracking.shipment.deliveredAt, tracking.timeline.find(({ kind }) => kind === "DELIVERY").createdAt);
  assert.ok(tracking.timeline.some(({ kind }) => kind === "RECOVERY"));
  assert.ok(tracking.timeline.some(({ kind }) => kind === "STATUS"));
  assert.ok(tracking.notifications.length >= 3);
  assert.doesNotMatch(JSON.stringify(tracking), /approvalId|planHash|REASSIGNMENT_EXECUTED|proofOfDeliveryRef/i);

  const persistedAffected = await getAffectedShipments(jsonRequest("/api/v1/incidents/INC-1042/shipments", {
    headers: { cookie: dispatcherCookie },
  }), { params: Promise.resolve({ id: "INC-1042" }) });
  const affectedShipments = (await bodyOf(persistedAffected)).data.shipments;
  assert.equal(affectedShipments.find(({ id }) => id === "MED-2048").status, "DELIVERED");
  assert.equal(affectedShipments.find(({ id }) => id === "MED-2048").assignedDriverId, "DRV-009");
  assert.equal((await prisma.incident.findUnique({ where: { id: "INC-1042" } })).status, "MONITORING");

  await prisma.shipment.updateMany({
    where: { id: { in: ["PKG-2050", "PKG-2051", "PKG-2052", "PKG-2053"] } },
    data: { status: "DELIVERY_FAILED" },
  });
  await prisma.assignment.create({
    data: {
      id: "ASG-CLOSURE-PROBE",
      shipmentId: "PKG-2049",
      driverId: "DRV-009",
      vehicleId: "VAN-009",
      incidentId: "INC-1042",
      status: "PICKED_UP",
    },
  });
  await prisma.shipment.update({
    where: { id: "PKG-2049" },
    data: { assignedDriverId: "DRV-009", assignedVehicleId: "VAN-009", status: "PICKED_UP_BY_BACKUP" },
  });
  const finalDelivery = await deliverAssignment(mutationRequest("/api/v1/assignments/ASG-CLOSURE-PROBE/deliver", "close-incident-delivery", {
    proofOfDeliveryRef: "POD-2049",
  }, { cookie: backupCookie }), { params: Promise.resolve({ id: "ASG-CLOSURE-PROBE" }) });
  assert.equal(finalDelivery.status, 200);
  const resolvedIncident = await getIncident(jsonRequest("/api/v1/incidents/INC-1042", {
    headers: { cookie: dispatcherCookie },
  }), { params: Promise.resolve({ id: "INC-1042" }) });
  const resolved = (await bodyOf(resolvedIncident)).data;
  assert.equal(resolved.status, "RESOLVED");
  assert.ok(resolved.resolvedAt);
  const eventFeed = await incidentEvents(jsonRequest("/api/v1/incidents/INC-1042/events", {
    headers: { cookie: dispatcherCookie },
  }), { params: Promise.resolve({ id: "INC-1042" }) });
  const events = (await bodyOf(eventFeed)).data.events;
  assert.ok(events.some(({ type }) => type === "RECOVERY_PLAN_APPROVED"));
  assert.ok(events.some(({ type, payload }) => type === "REASSIGNMENT_EXECUTED" && payload.approvalId === approval.id));
  assert.ok(events.some(({ type }) => type === "DRIVER_ASSIGNMENT_ACCEPTED"));
  assert.ok(events.some(({ type }) => type === "DRIVER_PICKUP_CONFIRMED"));
  assert.ok(events.some(({ type }) => type === "DRIVER_DELIVERY_CONFIRMED"));
  assert.ok(events.some(({ type }) => type === "INCIDENT_RESOLVED"));

  const regularPickup = await pickupAssignment(mutationRequest("/api/v1/assignments/ASG-1010/pickup", "pickup-regular-job", {}, {
    cookie: backupCookie,
  }), { params: Promise.resolve({ id: "ASG-1010" }) });
  assert.equal(regularPickup.status, 200);
  assert.equal((await bodyOf(regularPickup)).data.status, "PICKED_UP");
  const regularDelivery = await deliverAssignment(mutationRequest("/api/v1/assignments/ASG-1010/deliver", "deliver-regular-job", {
    proofOfDeliveryRef: "POD-1010",
  }, { cookie: backupCookie }), { params: Promise.resolve({ id: "ASG-1010" }) });
  assert.equal(regularDelivery.status, 200);
  assert.equal((await bodyOf(regularDelivery)).data.status, "COMPLETED");
  assert.equal((await prisma.businessEvent.count({ where: { shipmentId: "SHP-1010", caseId: null } })), 2);
  assert.equal((await prisma.customerNotification.count({ where: { shipmentId: "SHP-1010", caseId: null } })), 2);
  const regularTracking = await trackShipment(jsonRequest("/api/v1/track/TRK-1010"), {
    params: Promise.resolve({ code: "TRK-1010" }),
  });
  assert.equal((await bodyOf(regularTracking)).data.shipment.status, "DELIVERED");
});

test("rejected and expired dispatcher decisions cannot execute", async () => {
  const rejectedFixture = await createRecoveryFixture();
  const rejectResponse = await approveRecovery(mutationRequest("/api/v1/recovery/approvals", "dispatcher-reject-v2", {
    planId: rejectedFixture.proposal.id,
    planHash: rejectedFixture.proposal.hash,
    planVersion: rejectedFixture.proposal.version,
    decision: "REJECT",
    reason: "Capacity review requested a different plan.",
  }, { cookie: rejectedFixture.dispatcherCookie }));
  assert.equal(rejectResponse.status, 201);
  const rejectedApproval = (await bodyOf(rejectResponse)).data;
  assert.equal(rejectedApproval.status, "REJECTED");
  assert.equal(rejectedApproval.decision, "REJECT");
  const rejectedExecute = await executeRecovery(mutationRequest("/api/v1/recovery/execute", "execute-rejected-plan", {
    approvalId: rejectedApproval.id,
    planId: rejectedFixture.proposal.id,
    idempotencyKey: "execute-rejected-plan",
  }, { "x-agent-api-key": executeKey }));
  assert.equal(rejectedExecute.status, 403);
  assert.equal((await bodyOf(rejectedExecute)).error.code, "APPROVAL_NOT_APPROVED");
  assert.equal(await prisma.businessEvent.count({ where: { caseId: "INC-1042", type: "RECOVERY_PLAN_REJECTED" } }), 1);

  const expiredFixture = await createRecoveryFixture();
  const approvedResponse = await approveRecovery(mutationRequest("/api/v1/recovery/approvals", "dispatcher-approve-expiry", {
    planId: expiredFixture.proposal.id,
    planHash: expiredFixture.proposal.hash,
    planVersion: expiredFixture.proposal.version,
    decision: "APPROVE",
  }, { cookie: expiredFixture.dispatcherCookie }));
  assert.equal(approvedResponse.status, 201);
  const approved = (await bodyOf(approvedResponse)).data;
  await prisma.approval.update({ where: { id: approved.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  const expiredRead = await readRecoveryApproval(jsonRequest(`/api/v1/recovery/approvals/${expiredFixture.proposal.id}`, {
    headers: { cookie: expiredFixture.dispatcherCookie },
  }), { params: Promise.resolve({ planId: expiredFixture.proposal.id }) });
  assert.equal(expiredRead.status, 200);
  assert.equal((await bodyOf(expiredRead)).data.status, "EXPIRED");
  assert.equal((await prisma.approval.findUnique({ where: { id: approved.id } })).status, "EXPIRED");
  assert.equal((await prisma.recoveryPlan.findUnique({ where: { id: expiredFixture.proposal.id } })).status, "EXPIRED");
  assert.equal((await prisma.incident.findUnique({ where: { id: "INC-1042" } })).status, "INVESTIGATING");
  assert.equal(await prisma.businessEvent.count({ where: { caseId: "INC-1042", type: "RECOVERY_APPROVAL_EXPIRED" } }), 1);
  const expiredExecute = await executeRecovery(mutationRequest("/api/v1/recovery/execute", "execute-expired-plan", {
    approvalId: approved.id,
    planId: expiredFixture.proposal.id,
    idempotencyKey: "execute-expired-plan",
  }, { "x-agent-api-key": executeKey }));
  assert.equal(expiredExecute.status, 409);
  assert.equal((await bodyOf(expiredExecute)).error.code, "APPROVAL_EXPIRED");
});
