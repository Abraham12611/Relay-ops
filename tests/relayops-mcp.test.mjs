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
    if (name === "getApproval") throw new RelayOpsApprovalError("The business application has no approved record.");
    return { name, caseId: args.caseId ?? null };
  }]));
  const server = createRelayOpsMcpServer({ tools, input, output });
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
  assert.deepEqual(JSON.parse(called.result.content[0].text), { name: "getIncident", caseId: "INC-1042" });
  assert.deepEqual(calls[0], { name: "getIncident", args: { caseId: "INC-1042" } });

  const denied = await send(input, output, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "getApproval", arguments: { planId: "PLAN-1" } },
  });
  assert.equal(denied.result.isError, true);
  assert.match(denied.result.content[0].text, /business application/);
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
