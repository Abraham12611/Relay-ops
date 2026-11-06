import { randomUUID } from "node:crypto";

export class ApiFault extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiFault";
  }
}

export interface ApiResult {
  data: unknown;
  status?: number;
  headers?: HeadersInit;
}

export function correlationIdFor(request: Request): string {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied && supplied.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(supplied)
    ? supplied
    : randomUUID();
}

export function successResponse(
  data: unknown,
  correlationId: string,
  status = 200,
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  return new Response(JSON.stringify({ data, correlationId }), { status, headers: responseHeaders });
}

export function errorResponse(
  error: unknown,
  correlationId: string,
): Response {
  const fault = error instanceof ApiFault
    ? error
    : new ApiFault(500, "INTERNAL_ERROR", "An unexpected server error occurred.");
  return new Response(
    JSON.stringify({
      error: { code: fault.code, message: fault.message, correlationId },
    }),
    {
      status: fault.status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    },
  );
}

export async function apiRoute(
  request: Request,
  action: (correlationId: string) => Promise<ApiResult>,
): Promise<Response> {
  const correlationId = correlationIdFor(request);
  try {
    const result = await action(correlationId);
    return successResponse(result.data, correlationId, result.status, result.headers);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}

export async function requestBody(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiFault(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiFault(400, "INVALID_BODY", "Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export function requiredString(
  body: Record<string, unknown>,
  field: string,
  maxLength = 500,
): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new ApiFault(400, "INVALID_INPUT", `${field} must be a non-empty string of at most ${maxLength} characters.`);
  }
  return value.trim();
}

export function requiredInteger(body: Record<string, unknown>, field: string): number {
  const value = body[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new ApiFault(400, "INVALID_INPUT", `${field} must be a positive integer.`);
  }
  return value;
}

export function idempotencyKeyFor(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new ApiFault(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required.");
  }
  return key;
}
