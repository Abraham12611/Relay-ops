import assert from "node:assert/strict";
import test from "node:test";
import {
  RelayOpsApi,
  RelayOpsApiConfigurationError,
  RelayOpsApiError,
  RelayOpsApprovalError,
  RelayOpsCredentialError,
  RelayOpsToolUnavailableError,
} from "../src/agent/relayops-api.ts";
import { createRelayRecoveryTools } from "../src/agent/relayops-tool-gateway.ts";

function envelope(data, correlationId = "corr-test") {
  return new Response(JSON.stringify({ data, correlationId }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function makeApi({
  responses = [],
  credentials = { read: "test-read", propose: "test-propose", execute: "test-execute" },
  approvalReader,
  requestIdHeaderName,
  baseUrl = "https://relayops.example.test",
  now = () => Date.parse("2026-11-06T18:00:00.000Z"),
} = {}) {
  const calls = [];
  let id = 0;
  const api = new RelayOpsApi({
    baseUrl,
    credentials,
    approvalReader,
    now,
    createId: () => `test-id-${++id}`,
    ...(requestIdHeaderName !== undefined ? { requestIdHeaderName } : {}),
    fetch: async (url, init) => {
      calls.push({ url: new URL(url), init });
      const response = responses.shift();
      if (!response) throw new Error("Unexpected API request");
      return response;
    },
  });
  return { api, calls };
}

const incidentDetail = {
  id: "INC-1042",
  type: "BREAKDOWN",
  vehicleId: "VAN-014",
  reporterId: "USR-DRIVER-014",
  severity: "CRITICAL",
  status: "OPEN",
  summary: "Synthetic incident",
  createdAt: "2026-11-06T17:09:00.000Z",
  resolvedAt: null,
  currentPlanId: null,
  version: 1,
  affectedShipments: [],
  events: [],
};

const approval = {
  id: "APR-1",
  planId: "PLAN-1",
  planHash: "hash-1",
  status: "APPROVED",
  approvedBy: "USR-DISPATCHER-01",
  approvedAt: "2026-11-06T17:45:00.000Z",
  expiresAt: "2026-11-06T19:00:00.000Z",
  consumedAt: null,
  decisionReason: null,
};

test("getIncident uses the documented route and read-only scope", async () => {
  const { api, calls } = makeApi({ responses: [envelope(incidentDetail)] });
  const result = await api.getIncident("INC-1042");

  assert.equal(result.id, "INC-1042");
  assert.equal(calls[0].url.pathname, "/api/v1/incidents/INC-1042");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.get("X-Agent-API-Key"), "test-read");
  assert.equal(calls[0].init.headers.get("Authorization"), null);
  assert.equal(calls[0].init.headers.get("X-Request-ID"), null);
  assert.equal(calls[0].init.headers.get("Idempotency-Key"), null);
});

test("getAffectedShipments uses the E04-confirmed route and validates case identity", async () => {
  const shipments = [{ id: "MED-2048", trackingCode: "TRK-2048" }];
  const { api, calls } = makeApi({ responses: [envelope({ incidentId: "INC-1042", shipments })] });

  assert.deepEqual(await api.getAffectedShipments("INC-1042"), shipments);
  assert.equal(calls[0].url.pathname, "/api/v1/incidents/INC-1042/shipments");
});

test("getAvailableVehicles follows the documented collection route without inventing a case query", async () => {
  const { api, calls } = makeApi({ responses: [envelope([])] });
  await api.getAvailableVehicles("INC-1042");

  assert.equal(calls[0].url.pathname, "/api/v1/vehicles/available");
  assert.equal(calls[0].url.search, "");
});

test("simulateReassignment is a typed read-scope POST and does not claim a mutation key", async () => {
  const input = { incidentId: "INC-1042", shipmentId: "MED-2048", targetDriverId: "DRV-009", targetVehicleId: "VAN-009" };
  const feasibility = { eligible: true, capacityOk: true, conflicts: [] };
  const { api, calls } = makeApi({ responses: [envelope(feasibility)] });

  assert.deepEqual(await api.simulateReassignment(input), feasibility);
  assert.equal(calls[0].url.pathname, "/api/v1/recovery/simulate");
  assert.equal(calls[0].init.headers.get("X-Agent-API-Key"), "test-read");
  assert.equal(calls[0].init.headers.get("Authorization"), null);
  assert.deepEqual(JSON.parse(calls[0].init.body), input);
  assert.equal(calls[0].init.headers.get("Idempotency-Key"), null);
});

test("proposeRecovery uses the separate propose scope and an idempotency key", async () => {
  const proposalInput = {
    incidentId: "INC-1042",
    shipmentId: "MED-2048",
    targetDriverId: "DRV-009",
    targetVehicleId: "VAN-009",
    newEtaAt: "2026-11-06T18:22:00.000Z",
    rationale: "Feasibility response supports this candidate.",
    expectedIncidentVersion: 1,
  };
  const proposal = { id: "PLAN-1", incidentId: "INC-1042", version: 1, hash: "hash-1", status: "PROPOSED", feasibility: { eligible: true, capacityOk: true, conflicts: [] } };
  const { api, calls } = makeApi({
    requestIdHeaderName: "X-Request-ID",
    responses: [envelope(proposal)],
  });

  assert.equal((await api.proposeRecovery(proposalInput)).id, "PLAN-1");
  assert.equal(calls[0].url.pathname, "/api/v1/recovery/plans");
  assert.equal(calls[0].init.headers.get("X-Agent-API-Key"), "test-propose");
  assert.equal(calls[0].init.headers.get("Authorization"), null);
  assert.equal(calls[0].init.headers.get("Idempotency-Key"), "test-id-1");
  assert.equal(calls[0].init.headers.get("X-Request-ID"), "test-id-2");
});

test("writes fail closed until the API request-ID header is explicitly configured", async () => {
  const { api, calls } = makeApi();
  await assert.rejects(
    api.proposeRecovery({
      incidentId: "INC-1042",
      shipmentId: "MED-2048",
      targetDriverId: "DRV-009",
      targetVehicleId: "VAN-009",
      newEtaAt: "2026-11-06T18:22:00.000Z",
      rationale: "test",
      expectedIncidentVersion: 1,
    }),
    RelayOpsToolUnavailableError,
  );
  assert.equal(calls.length, 0);
});

test("getRecoveryStatus reads the documented incident detail instead of guessing a status route", async () => {
  const { api, calls } = makeApi({ responses: [envelope(incidentDetail)] });
  assert.equal((await api.getRecoveryStatus("INC-1042")).version, 1);
  assert.equal(calls[0].url.pathname, "/api/v1/incidents/INC-1042");
});

test("approval lookup and execution fail closed without a business-application reader", async () => {
  const { api, calls } = makeApi();
  await assert.rejects(api.getApproval("PLAN-1"), RelayOpsToolUnavailableError);
  await assert.rejects(
    api.executeApprovedReassignment({ approvalId: "APR-1", planId: "PLAN-1", idempotencyKey: "once-1" }),
    RelayOpsToolUnavailableError,
  );
  assert.equal(calls.length, 0);
});

test("execution requires an unconsumed current business approval before posting", async () => {
  const executeReceipt = { assignmentId: "ASG-1", shipmentId: "MED-2048", caseId: "INC-1042", eventId: "EVT-1", resultingStatus: "REASSIGNED" };
  const { api, calls } = makeApi({
    approvalReader: async (planId) => ({ ...approval, planId }),
    requestIdHeaderName: "X-Request-ID",
    responses: [envelope(executeReceipt)],
  });
  const result = await api.executeApprovedReassignment({ approvalId: "APR-1", planId: "PLAN-1", idempotencyKey: "once-1" });

  assert.equal(result.assignmentId, "ASG-1");
  assert.equal(calls[0].url.pathname, "/api/v1/recovery/execute");
  assert.equal(calls[0].init.headers.get("X-Agent-API-Key"), "test-execute");
  assert.equal(calls[0].init.headers.get("Authorization"), null);
  assert.equal(calls[0].init.headers.get("Idempotency-Key"), "once-1");
});

test("rejected or expired approvals never reach execute", async () => {
  const { api, calls } = makeApi({
    approvalReader: async (planId) => ({ ...approval, planId, status: "EXPIRED" }),
  });
  await assert.rejects(
    api.executeApprovedReassignment({ approvalId: "APR-1", planId: "PLAN-1", idempotencyKey: "once-1" }),
    RelayOpsApprovalError,
  );
  assert.equal(calls.length, 0);
});

test("the gateway exposes only the fixed, typed tool set", async () => {
  const { api } = makeApi();
  const tools = createRelayRecoveryTools(api);
  assert.deepEqual(Object.keys(tools).sort(), [
    "executeApprovedReassignment",
    "getAffectedShipments",
    "getApproval",
    "getAvailableVehicles",
    "getIncident",
    "getRecoveryStatus",
    "proposeRecovery",
    "simulateReassignment",
  ]);
  assert.equal("fetch" in tools, false);
});

test("remote credentials require HTTPS and missing scopes are rejected before network calls", async () => {
  assert.throws(
    () => makeApi({ baseUrl: "http://api.example.test" }),
    RelayOpsApiConfigurationError,
  );
  const { api, calls } = makeApi({ credentials: {} });
  await assert.rejects(api.getIncident("INC-1042"), RelayOpsCredentialError);
  assert.equal(calls.length, 0);
});

test("API errors do not echo response text that could contain credentials", async () => {
  const response = new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "test-read" } }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
  const { api } = makeApi({ responses: [response] });
  await assert.rejects(api.getIncident("INC-1042"), (error) => {
    assert.ok(error instanceof RelayOpsApiError);
    assert.equal(error.status, 401);
    assert.equal(String(error).includes("test-read"), false);
    return true;
  });
});
