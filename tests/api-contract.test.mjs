import assert from "node:assert/strict";
import test from "node:test";
import { apiRequest, assertStatus, integrationEnabled, responseData } from "../scripts/lib/demo-api.mjs";
import { runExpiredApprovalProbe, runGoldenPath, runRejectedApprovalProbe } from "../scripts/lib/golden-path.mjs";

const integrationTest = (name, fn) => test(name, { skip: !integrationEnabled() }, fn);

integrationTest("live API contracts cover golden path, rejected approval, and customer projection", async () => {
  const result = await runGoldenPath();
  assert.equal(result.incidentId, "INC-1042");
  assert.ok(result.assignmentId);
  assert.ok(result.steps.length >= 11);

  await runRejectedApprovalProbe();

  const response = await apiRequest("/api/v1/track/TRK-2048", { role: "customer" });
  const tracking = responseData(response, 200, "customer tracking projection");
  assertStatus(response, 200, "customer tracking projection");
  const json = JSON.stringify(tracking);
  assert.equal(/staff\s*notes?|internal\s*notes?/i.test(json), false);
  assert.equal(/agentprompt|approvalId|authorization/i.test(json), false);

  if (process.env.RELAYOPS_RUN_EXPIRY_INTEGRATION_TESTS === "1") {
    await runExpiredApprovalProbe();
  }
});
