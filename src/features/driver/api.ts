/**
 * Driver feature's explicit HTTP boundary. These DTOs describe the response
 * shapes this UI expects; they intentionally do not expand the frozen shared
 * contract in src/types/contracts.ts.
 */
export type DriverAssignmentStatus = "PENDING" | "ACCEPTED" | "PICKED_UP" | "COMPLETED" | "DECLINED";
export type DriverShipmentStatus =
  | "IN_TRANSIT"
  | "AT_RISK"
  | "REASSIGNMENT_PENDING"
  | "REASSIGNED"
  | "PICKED_UP_BY_BACKUP"
  | "DELIVERED"
  | "EXCEPTION"
  | "DELIVERY_FAILED";
export type DriverPriority = "NORMAL" | "CRITICAL";

export interface DriverAssignmentDto {
  id: string;
  shipmentId: string;
  driverId: string;
  vehicleId: string;
  incidentId: string | null;
  status: DriverAssignmentStatus;
}

export interface DriverShipmentDto {
  id: string;
  trackingCode: string;
  assignedDriverId: string;
  assignedVehicleId: string;
  priority: DriverPriority;
  promisedAt: string;
  etaAt: string;
  status: DriverShipmentStatus;
  proofOfDeliveryRef: string | null;
}

export interface DriverJobDto {
  assignment: DriverAssignmentDto;
  shipment: DriverShipmentDto;
}

export interface ShipmentDetailDto {
  shipment: DriverShipmentDto;
  assignment: DriverAssignmentDto | null;
}

export interface CreateIncidentInput {
  type: "BREAKDOWN";
  vehicleId: string;
  summary: string;
}

export interface DriverIncidentDto {
  id: string;
  type: "BREAKDOWN";
  vehicleId: string;
  reporterId: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: string;
  summary: string;
  createdAt: string;
}

export interface DeliverAssignmentInput {
  proofOfDeliveryRef: string;
}

export interface ApiEnvelope<T> {
  data: T;
  correlationId: string;
}

export interface DriverApiOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  requestId?: () => string;
  idempotencyKeys?: IdempotencyKeyStore;
}

export interface IdempotencyKeyStore {
  getOrCreate(operation: string, fingerprint: string): string;
  clear(operation: string, fingerprint: string): void;
}

interface SavedKey {
  fingerprint: string;
  key: string;
}

/** Stores unknown-outcome mutation keys across reloads in the current tab. */
export class BrowserIdempotencyKeyStore implements IdempotencyKeyStore {
  private readonly memory = new Map<string, SavedKey>();
  private readonly prefix = "relayops.driver.pending.";

  getOrCreate(operation: string, fingerprint: string): string {
    const storageKey = this.prefix + operation;
    const saved = this.read(storageKey) ?? this.memory.get(storageKey);
    if (saved?.fingerprint === fingerprint) return saved.key;

    const next = { fingerprint, key: createRequestId() };
    this.memory.set(storageKey, next);
    this.write(storageKey, next);
    return next.key;
  }

  clear(operation: string, fingerprint: string): void {
    const storageKey = this.prefix + operation;
    const saved = this.read(storageKey) ?? this.memory.get(storageKey);
    if (saved?.fingerprint !== fingerprint) return;
    this.memory.delete(storageKey);
    try {
      globalThis.sessionStorage?.removeItem(storageKey);
    } catch {
      // Storage may be unavailable (for example, browser privacy mode).
    }
  }

  private read(storageKey: string): SavedKey | undefined {
    try {
      const serialized = globalThis.sessionStorage?.getItem(storageKey);
      if (serialized === null || serialized === undefined) return undefined;
      const parsed: unknown = JSON.parse(serialized);
      if (
        typeof parsed === "object" && parsed !== null &&
        "fingerprint" in parsed && typeof parsed.fingerprint === "string" &&
        "key" in parsed && typeof parsed.key === "string"
      ) return { fingerprint: parsed.fingerprint, key: parsed.key };
    } catch {
      // Fall back to this instance's in-memory key when storage is unavailable.
    }
    return undefined;
  }

  private write(storageKey: string, value: SavedKey): void {
    try {
      globalThis.sessionStorage?.setItem(storageKey, JSON.stringify(value));
    } catch {
      // The in-memory copy still keeps retries stable until this page is left.
    }
  }
}

export class DriverApiError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly correlationId: string | null;
  readonly network: boolean;

  constructor(options: {
    message: string;
    status: number | null;
    code: string;
    correlationId: string | null;
    network?: boolean;
  }) {
    super(options.message);
    this.name = "DriverApiError";
    this.status = options.status;
    this.code = options.code;
    this.correlationId = options.correlationId;
    this.network = options.network ?? false;
  }
}

export type DriverApiErrorKind = "permission" | "duplicate" | "network" | "api";

export function classifyDriverApiError(error: unknown): DriverApiErrorKind {
  if (!(error instanceof DriverApiError)) return "api";
  if (error.network || error.status === null) return "network";
  if (error.status === 401 || error.status === 403) return "permission";
  if (error.status === 409) return "duplicate";
  return "api";
}

