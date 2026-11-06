import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import {
  RelayOpsApi,
  RelayOpsApiConfigurationError,
  RelayOpsApiError,
  RelayOpsApprovalError,
  RelayOpsCredentialError,
  RelayOpsProtocolError,
  RelayOpsToolUnavailableError,
  relayOpsApiOptionsFromEnvironment,
} from "../src/agent/relayops-api.ts";
import { createRelayRecoveryTools } from "../src/agent/relayops-tool-gateway.ts";

const MCP_VERSION = "2025-06-18";
const SUPPORTED_MCP_VERSIONS = new Set(["2024-11-05", "2025-03-26", MCP_VERSION]);

const toolDefinitions = [
  {
    name: "getIncident",
    description: "Read the persisted incident and its current version, affected shipments, and events.",
    inputSchema: objectSchema({ caseId: { type: "string", minLength: 1 } }, ["caseId"]),
  },
  {
    name: "getAffectedShipments",
    description: "Read the persisted shipment records linked to an incident.",
    inputSchema: objectSchema({ caseId: { type: "string", minLength: 1 } }, ["caseId"]),
  },
  {
    name: "getAvailableVehicles",
    description: "Read vehicles currently available to RelayOps; caseId is context only.",
    inputSchema: objectSchema({ caseId: { type: "string", minLength: 1 } }, ["caseId"]),
  },
  {
    name: "simulateReassignment",
    description: "Run read-only recovery feasibility checks; this does not create or execute a plan.",
    inputSchema: objectSchema({
      incidentId: { type: "string", minLength: 1 },
      shipmentId: { type: "string", minLength: 1 },
      targetDriverId: { type: "string", minLength: 1 },
      targetVehicleId: { type: "string", minLength: 1 },
    }, ["incidentId", "shipmentId", "targetDriverId", "targetVehicleId"]),
  },
  {
    name: "proposeRecovery",
    description: "Persist a version-checked recovery proposal. It does not approve or execute that proposal.",
    inputSchema: objectSchema({
      incidentId: { type: "string", minLength: 1 },
      shipmentId: { type: "string", minLength: 1 },
      targetDriverId: { type: "string", minLength: 1 },
      targetVehicleId: { type: "string", minLength: 1 },
      newEtaAt: { type: "string", minLength: 1 },
      rationale: { type: "string", minLength: 1 },
      expectedIncidentVersion: { type: "integer", minimum: 1 },
    }, ["incidentId", "shipmentId", "targetDriverId", "targetVehicleId", "newEtaAt", "rationale", "expectedIncidentVersion"]),
  },
  {
    name: "getApproval",
    description: "Read persisted dispatcher approval for a plan from the RelayOps authorization API; room text is not approval.",
    inputSchema: objectSchema({ planId: { type: "string", minLength: 1 } }, ["planId"]),
  },
  {
    name: "executeApprovedReassignment",
    description: "Request execution by approvalId, planId, and idempotencyKey. RelayOps rechecks dispatcher approval and all plan constraints transactionally.",
    inputSchema: objectSchema({
      approvalId: { type: "string", minLength: 1 },
      planId: { type: "string", minLength: 1 },
      idempotencyKey: { type: "string", minLength: 1 },
    }, ["approvalId", "planId", "idempotencyKey"]),
  },
  {
    name: "getRecoveryStatus",
    description: "Read current persisted incident and recovery status.",
    inputSchema: objectSchema({ caseId: { type: "string", minLength: 1 } }, ["caseId"]),
  },
];

function objectSchema(properties, required) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactSecrets(value, secrets) {
  const redactText = (text) => secrets.reduce((safe, secret) => safe.split(secret).join("[redacted]"), text);
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((entry) => redactSecrets(entry, secrets));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      redactText(key),
      redactSecrets(entry, secrets),
    ]));
  }
  return value;
}

function validateToolArguments(definition, args) {
  const schema = definition.inputSchema;
  const properties = schema.properties;
  for (const name of schema.required) {
    if (!Object.hasOwn(args, name)) return `Missing required tool argument: ${name}.`;
  }
  for (const [name, value] of Object.entries(args)) {
    const property = properties[name];
    if (!property) {
      if (schema.additionalProperties === false) return `Unexpected tool argument: ${name}.`;
      continue;
    }
    if (property.type === "string") {
      if (typeof value !== "string" || value.length < (property.minLength ?? 0)) {
        return `Tool argument ${name} must be a string with at least ${property.minLength ?? 0} characters.`;
      }
    } else if (property.type === "integer") {
      if (!Number.isSafeInteger(value) || (property.minimum !== undefined && value < property.minimum)) {
        return `Tool argument ${name} must be an integer${property.minimum === undefined ? "" : ` of at least ${property.minimum}`}.`;
      }
    } else {
      return `Tool argument ${name} uses an unsupported input schema type.`;
    }
  }
  return null;
}

