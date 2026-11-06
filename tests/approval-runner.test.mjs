import assert from "node:assert/strict";
import test from "node:test";
import { approvePlan } from "../scripts/lib/demo-api.mjs";

test("live approval runner sends the exact plan ID, hash, and version", async () => {
  const envNames = ["RELAYOPS_BASE_URL", "RELAYOPS_DEMO_OPERATOR_TOKEN"];
  const savedEnv = new Map(envNames.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const requests = [];

  process.env.RELAYOPS_BASE_URL = "https://relayops.invalid";
  process.env.RELAYOPS_DEMO_OPERATOR_TOKEN = "test-only-token";
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    requests.push({ url, init });
    if (url.pathname === "/api/v1/demo/session") {
      return new Response(JSON.stringify({
        data: { role: "DISPATCHER", expiresInSeconds: 28800 },
        correlationId: "session-correlation",
      }), {
        status: 201,
        headers: {
          "content-type": "application/json",
          "set-cookie": "relayops_demo_session=test; Path=/; HttpOnly; SameSite=Lax",
        },
      });
    }
    if (url.pathname === "/api/v1/recovery/approvals") {
      return new Response(JSON.stringify({ data: { id: "APR-1" }, correlationId: "approval-correlation" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected integration-runner request: ${url.pathname}`);
  };

  try {
    const plan = { id: "PLAN-7", hash: "plan-hash-7", version: 7 };
    const approval = await approvePlan(plan, "approval-key");
    assert.equal(approval.id, "APR-1");

    const approvalRequest = requests.find(({ url }) => url.pathname === "/api/v1/recovery/approvals");
    assert.ok(approvalRequest);
    assert.deepEqual(JSON.parse(approvalRequest.init.body), {
      planId: plan.id,
      planHash: plan.hash,
      planVersion: plan.version,
      decision: "APPROVE",
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of savedEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
