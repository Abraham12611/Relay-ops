import assert from "node:assert/strict";
import test from "node:test";
import {
  BrowserIdempotencyKeyStore,
  classifyDriverApiError,
  createDriverApi,
  DriverApiError,
} from "../api.ts";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const envelope = (data, correlationId = "corr-123") => ({ data, correlationId });

const assignment = {
  id: "ASN-1",
  shipmentId: "MED-2048",
  driverId: "DRV-009",
  vehicleId: "VAN-009",
  incidentId: "INC-1042",
  status: "ACCEPTED",
};

test("shipment detail adapts the direct ShipmentDto contract and driver-scoped assignment data", async () => {
  const calls = [];
  const shipment = {
    id: "MED / #2048",
    trackingCode: "TRK-2048",
    customerId: "CUS-01",
    assignedDriverId: "DRV-009",
    assignedVehicleId: "VAN-009",
    priority: "CRITICAL",
    promisedAt: "2026-11-06T15:00:00.000Z",
    etaAt: "2026-11-06T16:30:00.000Z",
    status: "REASSIGNED",
    units: 1,
    proofOfDeliveryRef: null,
  };
  let jobsReads = 0;
  const api = createDriverApi({
    baseUrl: "/api/v1/",
    requestId: () => "request-get",
    fetcher: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/driver/jobs")) {
        jobsReads += 1;
        return jsonResponse(200, envelope(jobsReads === 1 ? [] : [{ assignment, shipment }]));
      }
      return jsonResponse(200, envelope(shipment));
    },
  });

  assert.deepEqual((await api.getJobs()).data, []);
  const detail = await api.getShipment("MED / #2048");
  assert.equal(detail.data.shipment.id, "MED / #2048");
  assert.equal(detail.data.shipment.trackingCode, "TRK-2048");
  assert.equal(detail.data.assignment.id, "ASN-1");
  assert.deepEqual(calls.map(({ url }) => url), [
    "/api/v1/driver/jobs",
    "/api/v1/shipments/MED%20%2F%20%232048",
    "/api/v1/driver/jobs",
  ]);
  for (const call of calls) {
    assert.equal(call.init.headers["X-Request-ID"], "request-get");
    assert.equal(call.init.credentials, "same-origin");
    assert.equal(call.init.body, undefined);
  }
});

test("incident, accept, pickup, and delivery mutations carry request/idempotency headers and documented bodies", async () => {
  const calls = [];
  let id = 0;
  const api = createDriverApi({
    requestId: () => `request-${++id}`,
    idempotencyKeys: new BrowserIdempotencyKeyStore(),
    fetcher: async (url, init) => {
      calls.push({ url, init });
      const data = url.endsWith("/incidents")
        ? { id: "INC-1042", type: "BREAKDOWN", vehicleId: "VAN-014", reporterId: "DRV-014", severity: "HIGH", status: "OPEN", summary: "Engine failure", createdAt: "2026-01-01T10:00:00Z" }
        : { ...assignment, status: url.endsWith("/accept") ? "ACCEPTED" : url.endsWith("/pickup") ? "PICKED_UP" : "COMPLETED" };
      return jsonResponse(201, envelope(data));
    },
  });

  await api.createIncident({ type: "BREAKDOWN", vehicleId: "VAN-014", summary: "Engine failure" });
  await api.acceptAssignment("ASN-1");
  await api.confirmPickup("ASN-1");
  await api.deliver("ASN-1", { proofOfDeliveryRef: "POD-7781" });

  assert.deepEqual(calls.map(({ url }) => url), [
    "/api/v1/incidents",
    "/api/v1/assignments/ASN-1/accept",
    "/api/v1/assignments/ASN-1/pickup",
    "/api/v1/assignments/ASN-1/deliver",
  ]);
  assert.deepEqual(JSON.parse(calls[0].init.body), { type: "BREAKDOWN", vehicleId: "VAN-014", summary: "Engine failure" });
  assert.deepEqual(JSON.parse(calls[1].init.body), {});
  assert.deepEqual(JSON.parse(calls[2].init.body), {});
  assert.deepEqual(JSON.parse(calls[3].init.body), { proofOfDeliveryRef: "POD-7781" });
  for (const [index, call] of calls.entries()) {
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.headers["X-Request-ID"], `request-${index + 1}`);
    assert.ok(call.init.headers["Idempotency-Key"]);
    assert.equal(call.init.headers["Content-Type"], "application/json");
  }
});

test("a transport-unknown retry of the same mutation preserves the idempotency key", async () => {
  const calls = [];
  let attempt = 0;
  const api = createDriverApi({
    requestId: (() => { let value = 0; return () => `attempt-${++value}`; })(),
    idempotencyKeys: new BrowserIdempotencyKeyStore(),
    fetcher: async (url, init) => {
      calls.push({ url, init });
      attempt += 1;
      if (attempt === 1) throw new TypeError("connection reset");
      return jsonResponse(200, envelope(assignment));
    },
  });

  await assert.rejects(api.acceptAssignment("ASN-1"), (error) => {
    assert.ok(error instanceof DriverApiError);
    assert.equal(error.network, true);
    assert.equal(classifyDriverApiError(error), "network");
    return true;
  });
  await api.acceptAssignment("ASN-1");

  assert.equal(calls[0].init.headers["Idempotency-Key"], calls[1].init.headers["Idempotency-Key"]);
  assert.notEqual(calls[0].init.headers["X-Request-ID"], calls[1].init.headers["X-Request-ID"]);
});

test("an unreadable mutation response preserves its key as an unknown outcome", async () => {
  const calls = [];
  let attempt = 0;
  const api = createDriverApi({
    idempotencyKeys: new BrowserIdempotencyKeyStore(),
    fetcher: async (url, init) => {
      calls.push({ url, init });
      attempt += 1;
      return attempt === 1
        ? new Response("partial response", { status: 201 })
        : jsonResponse(201, envelope(assignment));
    },
  });

  await assert.rejects(api.acceptAssignment("ASN-1"), (error) => {
    assert.ok(error instanceof DriverApiError);
    assert.equal(error.network, true);
    assert.equal(error.code, "UNKNOWN_OUTCOME");
    return true;
  });
  await api.acceptAssignment("ASN-1");
  assert.equal(calls[0].init.headers["Idempotency-Key"], calls[1].init.headers["Idempotency-Key"]);
});

test("error envelopes retain API code/correlation and classify permission denial", async () => {
  const api = createDriverApi({
    fetcher: async () => jsonResponse(403, {
      error: { code: "DRIVER_NOT_ASSIGNED", message: "This assignment belongs to another driver.", correlationId: "corr-denied" },
    }),
  });

  await assert.rejects(api.getJobs(), (error) => {
    assert.ok(error instanceof DriverApiError);
    assert.equal(error.status, 403);
    assert.equal(error.code, "DRIVER_NOT_ASSIGNED");
    assert.equal(error.correlationId, "corr-denied");
    assert.equal(classifyDriverApiError(error), "permission");
    return true;
  });
});
