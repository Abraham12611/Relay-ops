import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";
import { RelayOpsApprovalError } from "../src/agent/relayops-api.ts";
import { createRelayOpsMcpServer } from "../switch/relayops-mcp.mjs";

function readMessage(output) {
  return new Promise((resolve, reject) => {
    let buffered = "";
    const onData = (chunk) => {
      buffered += chunk.toString();
      const newline = buffered.indexOf("\n");
      if (newline < 0) return;
      output.off("data", onData);
      try {
        resolve(JSON.parse(buffered.slice(0, newline)));
      } catch (error) {
        reject(error);
      }
    };
    output.on("data", onData);
  });
}

async function send(input, output, message) {
  const response = readMessage(output);
  input.write(`${JSON.stringify(message)}\n`);
  return response;
}

test("the MCP stdio server registers RelayOps tools and invokes only the fixed gateway", async (t) => {
  const input = new PassThrough();
  const output = new PassThrough();
  const calls = [];
  const testSecret = "local-test-only-secret";
  const toolNames = [
    "getIncident",
    "getAffectedShipments",
    "getAvailableVehicles",
    "simulateReassignment",
    "proposeRecovery",
    "getApproval",
    "executeApprovedReassignment",
    "getRecoveryStatus",
  ];
  const tools = Object.fromEntries(toolNames.map((name) => [name, async (args) => {
    calls.push({ name, args });
    if (name === "getApproval") {
      throw new RelayOpsApprovalError(`The business application has no approved record: ${testSecret}.`);
    }
    return { name, caseId: args.caseId ?? null, echoedValue: name === "getIncident" ? testSecret : null };
  }]));
  const server = createRelayOpsMcpServer({ tools, input, output, secrets: [testSecret] });
  t.after(() => {
    server.close();
    input.end();
    output.end();
  });

  const initialized = await send(input, output, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test-client", version: "1" } },
  });
  assert.equal(initialized.result.protocolVersion, "2025-03-26");
  input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');

  const listed = await send(input, output, { jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.deepEqual(listed.result.tools.map((tool) => tool.name).sort(), [...toolNames].sort());
  const execution = listed.result.tools.find((tool) => tool.name === "executeApprovedReassignment");
  assert.deepEqual(execution.inputSchema.required, ["approvalId", "planId", "idempotencyKey"]);
  assert.equal(execution.inputSchema.additionalProperties, false);

  const called = await send(input, output, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "getIncident", arguments: { caseId: "INC-1042" } },
  });
  assert.equal(called.result.isError, undefined);
  assert.deepEqual(JSON.parse(called.result.content[0].text), {
    name: "getIncident",
    caseId: "INC-1042",
    echoedValue: "[redacted]",
  });
  assert.equal(called.result.content[0].text.includes(testSecret), false);
  assert.deepEqual(calls[0], { name: "getIncident", args: { caseId: "INC-1042" } });

  const invalidType = await send(input, output, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "getIncident", arguments: { caseId: 1042 } },
  });
  assert.equal(invalidType.result.isError, true);
  assert.match(invalidType.result.content[0].text, /caseId must be a string/);
  assert.equal(calls.length, 1);

  const extraProperty = await send(input, output, {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "getIncident", arguments: { caseId: "INC-1042", debug: true } },
  });
  assert.equal(extraProperty.result.isError, true);
  assert.match(extraProperty.result.content[0].text, /Unexpected tool argument: debug/);
  assert.equal(calls.length, 1);

  const missingRequired = await send(input, output, {
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "getIncident", arguments: {} },
  });
  assert.equal(missingRequired.result.isError, true);
  assert.match(missingRequired.result.content[0].text, /Missing required tool argument: caseId/);
  assert.equal(calls.length, 1);

  const invalidInteger = await send(input, output, {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: {
      name: "proposeRecovery",
      arguments: {
        incidentId: "INC-1042",
        shipmentId: "MED-2048",
        targetDriverId: "DRV-009",
        targetVehicleId: "VAN-009",
        newEtaAt: "2026-11-06T18:22:00.000Z",
        rationale: "Test only.",
        expectedIncidentVersion: 0,
      },
    },
  });
  assert.equal(invalidInteger.result.isError, true);
  assert.match(invalidInteger.result.content[0].text, /expectedIncidentVersion must be an integer of at least 1/);
  assert.equal(calls.length, 1);

  const denied = await send(input, output, {
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: { name: "getApproval", arguments: { planId: "PLAN-1" } },
  });
  assert.equal(denied.result.isError, true);
  assert.match(denied.result.content[0].text, /business application/);
  assert.equal(denied.result.content[0].text.includes(testSecret), false);
});

test("MCP notifications receive no JSON-RPC response", async (t) => {
  const input = new PassThrough();
  const output = new PassThrough();
  const server = createRelayOpsMcpServer({ tools: {}, input, output });
  t.after(() => {
    server.close();
    input.end();
    output.end();
  });
  let outputText = "";
  output.on("data", (chunk) => { outputText += chunk.toString(); });
  input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(outputText, "");
});