export interface DriverApi {
  getJobs(): Promise<ApiEnvelope<DriverJobDto[]>>;
  /** Combines the canonical ShipmentDto response with the active driver's scoped assignment. */
  getShipment(shipmentId: string): Promise<ApiEnvelope<ShipmentDetailDto>>;
  createIncident(input: CreateIncidentInput): Promise<ApiEnvelope<DriverIncidentDto>>;
  acceptAssignment(assignmentId: string): Promise<ApiEnvelope<DriverAssignmentDto>>;
  confirmPickup(assignmentId: string): Promise<ApiEnvelope<DriverAssignmentDto>>;
  deliver(assignmentId: string, input: DeliverAssignmentInput): Promise<ApiEnvelope<DriverAssignmentDto>>;
}

export function createDriverApi(options: DriverApiOptions = {}): DriverApi {
  const baseUrl = (options.baseUrl ?? "/api/v1").replace(/\/$/, "");
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const requestId = options.requestId ?? createRequestId;
  const idempotencyKeys = options.idempotencyKeys ?? new BrowserIdempotencyKeyStore();

  async function get<T>(path: string): Promise<ApiEnvelope<T>> {
    return request<T>(path, { method: "GET", headers: { "X-Request-ID": requestId() } });
  }

  async function mutate<T>(
    operation: string,
    path: string,
    body: unknown,
  ): Promise<ApiEnvelope<T>> {
    const fingerprint = JSON.stringify(body);
    const key = idempotencyKeys.getOrCreate(operation, fingerprint);
    try {
      const result = await request<T>(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": requestId(),
          "Idempotency-Key": key,
        },
        body: JSON.stringify(body),
      });
      idempotencyKeys.clear(operation, fingerprint);
      return result;
    } catch (error) {
      // A valid API envelope is a known outcome. Transport or unreadable replies
      // are unknown, so preserve the key for the next identical retry.
      if (!(error instanceof DriverApiError) || !error.network) {
        idempotencyKeys.clear(operation, fingerprint);
      }
      throw error;
    }
  }

  async function request<T>(path: string, init: RequestInit): Promise<ApiEnvelope<T>> {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, { credentials: "same-origin", ...init });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The request could not reach the service.";
      throw new DriverApiError({
        message: `Network request failed: ${message}`,
        status: null,
        code: "NETWORK_ERROR",
        correlationId: null,
        network: true,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new DriverApiError({
        message: `The service response could not be read completely (HTTP ${response.status}); the mutation outcome is unknown.`,
        status: response.status,
        code: "UNKNOWN_OUTCOME",
        correlationId: null,
        network: true,
      });
    }

    if (!response.ok) {
      const errorEnvelope = readApiError(payload);
      throw new DriverApiError({
        message: errorEnvelope?.message ?? `The request failed (HTTP ${response.status}).`,
        status: response.status,
        code: errorEnvelope?.code ?? `HTTP_${response.status}`,
        correlationId: errorEnvelope?.correlationId ?? null,
      });
    }

    if (!isApiEnvelope<T>(payload)) {
      throw new DriverApiError({
        message: "The service response did not match the documented { data, correlationId } envelope.",
        status: response.status,
        code: "UNKNOWN_OUTCOME",
        correlationId: null,
        network: true,
      });
    }
    return payload;
  }

  return {
    getJobs: () => get<DriverJobDto[]>("/driver/jobs"),
    getShipment: async (shipmentId) => {
      const [shipmentResponse, jobsResponse] = await Promise.all([
        get<DriverShipmentDto>(`/shipments/${encodeURIComponent(shipmentId)}`),
        get<DriverJobDto[]>("/driver/jobs"),
      ]);
      const driverJob = jobsResponse.data.find((job) => job.shipment.id === shipmentId);
      return {
        data: {
          shipment: shipmentResponse.data,
          assignment: driverJob?.assignment ?? null,
        },
        correlationId: shipmentResponse.correlationId,
      };
    },
    createIncident: (input) => mutate<DriverIncidentDto>("incidents:create", "/incidents", input),
    acceptAssignment: (assignmentId) => mutate<DriverAssignmentDto>(
      `assignments:${assignmentId}:accept`,
      `/assignments/${encodeURIComponent(assignmentId)}/accept`,
      {},
    ),
    confirmPickup: (assignmentId) => mutate<DriverAssignmentDto>(
      `assignments:${assignmentId}:pickup`,
      `/assignments/${encodeURIComponent(assignmentId)}/pickup`,
      {},
    ),
    deliver: (assignmentId, input) => mutate<DriverAssignmentDto>(
      `assignments:${assignmentId}:deliver`,
      `/assignments/${encodeURIComponent(assignmentId)}/deliver`,
      input,
    ),
  };
}

function isApiEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  return typeof value === "object" && value !== null && "data" in value &&
    "correlationId" in value && typeof value.correlationId === "string";
}

function readApiError(value: unknown): { code?: string; message?: string; correlationId?: string } | undefined {
  if (typeof value !== "object" || value === null || !("error" in value)) return undefined;
  const error = value.error;
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as Record<string, unknown>;
  return {
    ...(typeof record.code === "string" ? { code: record.code } : {}),
    ...(typeof record.message === "string" ? { message: record.message } : {}),
    ...(typeof record.correlationId === "string" ? { correlationId: record.correlationId } : {}),
  };
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `driver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
