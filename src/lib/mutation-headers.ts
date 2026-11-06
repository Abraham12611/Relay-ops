import { ApiFault, idempotencyKeyFor } from "./http.ts";

/** Require the caller-provided correlation ID for a state-changing request. */
export function requiredMutationRequestId(request: Request): string {
  const requestId = request.headers.get("x-request-id")?.trim();
  if (!requestId || requestId.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(requestId)) {
    throw new ApiFault(400, "REQUEST_ID_REQUIRED", "A valid X-Request-ID header is required for this mutation.");
  }
  return requestId;
}

export function requiredMutationIdempotencyKey(request: Request): string {
  return idempotencyKeyFor(request);
}
