import assert from "node:assert/strict";
import test from "node:test";
import { SEEDED_AT } from "../src/fixtures/scenario.ts";
import {
  EXPECTED_AFFECTED_SHIPMENT_IDS,
  apiRequest,
  assertSeededBaseline,
  assertStatus,
  responseData,
  resetDemo,
} from "../scripts/lib/demo-api.mjs";

function preIncidentState() {
  return {
    state: "PRE-INCIDENT",
    scenario: {
      seededAt: SEEDED_AT,
      incidents: [],
      incidentShipments: [],
      shipments: [
        ...EXPECTED_AFFECTED_SHIPMENT_IDS.map((id) => ({
          id,
          assignedDriverId: "DRV-014",
          assignedVehicleId: "VAN-014",
          status: "IN_TRANSIT",
          trackingCode: id === "MED-2048" ? "TRK-2048" : `TRK-${id.slice(-4)}`,
          priority: id === "MED-2048" ? "CRITICAL" : "NORMAL",
        })),
        {
          id: "SHP-1010",
          assignedDriverId: "DRV-009",
          assignedVehicleId: "VAN-009",
          status: "IN_TRANSIT",
        },
      ],
      vehicles: [
        { id: "VAN-014", status: "AVAILABLE" },
        { id: "VAN-009", status: "AVAILABLE" },
      ],
      drivers: [{ id: "DRV-009", vehicleId: "VAN-009" }],
    },
  };
}

test("reset assertion accepts PRE-INCIDENT with no incident or incident links", () => {
  const state = preIncidentState();
  assert.equal(assertSeededBaseline(state), state.scenario);
});

test("reset assertion rejects a pre-created incident", () => {
  const state = preIncidentState();
  state.scenario.incidents.push({ id: "INC-1042", status: "OPEN" });
  assert.throws(() => assertSeededBaseline(state), /must not create an incident/);
});

test("success responses must use the data and correlationId envelope", () => {
  assert.deepEqual(
    responseData({ status: 201, payload: { data: { id: "INC-1042" }, correlationId: "req-1" } }, 201),
    { id: "INC-1042" },
  );
  assert.throws(
    () => responseData({ status: 200, payload: { data: {} } }, 200),
    /correlationId/,
  );
});

test("API failures must use the correlated error contract", () => {
  assert.doesNotThrow(() => assertStatus({
    status: 409,
    payload: { error: { code: "STALE_PLAN", message: "Conflict", correlationId: "req-2" } },
  }, 409, "stale plan"));
  assert.throws(() => assertStatus({ status: 403, payload: {} }, 403, "forbidden action"), /documented \{error\} response envelope/);
});

test("request builder uses backend headers and distinct selected driver sessions", async () => {
  const envNames = [
    "RELAYOPS_BASE_URL",
    "RELAYOPS_DEMO_OPERATOR_TOKEN",
    "RELAYOPS_AGENT_READ_TOKEN",
  ];
  const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const requests = [];
  Object.assign(process.env, {
    RELAYOPS_BASE_URL: "http://relayops.test",
    RELAYOPS_DEMO_OPERATOR_TOKEN: "mock-operator-credential-not-real",
    RELAYOPS_AGENT_READ_TOKEN: "mock-agent-read-credential-not-real",
  });
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const request = {
      url,
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    };
    requests.push(request);
    if (url.endsWith("/api/v1/demo/session")) {
      const persona = request.body.driverId ?? (request.body.role === "DRIVER" ? "DRV-014" : request.body.role);
      const sessionData = {
        role: request.body.role,
        ...(request.body.role === "DRIVER" ? { driverId: request.body.driverId ?? "DRV-014" } : {}),
      };
      return new Response(JSON.stringify({ data: sessionData, correlationId: "session-correlation" }), {
        status: 201,
        headers: {
          "content-type": "application/json",
          "set-cookie": `relayops_demo_session=${persona}; Path=/; HttpOnly; SameSite=Lax`,
        },
      });
    }
    if (url.endsWith("/api/v1/demo/reset")) {
      return new Response(JSON.stringify({ data: { state: "PRE-INCIDENT" }, correlationId: "reset-correlation" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/api/v1/demo/state")) {
      return new Response(JSON.stringify({ data: preIncidentState(), correlationId: "state-correlation" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ data: { ok: true }, correlationId: "api-correlation" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await resetDemo();
    await apiRequest("/api/v1/recovery/simulate", { role: "agentRead", method: "POST", body: {}, idempotencyKey: "simulate-key" });
    await apiRequest("/api/v1/assignments/ASN-014/accept", { role: "driver014", method: "POST", body: {}, idempotencyKey: "accept-014" });
    await apiRequest("/api/v1/assignments/ASN-009/accept", { role: "driver009", method: "POST", body: {}, idempotencyKey: "accept-009" });

    const reset = requests.find(({ url }) => url.endsWith("/api/v1/demo/reset"));
    assert.equal(reset.method, "POST");
    assert.equal(reset.headers.get("x-demo-operator-key"), "mock-operator-credential-not-real");
    assert.ok(reset.headers.get("x-request-id"));
    assert.ok(reset.headers.get("idempotency-key"));
    assert.equal(reset.headers.get("authorization"), null);

    const state = requests.find(({ url }) => url.endsWith("/api/v1/demo/state"));
    assert.equal(state.method, "GET");
    assert.equal(state.headers.get("x-demo-operator-key"), "mock-operator-credential-not-real");

    const simulation = requests.find(({ url }) => url.endsWith("/api/v1/recovery/simulate"));
    assert.equal(simulation.headers.get("x-agent-api-key"), "mock-agent-read-credential-not-real");
    assert.equal(simulation.headers.get("authorization"), null);
    assert.equal(simulation.headers.get("idempotency-key"), "simulate-key");

    const sessions = requests.filter(({ url }) => url.endsWith("/api/v1/demo/session"));
    assert.deepEqual(sessions.map(({ body }) => body), [
      { role: "DRIVER" },
      { role: "DRIVER", driverId: "DRV-009" },
    ]);
    const driver014 = requests.find(({ url }) => url.endsWith("/ASN-014/accept"));
    const driver009 = requests.find(({ url }) => url.endsWith("/ASN-009/accept"));
    assert.equal(driver014.headers.get("cookie"), "relayops_demo_session=DRV-014");
    assert.equal(driver009.headers.get("cookie"), "relayops_demo_session=DRV-009");
    assert.ok(driver009.headers.get("idempotency-key"));
    assert.equal(driver009.headers.get("authorization"), null);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
