import type {
  Approval,
  ApiErrorResponse,
  ApiSuccess,
  Event,
  ExecuteRequest,
  Incident,
  RecoveryFeasibility,
  RecoveryProposal,
  RecoveryProposalInput,
  RecoverySimulationInput,
  Shipment,
  Vehicle,
} from "../types/contracts.ts";

export type AgentScope = "agent-read" | "agent-propose" | "agent-execute";

export interface RelayOpsIncidentDetail extends Incident {
  version: number;
  affectedShipments: readonly Shipment[];
  events: readonly Event[];
}

export interface RelayOpsExecutionReceipt {
  assignmentId: string;
  shipmentId: string;
  caseId: string;
  eventId: string;
  resultingStatus: string;
}

export interface RelayOpsCredentials {
  read?: string;
  propose?: string;
  execute?: string;
}

/**
 * A trusted server-side lookup backed by the RelayOps authorization service.
 * The current API contract has no approval-read endpoint, so no default lookup is
 * installed and execution remains disabled until the business app supplies one.
 */
export type ApprovalReader = (planId: string) => Promise<Approval>;

export interface RelayOpsApiOptions {
  baseUrl: string;
  credentials: RelayOpsCredentials;
  fetch?: typeof fetch;
  createId?: () => string;
  now?: () => number;
  /** Must be configured only after E04 confirms the API's request-ID header. */
  requestIdHeaderName?: string;
  approvalReader?: ApprovalReader;
}

export class RelayOpsApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayOpsApiConfigurationError";
  }
}

export class RelayOpsCredentialError extends Error {
  constructor(scope: AgentScope) {
    const name = {
      "agent-read": "AGENT_READ_API_KEY",
      "agent-propose": "AGENT_PROPOSE_API_KEY",
      "agent-execute": "AGENT_EXECUTE_API_KEY",
    }[scope];
    super(`Missing required ${scope} credential (${name}).`);
    this.name = "RelayOpsCredentialError";
  }
}

export class RelayOpsToolUnavailableError extends Error {
  constructor(operation: string, detail: string) {
    super(`${operation} is unavailable: ${detail}`);
    this.name = "RelayOpsToolUnavailableError";
  }
}

export class RelayOpsApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayOpsApprovalError";
  }
}

export class RelayOpsProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayOpsProtocolError";
  }
}

export class RelayOpsApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly correlationId: string | null;

  constructor(status: number, code: string | null, correlationId: string | null) {
    super(`RelayOps API request failed with HTTP ${status}${code ? ` (${code})` : ""}.`);
    this.name = "RelayOpsApiError";
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
  }
}

type HttpMethod = "GET" | "POST";

interface RequestOptions {
  scope: AgentScope;
  method: HttpMethod;
  path: string;
  body?: unknown;
  idempotencyKey?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredId(value: string, label: string): string {
  if (!value.trim()) {
    throw new RelayOpsProtocolError(`${label} must not be empty.`);
  }
  return value;
}

function validateBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RelayOpsApiConfigurationError("RELAYOPS_API_BASE_URL must be an absolute URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new RelayOpsApiConfigurationError("The RelayOps API URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new RelayOpsApiConfigurationError(
      "The RelayOps API URL must be an origin only, with no credentials, path, query, or fragment.",
    );
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (url.protocol === "http:" && !localHosts.has(url.hostname)) {
    throw new RelayOpsApiConfigurationError(
      "Use HTTPS for a non-loopback RelayOps API host; agent credentials must not cross an unencrypted network.",
    );
  }

  return url;
}

/** A scoped REST adapter; all writes go through documented business API routes. */
export class RelayOpsApi {
  private readonly baseUrl: URL;
  private readonly credentials: RelayOpsCredentials;
  private readonly fetchImpl: typeof fetch;
  private readonly createId: () => string;
  private readonly now: () => number;
  private readonly requestIdHeaderName: string | undefined;
  private readonly approvalReader: ApprovalReader | undefined;

