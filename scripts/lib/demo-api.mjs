import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SEEDED_AT } from "../../src/fixtures/scenario.ts";

export const ROLE_TOKEN_ENV = Object.freeze({
  demo: "RELAYOPS_DEMO_OPERATOR_TOKEN",
  driver014: "RELAYOPS_DEMO_OPERATOR_TOKEN",
  driver009: "RELAYOPS_DEMO_OPERATOR_TOKEN",
  dispatcher: "RELAYOPS_DEMO_OPERATOR_TOKEN",
  agentRead: "RELAYOPS_AGENT_READ_TOKEN",
  agentPropose: "RELAYOPS_AGENT_PROPOSE_TOKEN",
  agentExecute: "RELAYOPS_AGENT_EXECUTE_TOKEN",
  customer: "RELAYOPS_DEMO_OPERATOR_TOKEN",
});

export const INTEGRATION_ENV = Object.freeze([
  ...new Set(["RELAYOPS_BASE_URL", ...Object.values(ROLE_TOKEN_ENV)]),
]);

const PERSONA_ROLE = Object.freeze({
  driver014: "DRIVER",
  driver009: "DRIVER",
  dispatcher: "DISPATCHER",
  customer: "CUSTOMER",
});
const personaCookies = new Map();

export function integrationEnabled() {
  return process.env.RELAYOPS_RUN_INTEGRATION_TESTS === "1" && Boolean(process.env.RELAYOPS_BASE_URL);
}

export function requireIntegrationEnvironment(names = INTEGRATION_ENV) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Integration setup incomplete; missing environment variable names: ${missing.join(", ")}`);
  }
}

function endpoint(path) {
  const base = process.env.RELAYOPS_BASE_URL;
  if (!base) throw new Error("Set RELAYOPS_BASE_URL to the application origin.");
  return new URL(path.replace(/^\/+/, ""), `${base.replace(/\/+$/, "")}/`);
}

async function personaCookie(role) {
  const apiRole = PERSONA_ROLE[role];
  if (!apiRole) throw new Error(`Unknown API test role: ${role}`);
  const cacheKey = `${process.env.RELAYOPS_BASE_URL}:${apiRole}`;
  const cached = personaCookies.get(cacheKey);
  if (cached) return cached;

  const operatorToken = process.env[ROLE_TOKEN_ENV.demo];
  if (!operatorToken) {
    throw new Error(`Set ${ROLE_TOKEN_ENV.demo} for the integration test; token values are never printed.`);
  }
  const response = await fetch(endpoint("/api/v1/demo/session"), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-demo-operator-key": operatorToken,
      "x-request-id": randomUUID(),
    },
    body: JSON.stringify({ role: apiRole }),
    signal: AbortSignal.timeout(15_000),
  });
  const setCookie = response.headers.get("set-cookie");
  const cookie = setCookie?.split(";", 1)[0];
  if (response.status !== 201 || !cookie || !/;\s*HttpOnly(?:;|$)/i.test(setCookie)) {
    throw new Error(`Could not establish the ${apiRole} demo session; expected HTTP 201 and an HTTP-only cookie, received HTTP ${response.status}.`);
  }
  personaCookies.set(cacheKey, cookie);
  return cookie;
}

export async function apiRequest(path, { role, method = "GET", body, idempotencyKey } = {}) {
  const headers = {
    accept: "application/json",
    "x-request-id": randomUUID(),
  };
  if (role) {
    const envName = ROLE_TOKEN_ENV[role];
    if (!envName) throw new Error(`Unknown API test role: ${role}`);
    const token = process.env[envName];
    if (!token) throw new Error(`Set ${envName} for the integration test; token values are never printed.`);
    if (role === "demo") {
      headers["x-demo-operator-key"] = token;
    } else if (role.startsWith("agent")) {
      headers["x-agent-api-key"] = token;
    } else {
      headers.cookie = await personaCookie(role);
    }
  }
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") headers["idempotency-key"] = idempotencyKey ?? randomUUID();

  const response = await fetch(endpoint(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Expected a JSON response from ${method} ${path}; received HTTP ${response.status}.`);
  }
  return { status: response.status, ok: response.ok, payload };
}

export function assertStatus(response, expected, label) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  assert.ok(
    allowed.includes(response.status),
    `${label}: expected HTTP ${allowed.join(" or ")}, received ${response.status}.`,
  );
}

export function responseData(response, expected = [200, 201], label = "API request") {
  assertStatus(response, expected, label);
  assert.ok(response.payload && typeof response.payload === "object", `${label}: expected a JSON object.`);
  assert.ok(Object.hasOwn(response.payload, "data"), `${label}: expected the documented {data, correlationId} envelope.`);
  return response.payload.data;
}

