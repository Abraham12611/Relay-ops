import assert from "node:assert/strict";
import test from "node:test";
import { createOpsApi, OpsApiError } from "./ops-api.js";
import { canDecideRecoveryPlan, escapeHtml, filterIncidents, formatDate, getCollection, getExecutionReceipt, getRoute, normalizeCaseResponse, unwrapData } from "./ops.js";

const incidents = [
  { id: "INC-1042", summary: "Critical van breakdown", severity: "CRITICAL", status: "AWAITING_APPROVAL" },
  { id: "INC-1050", summary: "Late delivery", severity: "MEDIUM", status: "OPEN" },
];

test("ops routes cover overview, queue, case, shipment and replay URLs", () => {
  assert.deepEqual(getRoute("/ops"), { name: "overview" });
  assert.deepEqual(getRoute("/ops/exceptions"), { name: "exceptions" });
  assert.deepEqual(getRoute("/ops/exceptions/INC-1042"), { name: "case", id: "INC-1042" });
  assert.deepEqual(getRoute("/ops/shipments/MED-2048"), { name: "shipment", id: "MED-2048" });
  assert.deepEqual(getRoute("/ops/activity"), { name: "activity" });
  assert.deepEqual(getRoute("/ops/exceptions/INC%201042"), { name: "case", id: "INC 1042" });
  assert.deepEqual(getRoute("/ops/unsupported"), { name: "notFound" });
});

test("API envelopes and queue filters are handled without changing source records", () => {
  const envelope = { data: { incidents }, correlationId: "corr-1" };
  assert.equal(unwrapData(envelope), envelope.data);
  assert.deepEqual(getCollection(envelope, ["incidents"]), incidents);
  assert.deepEqual(filterIncidents(incidents, { query: "breakdown", severity: "CRITICAL" }), [incidents[0]]);
  assert.deepEqual(filterIncidents(incidents, { status: "OPEN" }), [incidents[1]]);
  assert.equal(incidents[0].status, "AWAITING_APPROVAL");
});

test("approval controls are limited to the current, feasible, fully identified proposal", () => {
  const incident = { id: "INC-1042", status: "AWAITING_APPROVAL", currentPlanId: "PLAN-2" };
  const plan = { id: "PLAN-2", hash: "sha256:hash", version: 2, status: "PROPOSED", feasibilitySnapshot: { eligible: true, capacityOk: true, conflicts: [] } };
  assert.equal(canDecideRecoveryPlan(incident, plan), true);
  assert.equal(canDecideRecoveryPlan({ ...incident, status: "OPEN" }, plan), false);
  assert.equal(canDecideRecoveryPlan(incident, { ...plan, id: "PLAN-1" }), false);
  assert.equal(canDecideRecoveryPlan(incident, { ...plan, feasibilitySnapshot: { eligible: false } }), false);
  assert.equal(canDecideRecoveryPlan(incident, { ...plan, version: undefined }), false);
  assert.equal(canDecideRecoveryPlan(incident, { ...plan, hash: "" }), false);
});

test("dynamic strings are HTML escaped and dates are explicit UTC", () => {
  assert.equal(escapeHtml(`<script title='x'>&`), "&lt;script title=&#39;x&#39;&gt;&amp;");
  assert.match(formatDate("2026-11-06T17:09:00.000Z"), /UTC$/);
  assert.equal(formatDate("not-a-date"), "Not recorded");
});

test("case detail resolves the current plan from persisted incident records and parses its feasibility snapshot", () => {
  const detail = normalizeCaseResponse({
    data: {
      id: "INC-1042",
      status: "AWAITING_APPROVAL",
      currentPlanId: "PLAN-1042-2",
      plans: [{
        id: "PLAN-1042-2",
        version: 2,
        hash: "sha256:abc123",
        status: "PROPOSED",
        feasibilitySnapshot: JSON.stringify({ eligible: true, capacityOk: true, conflicts: [] }),
        approval: { id: "APR-44", status: "APPROVED", planVersion: 2 },
      }],
    },
  });
  assert.equal(detail.plan.id, "PLAN-1042-2");
  assert.deepEqual(detail.plan.feasibilitySnapshot, { eligible: true, capacityOk: true, conflicts: [] });
  assert.equal(detail.approval.id, "APR-44");
  assert.equal(canDecideRecoveryPlan(detail.incident, detail.plan), true);
});