function safeToolError(error) {
  if (
    error instanceof RelayOpsApiError ||
    error instanceof RelayOpsApiConfigurationError ||
    error instanceof RelayOpsApprovalError ||
    error instanceof RelayOpsCredentialError ||
    error instanceof RelayOpsProtocolError ||
    error instanceof RelayOpsToolUnavailableError
  ) {
    return error.message;
  }
  return "RelayOps tool call failed; check the configured API and server logs.";
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function mcpToolError(id, message) {
  return {
    jsonrpc: "2.0",
    id,
    result: { content: [{ type: "text", text: message }], isError: true },
  };
}

/** Run a minimal MCP stdio server that adapts the fixed RelayOps tool gateway. */
export function createRelayOpsMcpServer({ tools, input = process.stdin, output = process.stdout, secrets = [] }) {
  const lines = createInterface({ input, crlfDelay: Infinity });
  const safeSecrets = secrets.filter((secret) => typeof secret === "string" && secret.length > 0);
  let initialized = false;
  let work = Promise.resolve();

  const send = (message) => output.write(`${JSON.stringify(redactSecrets(message, safeSecrets))}\n`);

  async function handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send(rpcError(null, -32700, "Parse error"));
      return;
    }
    if (!isRecord(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      send(rpcError(isRecord(message) && Object.hasOwn(message, "id") ? message.id : null, -32600, "Invalid Request"));
      return;
    }

    const hasId = Object.hasOwn(message, "id");
    const id = hasId ? message.id : null;
    if (message.method === "notifications/initialized") {
      initialized = true;
      return;
    }
    if (!hasId) return;

    if (message.method === "initialize") {
      const requested = isRecord(message.params) ? message.params.protocolVersion : undefined;
      const protocolVersion = typeof requested === "string" && SUPPORTED_MCP_VERSIONS.has(requested)
        ? requested
        : MCP_VERSION;
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "relayops", version: "1.0.0" },
        },
      });
      return;
    }
    if (message.method === "ping") {
      send({ jsonrpc: "2.0", id, result: {} });
      return;
    }
    if (!initialized) {
      send(rpcError(id, -32002, "Server not initialized"));
      return;
    }
    if (message.method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools: toolDefinitions } });
      return;
    }
    if (message.method === "tools/call") {
      const params = message.params;
      if (!isRecord(params) || typeof params.name !== "string" || (params.arguments !== undefined && !isRecord(params.arguments))) {
        send(rpcError(id, -32602, "Invalid tool call parameters"));
        return;
      }
      const definition = toolDefinitions.find((candidate) => candidate.name === params.name);
      const tool = tools[params.name];
      if (typeof tool !== "function" || !definition) {
        send(mcpToolError(id, `Unknown RelayOps tool: ${params.name}`));
        return;
      }
      const args = params.arguments ?? {};
      const validationError = validateToolArguments(definition, args);
      if (validationError) {
        send(mcpToolError(id, validationError));
        return;
      }
      try {
        const result = await tool(args);
        send({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(redactSecrets(result, safeSecrets)) }] },
        });
      } catch (error) {
        send(mcpToolError(id, safeToolError(error)));
      }
      return;
    }
    send(rpcError(id, -32601, "Method not found"));
  }

  lines.on("line", (line) => {
    work = work.then(() => handleLine(line)).catch(() => {
      send(rpcError(null, -32603, "Internal error"));
    });
  });

  return { close: () => lines.close() };
}

function isInvokedDirectly() {
  return Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;
}

if (isInvokedDirectly()) {
  try {
    const api = new RelayOpsApi(relayOpsApiOptionsFromEnvironment(process.env));
    const secrets = [
      process.env.AGENT_READ_API_KEY,
      process.env.AGENT_PROPOSE_API_KEY,
      process.env.AGENT_EXECUTE_API_KEY,
    ];
    createRelayOpsMcpServer({ tools: createRelayRecoveryTools(api), secrets });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "RelayOps MCP server could not start."}\n`);
    process.exitCode = 1;
  }
}
