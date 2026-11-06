import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { POST as createDemoSession } from "../src/app/api/v1/demo/session/route.ts";
import { POST as createBrowserDemoSession } from "../src/app/api/demo/session/route.ts";
import { GET as demoState } from "../src/app/api/v1/demo/state/route.ts";
import { GET as listIncidents, POST as reportIncident } from "../src/app/api/v1/incidents/route.ts";
import { GET as getIncident } from "../src/app/api/v1/incidents/[id]/route.ts";
import { GET as getAffectedShipments } from "../src/app/api/v1/incidents/[id]/shipments/route.ts";
import { GET as getIncidentEvents } from "../src/app/api/v1/incidents/[id]/events/route.ts";
import { GET as getDriverJobs } from "../src/app/api/v1/driver/jobs/route.ts";
import { GET as getShipment } from "../src/app/api/v1/shipments/[id]/route.ts";
import { GET as getAvailableVehicles } from "../src/app/api/v1/vehicles/available/route.ts";
import { POST as simulateRecovery } from "../src/app/api/v1/recovery/simulate/route.ts";
import { POST as proposeRecovery } from "../src/app/api/v1/recovery/plans/route.ts";
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

async function sessionCookie(role, driverId) {
  const response = await createDemoSession(jsonRequest("/api/v1/demo/session", {
    method: "POST",
    headers: { "x-demo-operator-key": operatorKey },
    body: { role, ...(driverId ? { driverId } : {}) },
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
  assert.equal(baseline.events.length, 7);
  assert.ok(baseline.events.every(({ caseId, visibility }) => caseId === null && visibility === "CUSTOMER"));
  assert.equal(baseline.shipments.filter(({ assignedVehicleId }) => assignedVehicleId === "VAN-014").length, 6);
  assert.ok(baseline.shipments.filter(({ assignedVehicleId }) => assignedVehicleId === "VAN-014").every(({ status }) => status === "IN_TRANSIT"));
  assert.equal(baseline.vehicles.find(({ id }) => id === "VAN-014").status, "AVAILABLE");

  const invalidDriverSession = await createDemoSession(jsonRequest("/api/v1/demo/session", {
    method: "POST",
    headers: { "x-demo-operator-key": operatorKey },
    body: { role: "DRIVER", driverId: "DRV-404" },
  }));
  assert.equal(invalidDriverSession.status, 400);

  const driverCookie = await sessionCookie("DRIVER");
  const backupDriverCookie = await sessionCookie("DRIVER", "DRV-009");
  const dispatcherCookie = await sessionCookie("DISPATCHER");
  const spoofedPersona = await reportIncident(jsonRequest("/api/v1/incidents", {
    method: "POST",
    headers: { "x-demo-role": "DRIVER", "idempotency-key": "spoofed-report" },
    body: { summary: "Vehicle breakdown reported without an authenticated persona" },
  }));
  assert.equal(spoofedPersona.status, 401);

  const driverCannotList = await listIncidents(jsonRequest("/api/v1/incidents", { headers: { cookie: driverCookie } }));
  assert.equal(driverCannotList.status, 403);
  const backupCannotClaimPrimaryVehicle = await reportIncident(jsonRequest("/api/v1/incidents", {
    method: "POST",
    headers: { cookie: backupDriverCookie, "idempotency-key": "backup-wrong-vehicle" },
    body: { vehicleId: "VAN-014", summary: "Backup cannot impersonate the primary driver." },
  }));
  assert.equal(backupCannotClaimPrimaryVehicle.status, 403);

  const createdResponse = await reportIncident(jsonRequest("/api/v1/incidents", {
    method: "POST",
    headers: { cookie: driverCookie, "idempotency-key": "driver-breakdown-1042", "x-request-id": "incident-report-test" },
    body: { vehicleId: "VAN-014", summary: "Actual demo-driver breakdown report." },
  }));
  assert.equal(createdResponse.status, 201);
  const createdEnvelope = await bodyOf(createdResponse);
  assert.equal(createdEnvelope.correlationId, "incident-report-test");
  assert.equal(createdEnvelope.data.id, "INC-1042");
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
  assert.equal((await bodyOf(replayResponse)).data.id, "INC-1042");

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

  const detailResponse = await getIncident(jsonRequest("/api/v1/incidents/INC-1042", {
    headers: { cookie: dispatcherCookie, "x-request-id": "incident-read-test" },
  }), {
    params: Promise.resolve({ id: "INC-1042" }),
  });
  assert.equal(detailResponse.status, 200);
  const detailEnvelope = await bodyOf(detailResponse);
  assert.equal(detailEnvelope.correlationId, "incident-read-test");
  const detail = detailEnvelope.data;
  assert.equal(detail.version, 1);
  assert.equal(detail.affectedShipments.length, 6);
  assert.equal(detail.events.length, 1);
  assert.equal(detail.currentPlan, null);

  const eventsResponse = await getIncidentEvents(jsonRequest("/api/v1/incidents/INC-1042/events", {
    headers: { "x-agent-api-key": readKey, "x-request-id": "agent-read-events-test" },
  }), { params: Promise.resolve({ id: "INC-1042" }) });
  const eventEnvelope = await bodyOf(eventsResponse);
  assert.equal(eventsResponse.status, 200);
  assert.equal(eventEnvelope.correlationId, "agent-read-events-test");
  assert.equal(eventEnvelope.data.events.length, 1);

  const backupJobsResponse = await getDriverJobs(jsonRequest("/api/v1/driver/jobs", { headers: { cookie: backupDriverCookie } }));
  assert.equal(backupJobsResponse.status, 200);
  const backupJobs = (await bodyOf(backupJobsResponse)).data;
  assert.equal(backupJobs.length, 1);
  assert.equal(backupJobs[0].assignment.driverId, "DRV-009");
  assert.equal(backupJobs[0].shipment.id, "SHP-1010");

  const affectedResponse = await getAffectedShipments(jsonRequest("/api/v1/incidents/INC-1042/shipments", {
    headers: { cookie: dispatcherCookie },
  }), { params: Promise.resolve({ id: "INC-1042" }) });
  assert.equal((await bodyOf(affectedResponse)).data.shipments.length, 6);

  const shipmentResponse = await getShipment(jsonRequest("/api/v1/shipments/MED-2048", {
    headers: { cookie: driverCookie },
  }), { params: Promise.resolve({ id: "MED-2048" }) });
  assert.equal(shipmentResponse.status, 200);
  const shipmentDto = (await bodyOf(shipmentResponse)).data;
  assert.equal(shipmentDto.status, "AT_RISK");
  assert.equal(shipmentDto.id, "MED-2048");
  assert.equal("assignedDriver" in shipmentDto, false);

  const backupShipmentResponse = await getShipment(jsonRequest("/api/v1/shipments/SHP-1010", {
    headers: { cookie: backupDriverCookie },
  }), { params: Promise.resolve({ id: "SHP-1010" }) });
  assert.equal(backupShipmentResponse.status, 200);
  const backupCannotReadPrimaryShipment = await getShipment(jsonRequest("/api/v1/shipments/MED-2048", {
    headers: { cookie: backupDriverCookie },
  }), { params: Promise.resolve({ id: "MED-2048" }) });
  assert.equal(backupCannotReadPrimaryShipment.status, 403);

  const browserSessionResponse = await createBrowserDemoSession(jsonRequest("/api/demo/session", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
    body: { role: "DRIVER", driverId: "DRV-009" },
  }));
  assert.equal(browserSessionResponse.status, 201);
  const browserSessionData = (await bodyOf(browserSessionResponse)).data;
  assert.equal(browserSessionData.userId, "USR-DRIVER-009");
  assert.equal(browserSessionData.driverId, "DRV-009");
  assert.match(browserSessionResponse.headers.get("set-cookie"), /HttpOnly/);
  const crossOriginSessionResponse = await createBrowserDemoSession(jsonRequest("/api/demo/session", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
    body: { role: "DISPATCHER" },
  }));
  assert.equal(crossOriginSessionResponse.status, 403);

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
    newEtaAt: "2026-11-06T18:40:00.000Z",
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
  assert.equal(refreshed.currentPlan.version, 2);
  assert.equal(refreshed.currentPlan.id, proposal.id);
  assert.equal(refreshed.currentPlan.hash, proposal.hash);
  assert.equal(refreshed.currentPlan.feasibilitySnapshot.eligible, true);
  assert.equal(refreshed.currentApproval, null);

  const shipmentOnlyNotice = await prisma.customerNotification.create({
    data: {
      id: "NTF-SHIPMENT-ONLY-1010",
      shipmentId: "SHP-1010",
      caseId: null,
      channel: "IN_APP",
      content: "Your delivery is progressing.",
      status: "VISIBLE",
      createdAt: new Date("2026-11-06T17:09:00.000Z"),
    },
  });
  assert.equal(shipmentOnlyNotice.caseId, null);
});