  constructor(options: RelayOpsApiOptions) {
    this.baseUrl = validateBaseUrl(options.baseUrl);
    this.credentials = options.credentials;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.createId = options.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = options.now ?? Date.now;
    this.requestIdHeaderName = options.requestIdHeaderName;
    this.approvalReader = options.approvalReader;
  }

  /** GET /api/v1/incidents/:id */
  async getIncident(caseId: string): Promise<RelayOpsIncidentDetail> {
    const id = requiredId(caseId, "caseId");
    const detail = await this.request<RelayOpsIncidentDetail>({
      scope: "agent-read",
      method: "GET",
      path: `/incidents/${encodeURIComponent(id)}`,
    });
    if (detail.id !== id) {
      throw new RelayOpsProtocolError("Incident response did not match the requested case ID.");
    }
    return detail;
  }

  /** GET /api/v1/incidents/:id/shipments (planned and confirmed with E04). */
  async getAffectedShipments(caseId: string): Promise<readonly Shipment[]> {
    const id = requiredId(caseId, "caseId");
    const result = await this.request<{ incidentId: string; shipments: readonly Shipment[] }>({
      scope: "agent-read",
      method: "GET",
      path: `/incidents/${encodeURIComponent(id)}/shipments`,
    });
    if (result.incidentId !== id || !Array.isArray(result.shipments)) {
      throw new RelayOpsProtocolError("Affected-shipment response did not match the requested case ID.");
    }
    return result.shipments;
  }

  /** GET /api/v1/vehicles/available. caseId is context only; the route has no case parameter. */
  async getAvailableVehicles(caseId: string): Promise<readonly Vehicle[]> {
    requiredId(caseId, "caseId");
    const vehicles = await this.request<readonly Vehicle[]>({
      scope: "agent-read",
      method: "GET",
      path: "/vehicles/available",
    });
    if (!Array.isArray(vehicles)) {
      throw new RelayOpsProtocolError("Available-vehicles response must be an array.");
    }
    return vehicles;
  }

  /** POST /api/v1/recovery/simulate; read-only feasibility, no idempotency key. */
  async simulateReassignment(input: RecoverySimulationInput): Promise<RecoveryFeasibility> {
    return this.request<RecoveryFeasibility>({
      scope: "agent-read",
      method: "POST",
      path: "/recovery/simulate",
      body: input,
    });
  }

  /** POST /api/v1/recovery/plans with the separate agent-propose scope. */
  async proposeRecovery(input: RecoveryProposalInput): Promise<RecoveryProposal> {
    return this.request<RecoveryProposal>({
      scope: "agent-propose",
      method: "POST",
      path: "/recovery/plans",
      body: input,
      idempotencyKey: this.createId(),
    });
  }

  /**
   * Approval status must come from the business application's authorization layer.
   * No GET approval route is currently documented, so this fails closed by default.
   */
  async getApproval(planId: string): Promise<Approval> {
    const id = requiredId(planId, "planId");
    if (!this.approvalReader) {
      throw new RelayOpsToolUnavailableError(
        "getApproval",
        "the business API has no documented approval-read contract",
      );
    }

    const approval = await this.approvalReader(id);
    if (approval.planId !== id) {
      throw new RelayOpsProtocolError("Approval response did not match the requested plan ID.");
    }
    return approval;
  }

  /**
   * Reads approval through the trusted application lookup before requesting the
   * server transaction. The execute endpoint must independently recheck the plan
   * hash/version, expiry, single-use state, role, and capacity atomically.
   */
  async executeApprovedReassignment(input: ExecuteRequest): Promise<RelayOpsExecutionReceipt> {
    requiredId(input.planId, "planId");
    requiredId(input.approvalId, "approvalId");
    requiredId(input.idempotencyKey, "idempotencyKey");

    const approval = await this.getApproval(input.planId);
    if (approval.id !== input.approvalId || approval.status !== "APPROVED") {
      throw new RelayOpsApprovalError("The business application has not approved this exact plan.");
    }
    if (approval.consumedAt !== null || Date.parse(approval.expiresAt) <= this.now()) {
      throw new RelayOpsApprovalError("The business application approval is expired or already consumed.");
    }

    return this.request<RelayOpsExecutionReceipt>({
      scope: "agent-execute",
      method: "POST",
      path: "/recovery/execute",
      body: input,
      idempotencyKey: input.idempotencyKey,
    });
  }

