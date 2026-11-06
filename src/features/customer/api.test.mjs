import assert from "node:assert/strict";
import test from "node:test";
import { fetchTrackingSnapshot, TrackingApiError } from "./api.ts";

const snapshotData = {
  shipment: {
    id: "MED-2048",
    trackingCode: "TRK-2048",
    priority: "CRITICAL",
    status: "REASSIGNMENT_PENDING",
    promisedAt: "2026-11-06T15:00:00.000Z",
    etaAt: "2026-11-06T16:30:00.000Z",
    updatedAt: "2026-11-06T14:00:00.000Z",
    deliveredAt: null,
    internalDriverNote: "must not reach the view",
  },
  timeline: [
    {
      id: "evt-1",
      kind: "BREAKDOWN",
      visibility: "CUSTOMER",
      title: "Delivery update",
      message: "A delivery issue was reported.",
      createdAt: "2026-11-06T13:30:00.000Z",
      payload: { privateNote: "must not reach the view" },
    },
  ],
  notifications: [
    {
      id: "notice-1",
      kind: "RECOVERY",
      message: "A recovery is being arranged.",
      createdAt: "2026-11-06T13:45:00.000Z",
      internalNote: "must not reach the view",
    },
  ],
};

function successResponse(data = snapshotData, correlationId = "corr-server-1") {
  return new Response(JSON.stringify({ data, correlationId }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(status, code, correlationId = "corr-error-1") {
  return new Response(JSON.stringify({
    error: { code, message: "private server detail must not be surfaced", correlationId },
  }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function optionsFor(response, extras = {}) {
  return {
    fetcher: async () => response,
    requestIdFactory: () => "client-request-1",
    ...extras,
  };
}

test("fetches the encoded tracking route, correlates the request, and copies only public DTO fields", async () => {
  let requestedUrl;
  let requestedHeaders;
  const result = await fetchTrackingSnapshot("TRK-2048", {
    fetcher: async (url, init) => {
      requestedUrl = url;
      requestedHeaders = new Headers(init.headers);
      return successResponse();
    },
    requestIdFactory: () => "client-request-1",
  });

  assert.equal(requestedUrl, "/api/v1/track/TRK-2048");
  assert.equal(requestedHeaders.get("accept"), "application/json");
  assert.equal(requestedHeaders.get("x-request-id"), "client-request-1");
  assert.equal(result.correlationId, "corr-server-1");
  assert.equal(result.requestId, "client-request-1");
  assert.equal(result.snapshot.shipment.trackingCode, "TRK-2048");
  assert.equal(result.snapshot.timeline[0].kind, "BREAKDOWN");
  assert.equal("payload" in result.snapshot.timeline[0], false);
  assert.equal("internalDriverNote" in result.snapshot.shipment, false);
  assert.equal("internalNote" in result.snapshot.notifications[0], false);
});

test("rejects a mismatched tracking code instead of showing another shipment", async () => {
  const wrongCode = {
    ...snapshotData,
    shipment: { ...snapshotData.shipment, trackingCode: "TRK-9999" },
  };
  await assert.rejects(
    fetchTrackingSnapshot("TRK-2048", optionsFor(successResponse(wrongCode))),
    (error) => error instanceof TrackingApiError && error.kind === "invalid-response",
  );
});

test("rejects internal events and does not return their message", async () => {
  const privateTimeline = {
    ...snapshotData,
    timeline: [{
      ...snapshotData.timeline[0],
      visibility: "INTERNAL",
      message: "private staff discussion",
    }],
  };
  await assert.rejects(
    fetchTrackingSnapshot("TRK-2048", optionsFor(successResponse(privateTimeline))),
    (error) => {
      assert.ok(error instanceof TrackingApiError);
      assert.equal(error.kind, "invalid-response");
      assert.equal(error.message, "invalid-response");
      assert.equal(error.correlationId, "corr-server-1");
      return true;
    },
  );
});

test("accepts a valid empty customer timeline without inventing events", async () => {
  const result = await fetchTrackingSnapshot("TRK-2048", optionsFor(successResponse({
    ...snapshotData,
    timeline: [],
    notifications: [],
  })));
  assert.deepEqual(result.snapshot.timeline, []);
  assert.deepEqual(result.snapshot.notifications, []);
});

test("distinguishes a documented tracking 404 from a missing backend route", async () => {
  await assert.rejects(
    fetchTrackingSnapshot("TRK-2048", optionsFor(errorResponse(404, "TRACKING_NOT_FOUND"))),
    (error) => error instanceof TrackingApiError
      && error.kind === "not-found"
      && error.correlationId === "corr-error-1",
  );

  const missingRoute = new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
  await assert.rejects(
    fetchTrackingSnapshot("TRK-2048", optionsFor(missingRoute)),
    (error) => error instanceof TrackingApiError && error.kind === "unavailable",
  );
});

test("correlates backend errors and does not expose raw error messages", async () => {
  await assert.rejects(
    fetchTrackingSnapshot("TRK-2048", optionsFor(errorResponse(503, "TRACKING_UNAVAILABLE"))),
    (error) => {
      assert.ok(error instanceof TrackingApiError);
      assert.equal(error.kind, "unavailable");
      assert.equal(error.correlationId, "corr-error-1");
      assert.equal(error.requestId, "client-request-1");
      assert.equal(error.message, "unavailable");
      return true;
    },
  );
});

test("turns fetch rejection into a correlated network error", async () => {
  await assert.rejects(
    fetchTrackingSnapshot("TRK-2048", {
      fetcher: async () => { throw new TypeError("internal network diagnostic"); },
      requestIdFactory: () => "client-network-ref",
    }),
    (error) => error instanceof TrackingApiError
      && error.kind === "network"
      && error.requestId === "client-network-ref"
      && error.correlationId === "client-network-ref"
      && error.message !== "internal network diagnostic",
  );
});

test("rejects a success payload without a valid response envelope", async () => {
  await assert.rejects(
    fetchTrackingSnapshot("TRK-2048", {
      fetcher: async () => new Response(JSON.stringify({ data: snapshotData }), { status: 200 }),
      requestIdFactory: () => "fallback-ref",
    }),
    (error) => error instanceof TrackingApiError
      && error.kind === "invalid-response"
      && error.correlationId === "fallback-ref",
  );
});
