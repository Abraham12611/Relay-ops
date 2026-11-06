import assert from "node:assert/strict";
import test from "node:test";
import {
  DemoDriverSessionError,
  selectDemoDriverSession,
} from "../demo-session.ts";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sessionEnvelope(driverId = "DRV-009") {
  return {
    data: {
      role: "DRIVER",
      userId: "USR-DRIVER-009",
      driverId,
      expiresInSeconds: 28_800,
    },
    correlationId: "corr-session-1",
  };
}

test("selects a server-allowlisted demo driver through the same-origin session bridge", async () => {
  let call;
  const result = await selectDemoDriverSession("DRV-009", {
    requestId: () => "request-session-1",
    fetcher: async (url, init) => {
      call = { url, init };
      return jsonResponse(201, sessionEnvelope());
    },
  });

  assert.deepEqual(result, { driverId: "DRV-009", correlationId: "corr-session-1" });
  assert.equal(call.url, "/api/demo/session");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.credentials, "same-origin");
  assert.equal(call.init.headers["X-Request-ID"], "request-session-1");
  assert.equal("x-demo-operator-key" in call.init.headers, false);
  assert.deepEqual(JSON.parse(call.init.body), { role: "DRIVER", driverId: "DRV-009" });
  assert.equal("userId" in JSON.parse(call.init.body), false);
});

test("rejects a client-selected driver outside the demo allowlist before sending a request", async () => {
  let calls = 0;
  await assert.rejects(
    selectDemoDriverSession("DRV-999", { fetcher: async () => { calls += 1; return jsonResponse(201, sessionEnvelope()); } }),
    (error) => error instanceof DemoDriverSessionError && error.kind === "invalid-driver",
  );
  assert.equal(calls, 0);
});

test("rejects a session response that does not confirm the selected driver", async () => {
  await assert.rejects(
    selectDemoDriverSession("DRV-009", { fetcher: async () => jsonResponse(201, sessionEnvelope("DRV-014")) }),
    (error) => error instanceof DemoDriverSessionError && error.kind === "invalid-response",
  );
});

test("keeps API and transport errors generic and correlated", async () => {
  await assert.rejects(
    selectDemoDriverSession("DRV-009", {
      fetcher: async () => jsonResponse(503, {
        error: { code: "DEMO_AUTH_NOT_CONFIGURED", message: "private detail", correlationId: "corr-unavailable" },
      }),
    }),
    (error) => error instanceof DemoDriverSessionError
      && error.kind === "api"
      && error.status === 503
      && error.correlationId === "corr-unavailable"
      && !error.message.includes("private detail"),
  );

  await assert.rejects(
    selectDemoDriverSession("DRV-009", { fetcher: async () => { throw new TypeError("private network detail"); } }),
    (error) => error instanceof DemoDriverSessionError
      && error.kind === "network"
      && !error.message.includes("private network detail"),
  );
});