test("execution receipts come only from the persisted reassignment audit event", () => {
  const receipt = getExecutionReceipt([
    { id: "EVT-OLD", type: "RECOVERY_PLAN_PROPOSED", payload: { assignmentId: "not-an-execution" } },
    {
      id: "EVT-EXECUTED-1",
      type: "REASSIGNMENT_EXECUTED",
      caseId: "INC-1042",
      shipmentId: "MED-2048",
      createdAt: "2026-11-06T18:00:00.000Z",
      payload: JSON.stringify({
        eventId: "EVT-EXECUTED-1",
        planId: "PLAN-1042-2",
        planVersion: 2,
        approvalId: "APR-44",
        assignmentId: "ASN-22",
        shipmentId: "MED-2048",
        resultingStatus: "REASSIGNED",
        newEtaAt: "2026-11-06T20:00:00.000Z",
      }),
    },
  ]);
  assert.equal(receipt.assignmentId, "ASN-22");
  assert.equal(receipt.shipmentId, "MED-2048");
  assert.equal(receipt.eventId, "EVT-EXECUTED-1");
  assert.equal(receipt.status, "REASSIGNED");
  assert.equal(getExecutionReceipt([{ id: "EVT-1", type: "RECOVERY_PLAN_PROPOSED" }]), null);
});

test("affected shipment and persisted approval reads use the business API routes", async () => {
  const calls = [];
  const api = createOpsApi({
    basePath: "/api/v1",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ data: { id: "APR-44", status: "APPROVED" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  await api.getIncidentShipments("INC/1042");
  await api.getApproval("PLAN/1042-2");
  assert.deepEqual(calls.map(({ url }) => url), [
    "/api/v1/incidents/INC%2F1042/shipments",
    "/api/v1/recovery/approvals/PLAN%2F1042-2",
  ]);
  assert.ok(calls.every(({ options }) => options.credentials === "same-origin"));
});

test("dispatcher decision posts the exact plan ID, hash and version with request/idempotency headers", async () => {
  const calls = [];
  const api = createOpsApi({
    basePath: "/api/v1",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ data: { id: "APR-44", status: "PENDING" }, correlationId: "corr-44" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  const response = await api.decideRecoveryPlan({
    planId: "PLAN-1042-2",
    planHash: "sha256:abc123",
    planVersion: 2,
    decision: "APPROVE",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/v1/recovery/approvals");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    planId: "PLAN-1042-2",
    planHash: "sha256:abc123",
    planVersion: 2,
    decision: "APPROVE",
  });
  assert.ok(calls[0].options.headers.get("X-Request-ID"));
  assert.ok(calls[0].options.headers.get("Idempotency-Key"));
  assert.equal(response.data.id, "APR-44");
});

test("approval client rejects missing plan version before sending a request", async () => {
  let called = false;
  const api = createOpsApi({ fetchImpl: async () => { called = true; return new Response("{}", { status: 200 }); } });
  assert.throws(() => api.decideRecoveryPlan({ planId: "PLAN-1", planHash: "hash", planVersion: 0, decision: "APPROVE" }), TypeError);
  assert.equal(called, false);
});

test("API errors preserve status, code and correlation ID for denied or stale decisions", async () => {
  const api = createOpsApi({
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: "STALE_PLAN", message: "Plan changed", correlationId: "corr-stale" } }), { status: 409 }),
  });
  await assert.rejects(api.decideRecoveryPlan({ planId: "PLAN-1", planHash: "hash", planVersion: 1, decision: "REJECT", reason: "Conflicts" }), (error) => {
    assert.ok(error instanceof OpsApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "STALE_PLAN");
    assert.equal(error.correlationId, "corr-stale");
    return true;
  });
});
