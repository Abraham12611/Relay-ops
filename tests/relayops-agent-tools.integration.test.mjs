import assert from "node:assert/strict";
import test from "node:test";
import { RelayOpsApi, RelayOpsApiError } from "../src/agent/relayops-api.ts";

const baseUrl = process.env.RELAYOPS_API_BASE_URL;
const readKey = process.env.AGENT_READ_API_KEY;
const incidentId = process.env.RELAYOPS_TEST_INCIDENT_ID;
const configured = Boolean(baseUrl && readKey);

test("live agent GET authenticates with x-agent-api-key and correlates X-Request-ID", {
  skip: configured ? false : "requires a running RelayOps API and AGENT_READ_API_KEY",
}, async () => {
  const observed = [];
  const fetchAndObserve = async (url, init) => {
    const headers = new Headers(init?.headers);
    const response = await fetch(url, init);
    const payload = await response.clone().json().catch(() => null);
    observed.push({
      path: new URL(url).pathname,
      method: init?.method,
      agentKeyPresent: Boolean(headers.get("x-agent-api-key")),
      bearerPresent: headers.has("authorization"),
      requestId: headers.get("x-request-id"),
      correlationId: payload?.correlationId ?? payload?.error?.correlationId ?? null,
    });
    return response;
  };

  const api = new RelayOpsApi({
    baseUrl,
    credentials: { read: readKey },
    fetch: fetchAndObserve,
  });
  const vehicles = await api.getAvailableVehicles("INC-1042");
  assert.ok(Array.isArray(vehicles));
  assert.equal(observed.length, 1);
  assert.equal(observed[0].path, "/api/v1/vehicles/available");
  assert.equal(observed[0].method, "GET");
  assert.equal(observed[0].agentKeyPresent, true);
  assert.equal(observed[0].bearerPresent, false);
  assert.match(observed[0].requestId, /^[A-Za-z0-9._:-]{1,128}$/);
  assert.equal(observed[0].correlationId, observed[0].requestId);

  const invalidApi = new RelayOpsApi({
    baseUrl,
    credentials: { read: "invalid-integration-test-key" },
    fetch: fetchAndObserve,
  });
  await assert.rejects(invalidApi.getAvailableVehicles("INC-1042"), (error) => (
    error instanceof RelayOpsApiError && error.status === 401
  ));
  assert.equal(observed.length, 2);
  assert.equal(observed[1].agentKeyPresent, true);
  assert.equal(observed[1].bearerPresent, false);
  assert.equal(observed[1].correlationId, observed[1].requestId);
});

test("live agent incident detail GET sends x-agent-api-key and a matching request/correlation ID", {
  skip: configured && incidentId ? false : "requires a running API, AGENT_READ_API_KEY, and RELAYOPS_TEST_INCIDENT_ID",
}, async () => {
  const observed = [];
  const fetchAndObserve = async (url, init) => {
    const headers = new Headers(init?.headers);
    const response = await fetch(url, init);
    const payload = await response.clone().json().catch(() => null);
    observed.push({
      path: new URL(url).pathname,
      method: init?.method,
      agentKeyPresent: Boolean(headers.get("x-agent-api-key")),
      bearerPresent: headers.has("authorization"),
      requestId: headers.get("x-request-id"),
      correlationId: payload?.correlationId ?? payload?.error?.correlationId ?? null,
    });
    return response;
  };

  const api = new RelayOpsApi({
    baseUrl,
    credentials: { read: readKey },
    fetch: fetchAndObserve,
  });
  const incident = await api.getIncident(incidentId);

  assert.equal(incident.id, incidentId);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].path, `/api/v1/incidents/${encodeURIComponent(incidentId)}`);
  assert.equal(observed[0].method, "GET");
  assert.equal(observed[0].agentKeyPresent, true);
  assert.equal(observed[0].bearerPresent, false);
  assert.match(observed[0].requestId, /^[A-Za-z0-9._:-]{1,128}$/);
  assert.equal(observed[0].correlationId, observed[0].requestId);
});