  /** Incident detail is the current documented source for status and version. */
  async getRecoveryStatus(caseId: string): Promise<RelayOpsIncidentDetail> {
    return this.getIncident(caseId);
  }

  private async request<T>(options: RequestOptions): Promise<T> {
    const token = this.credentialsFor(options.scope);
    const headers = new Headers({
      Accept: "application/json",
      "X-Agent-API-Key": token,
    });
    const init: RequestInit = { method: options.method, headers };

    if (options.idempotencyKey !== undefined) {
      if (!this.requestIdHeaderName) {
        throw new RelayOpsToolUnavailableError(
          "business API mutation",
          "the API requires a request ID, but E04 has not confirmed its header name",
        );
      }
      try {
        headers.set(this.requestIdHeaderName, requiredId(this.createId(), "requestId"));
      } catch {
        throw new RelayOpsApiConfigurationError("The configured request-ID header name is invalid.");
      }
    }

    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      init.body = JSON.stringify(options.body);
    }
    if (options.idempotencyKey !== undefined) {
      headers.set("Idempotency-Key", requiredId(options.idempotencyKey, "idempotencyKey"));
    }

    const url = new URL(`/api/v1${options.path}`, this.baseUrl);
    const response = await this.fetchImpl(url, init);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new RelayOpsProtocolError("RelayOps API returned a non-JSON response.");
    }

    if (!response.ok) {
      const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
      const code = typeof error?.code === "string" ? error.code : null;
      const correlationId = typeof error?.correlationId === "string" ? error.correlationId : null;
      // Do not propagate server error text: errors may contain sensitive request details.
      throw new RelayOpsApiError(response.status, code, correlationId);
    }

    if (!isRecord(payload) || !("data" in payload) || typeof payload.correlationId !== "string") {
      throw new RelayOpsProtocolError("RelayOps API response must use the { data, correlationId } envelope.");
    }
    return (payload as unknown as ApiSuccess<T>).data;
  }

  private credentialsFor(scope: AgentScope): string {
    const token = {
      "agent-read": this.credentials.read,
      "agent-propose": this.credentials.propose,
      "agent-execute": this.credentials.execute,
    }[scope];
    if (!token || !token.trim()) {
      throw new RelayOpsCredentialError(scope);
    }
    if (/[\r\n]/.test(token)) {
      throw new RelayOpsApiConfigurationError("API credentials must not contain line breaks.");
    }
    return token;
  }
}

/** Read only the values the server process explicitly receives; never logs them. */
export function relayOpsApiOptionsFromEnvironment(
  env: Record<string, string | undefined>,
  extra: Omit<RelayOpsApiOptions, "baseUrl" | "credentials"> = {},
): RelayOpsApiOptions {
  const baseUrl = env.RELAYOPS_API_BASE_URL;
  if (!baseUrl) {
    throw new RelayOpsApiConfigurationError("RELAYOPS_API_BASE_URL is not configured.");
  }
  return {
    ...extra,
    baseUrl,
    credentials: {
      ...(env.AGENT_READ_API_KEY !== undefined ? { read: env.AGENT_READ_API_KEY } : {}),
      ...(env.AGENT_PROPOSE_API_KEY !== undefined ? { propose: env.AGENT_PROPOSE_API_KEY } : {}),
      ...(env.AGENT_EXECUTE_API_KEY !== undefined ? { execute: env.AGENT_EXECUTE_API_KEY } : {}),
    },
    ...(env.RELAYOPS_REQUEST_ID_HEADER
      ? { requestIdHeaderName: env.RELAYOPS_REQUEST_ID_HEADER }
      : {}),
  };
}

// Keep the shared error DTO imported and type-checked without leaking server messages.
export type RelayOpsApiErrorContract = ApiErrorResponse;