export function record(data, key) {
  return data?.[key] ?? data;
}

export function assertSeededBaseline(data) {
  const scenario = data?.scenario ?? data?.fixture ?? data;
  assert.equal(data?.state, "PRE-INCIDENT", "reset must restore the pre-incident state");
  assert.equal(scenario.seededAt, SEEDED_AT, "reset must restore the fixed UTC seed time");
  assert.deepEqual(scenario.incidents, [], "reset must not create an incident before a driver report");
  assert.deepEqual(scenario.incidentShipments, [], "reset must not create incident-shipment links");
  const assignedShipments = scenario.shipments.filter(({ assignedVehicleId }) => assignedVehicleId === "VAN-014");
  assert.equal(assignedShipments.length, 6, "reset must assign six shipments to VAN-014");
  assert.ok(assignedShipments.every(({ status }) => status === "IN_TRANSIT"), "reset must leave assigned shipments in transit");
  assert.equal(scenario.vehicles?.find(({ id }) => id === "VAN-014")?.status, "AVAILABLE");
  assert.equal(scenario.shipments?.find(({ id }) => id === "MED-2048")?.trackingCode, "TRK-2048");
  assert.equal(scenario.shipments?.find(({ id }) => id === "MED-2048")?.priority, "CRITICAL");
  assert.equal(scenario.vehicles?.find(({ id }) => id === "VAN-009")?.status, "AVAILABLE");
  assert.equal(scenario.drivers?.find(({ id }) => id === "DRV-009")?.vehicleId, "VAN-009");
  return scenario;
}

export async function resetDemo() {
  requireIntegrationEnvironment(["RELAYOPS_BASE_URL", ROLE_TOKEN_ENV.demo]);
  const reset = await apiRequest("/api/v1/demo/reset", { role: "demo", method: "POST" });
  responseData(reset, [200, 201], "demo reset");
  const state = await apiRequest("/api/v1/demo/state", { role: "demo" });
  return assertSeededBaseline(responseData(state, 200, "demo state"));
}

export async function readIncident(incidentId) {
  const response = await apiRequest(`/api/v1/incidents/${encodeURIComponent(incidentId)}`, { role: "dispatcher" });
  return record(responseData(response, 200, `read incident ${incidentId}`), "incident");
}

export async function readIncidentEvents(incidentId) {
  const incident = await readIncident(incidentId);
  return incident.events ?? [];
}

export async function reportBreakdown(idempotencyKey) {
  const response = await apiRequest("/api/v1/incidents", {
    role: "driver014",
    method: "POST",
    idempotencyKey,
    body: { vehicleId: "VAN-014", summary: "Engine failure reported by the assigned driver." },
  });
  return record(responseData(response, [200, 201], "driver breakdown report"), "incident");
}

export async function simulate(input) {
  const response = await apiRequest("/api/v1/recovery/simulate", {
    role: "agentRead",
    method: "POST",
    body: input,
  });
  return responseData(response, 200, "recovery simulation");
}

export async function proposeRecovery(incidentId, idempotencyKey) {
  const incident = await readIncident(incidentId);
  const response = await apiRequest("/api/v1/recovery/plans", {
    role: "agentPropose",
    method: "POST",
    idempotencyKey,
    body: {
      incidentId,
      shipmentId: "MED-2048",
      targetDriverId: "DRV-009",
      targetVehicleId: "VAN-009",
      newEtaAt: "2026-11-06T19:00:00.000Z",
      rationale: "Deterministic demo proposal; backup capacity checked by the business API.",
      expectedIncidentVersion: incident.version ?? 1,
    },
  });
  return record(responseData(response, [200, 201], "recovery plan proposal"), "plan");
}

export async function approvePlan(plan, idempotencyKey, decision = "APPROVE", reason) {
  const response = await apiRequest("/api/v1/recovery/approvals", {
    role: "dispatcher",
    method: "POST",
    idempotencyKey,
    body: {
      planId: plan.id,
      planHash: plan.hash,
      planVersion: plan.version,
      decision,
      ...(reason === undefined ? {} : { reason }),
    },
  });
  return record(responseData(response, [200, 201], `dispatcher ${decision.toLowerCase()} plan`), "approval");
}

export async function executePlan(approval, plan, idempotencyKey) {
  return apiRequest("/api/v1/recovery/execute", {
    role: "agentExecute",
    method: "POST",
    idempotencyKey,
    body: { approvalId: approval.id, planId: plan.id, idempotencyKey },
  });
}
