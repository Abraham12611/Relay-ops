import type { ShipmentPriority, ShipmentStatus } from "../../types/contracts.ts";

export type CustomerEventKind = "STATUS" | "BREAKDOWN" | "RECOVERY" | "ETA_REVISED" | "DELIVERY";
export type CustomerNotificationKind = CustomerEventKind | "GENERAL";

/** The public, customer-safe projection returned by the tracking endpoint. */
export interface CustomerTrackingSnapshot {
  shipment: {
    id: string;
    trackingCode: string;
    priority: ShipmentPriority;
    status: ShipmentStatus;
    promisedAt: string;
    etaAt: string;
    updatedAt: string;
    deliveredAt: string | null;
  };
  timeline: CustomerTimelineEntry[];
  notifications: CustomerTrackingNotification[];
}

export interface CustomerTimelineEntry {
  id: string;
  kind: CustomerEventKind;
  visibility: "CUSTOMER";
  title: string;
  message: string;
  createdAt: string;
}

export interface CustomerTrackingNotification {
  id: string;
  kind: CustomerNotificationKind;
  message: string;
  createdAt: string;
}

export interface TrackingApiResult {
  snapshot: CustomerTrackingSnapshot;
  correlationId: string;
  requestId: string;
}

export type TrackingApiErrorKind =
  | "not-found"
  | "unavailable"
  | "network"
  | "invalid-response"
  | "request-failed"
  | "aborted";

export class TrackingApiError extends Error {
  readonly kind: TrackingApiErrorKind;
  readonly correlationId: string;
  readonly requestId: string;
  readonly status: number | undefined;
  readonly code: string | undefined;

  constructor(options: {
    kind: TrackingApiErrorKind;
    correlationId: string;
    requestId: string;
    status?: number;
    code?: string;
  }) {
    super(options.kind);
    this.name = "TrackingApiError";
    this.kind = options.kind;
    this.correlationId = options.correlationId;
    this.requestId = options.requestId;
    this.status = options.status;
    this.code = options.code;
  }
}

export type TrackingFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface TrackingApiOptions {
  fetcher?: TrackingFetch;
  signal?: AbortSignal;
  requestIdFactory?: () => string;
}

const shipmentStatuses: readonly ShipmentStatus[] = [
  "IN_TRANSIT",
  "AT_RISK",
  "REASSIGNMENT_PENDING",
  "REASSIGNED",
  "PICKED_UP_BY_BACKUP",
  "DELIVERED",
  "EXCEPTION",
  "DELIVERY_FAILED",
];
const eventKinds: readonly CustomerEventKind[] = ["STATUS", "BREAKDOWN", "RECOVERY", "ETA_REVISED", "DELIVERY"];
const notificationKinds: readonly CustomerNotificationKind[] = [...eventKinds, "GENERAL"];
const priorities: readonly ShipmentPriority[] = ["NORMAL", "CRITICAL"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<Value extends string>(value: unknown, options: readonly Value[]): value is Value {
  return typeof value === "string" && options.some((option) => option === value);
}

function readString(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function readTimestamp(value: unknown, field: string): string {
  const timestamp = readString(value, field, 100);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`Invalid ${field}`);
  }
  return timestamp;
}

function readNullableTimestamp(value: unknown, field: string): string | null {
  return value === null ? null : readTimestamp(value, field);
}

function validateTimelineEntry(value: unknown): CustomerTimelineEntry {
  if (!isRecord(value) || value.visibility !== "CUSTOMER") {
    throw new Error("Tracking timeline contains a non-customer event");
  }
  if (!isOneOf(value.kind, eventKinds)) {
    throw new Error("Invalid timeline event kind");
  }
  return {
    id: readString(value.id, "timeline event id", 128),
    kind: value.kind,
    visibility: "CUSTOMER",
    title: readString(value.title, "timeline title", 120),
    message: readString(value.message, "timeline message", 1000),
    createdAt: readTimestamp(value.createdAt, "timeline timestamp"),
  };
}

function validateNotification(value: unknown): CustomerTrackingNotification {
  if (!isRecord(value) || !isOneOf(value.kind, notificationKinds)) {
    throw new Error("Invalid tracking notification");
  }
  return {
    id: readString(value.id, "notification id", 128),
    kind: value.kind,
    message: readString(value.message, "notification message", 1000),
    createdAt: readTimestamp(value.createdAt, "notification timestamp"),
  };
}

