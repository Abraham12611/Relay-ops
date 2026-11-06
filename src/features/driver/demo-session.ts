export type DemoDriverId = "DRV-014" | "DRV-009";

export interface DemoDriverSessionResult {
  driverId: DemoDriverId;
  correlationId: string;
}

export type DemoDriverSessionErrorKind = "invalid-driver" | "network" | "api" | "invalid-response";

export class DemoDriverSessionError extends Error {
  readonly kind: DemoDriverSessionErrorKind;
  readonly status: number | null;
  readonly correlationId: string | null;

  constructor(kind: DemoDriverSessionErrorKind, status: number | null = null, correlationId: string | null = null) {
    super(kind === "invalid-driver"
      ? "Choose one of the configured demo drivers."
      : kind === "network"
        ? "The demo session request could not be confirmed. Retry selecting the driver before acting."
        : kind === "invalid-response"
          ? "The demo session response could not be verified. Refresh the page and confirm the driver assignment before acting."
          : "The demo driver session could not be selected; the current session remains active.");
    this.name = "DemoDriverSessionError";
    this.kind = kind;
    this.status = status;
    this.correlationId = correlationId;
  }
}

export interface DemoDriverSessionOptions {
  fetcher?: typeof fetch;
  requestId?: () => string;
}

const allowedDriverIds: readonly DemoDriverId[] = ["DRV-014", "DRV-009"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCorrelationId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.error) && typeof value.error.correlationId === "string") return value.error.correlationId;
  return typeof value.correlationId === "string" ? value.correlationId : null;
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `driver-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Selects only a server-allowlisted demo driver; the server derives the signed principal. */
export async function selectDemoDriverSession(
  driverId: string,
  options: DemoDriverSessionOptions = {},
): Promise<DemoDriverSessionResult> {
  if (!allowedDriverIds.includes(driverId as DemoDriverId)) {
    throw new DemoDriverSessionError("invalid-driver");
  }

  const selectedDriverId = driverId as DemoDriverId;
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const requestId = options.requestId?.() ?? createRequestId();
  let response: Response;
  try {
    response = await fetcher("/api/demo/session", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
      body: JSON.stringify({ role: "DRIVER", driverId: selectedDriverId }),
    });
  } catch {
    throw new DemoDriverSessionError("network");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DemoDriverSessionError("invalid-response", response.status);
  }

  if (!response.ok) {
    throw new DemoDriverSessionError("api", response.status, readCorrelationId(payload));
  }

  if (
    !isRecord(payload) ||
    typeof payload.correlationId !== "string" ||
    payload.correlationId.trim().length === 0 ||
    !isRecord(payload.data) ||
    payload.data.role !== "DRIVER" ||
    payload.data.driverId !== selectedDriverId ||
    typeof payload.data.userId !== "string" ||
    !Number.isSafeInteger(payload.data.expiresInSeconds) ||
    (payload.data.expiresInSeconds as number) <= 0
  ) {
    throw new DemoDriverSessionError("invalid-response", response.status, readCorrelationId(payload));
  }

  return { driverId: selectedDriverId, correlationId: payload.correlationId };
}