/** Validate and copy only fields permitted by the customer tracking projection. */
export function validateCustomerTrackingSnapshot(
  value: unknown,
  requestedTrackingCode: string,
): CustomerTrackingSnapshot {
  if (!isRecord(value) || !isRecord(value.shipment)) {
    throw new Error("Invalid tracking data");
  }

  const shipment = value.shipment;
  const trackingCode = readString(shipment.trackingCode, "tracking code", 64);
  if (trackingCode !== requestedTrackingCode) {
    throw new Error("Tracking code did not match the request");
  }
  if (!isOneOf(shipment.priority, priorities) || !isOneOf(shipment.status, shipmentStatuses)) {
    throw new Error("Invalid shipment state");
  }
  if (!Array.isArray(value.timeline) || !Array.isArray(value.notifications)) {
    throw new Error("Invalid customer updates");
  }

  return {
    shipment: {
      id: readString(shipment.id, "shipment id", 128),
      trackingCode,
      priority: shipment.priority,
      status: shipment.status,
      promisedAt: readTimestamp(shipment.promisedAt, "promised ETA"),
      etaAt: readTimestamp(shipment.etaAt, "current ETA"),
      updatedAt: readTimestamp(shipment.updatedAt, "shipment update timestamp"),
      deliveredAt: readNullableTimestamp(shipment.deliveredAt, "delivery timestamp"),
    },
    timeline: value.timeline.map(validateTimelineEntry),
    notifications: value.notifications.map(validateNotification),
  };
}

function createRequestId(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `track-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readCorrelationId(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.error)) return undefined;
  const id = value.error.correlationId;
  return typeof id === "string" && id.trim().length > 0 && id.length <= 128 ? id : undefined;
}

function readErrorCode(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.error)) return undefined;
  const code = value.error.code;
  return typeof code === "string" && code.trim().length > 0 && code.length <= 128 ? code : undefined;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Fetch durable state from the documented public tracking endpoint. */
export async function fetchTrackingSnapshot(
  trackingCode: string,
  options: TrackingApiOptions = {},
): Promise<TrackingApiResult> {
  const normalizedCode = trackingCode.trim();
  if (!normalizedCode) throw new TypeError("A tracking code is required");

  const requestId = options.requestIdFactory?.() ?? createRequestId();
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (typeof fetcher !== "function") {
    throw new TrackingApiError({ kind: "unavailable", correlationId: requestId, requestId });
  }

  const request: RequestInit = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Request-ID": requestId,
    },
    cache: "no-store",
  };
  if (options.signal !== undefined) request.signal = options.signal;

  let response: Response;
  try {
    response = await fetcher(`/api/v1/track/${encodeURIComponent(normalizedCode)}`, request);
  } catch {
    if (options.signal?.aborted) {
      throw new TrackingApiError({ kind: "aborted", correlationId: requestId, requestId });
    }
    throw new TrackingApiError({ kind: "network", correlationId: requestId, requestId });
  }

  const body = await readJson(response);
  if (!response.ok) {
    const code = readErrorCode(body);
    const correlationId = readCorrelationId(body) ?? requestId;
    if (response.status >= 500 || (response.status === 404 && code === undefined)) {
      throw new TrackingApiError({ kind: "unavailable", correlationId, requestId, status: response.status, ...(code === undefined ? {} : { code }) });
    }
    if (response.status === 404 && (code === "TRACKING_NOT_FOUND" || code === "NOT_FOUND")) {
      throw new TrackingApiError({ kind: "not-found", correlationId, requestId, status: response.status, code });
    }
    throw new TrackingApiError({ kind: "request-failed", correlationId, requestId, status: response.status, ...(code === undefined ? {} : { code }) });
  }

  if (!isRecord(body) || typeof body.correlationId !== "string" || body.correlationId.trim().length === 0 || body.correlationId.length > 128) {
    throw new TrackingApiError({ kind: "invalid-response", correlationId: requestId, requestId, status: response.status });
  }

  try {
    return {
      snapshot: validateCustomerTrackingSnapshot(body.data, normalizedCode),
      correlationId: body.correlationId,
      requestId,
    };
  } catch {
    throw new TrackingApiError({ kind: "invalid-response", correlationId: body.correlationId, requestId, status: response.status });
  }
}
