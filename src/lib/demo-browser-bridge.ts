import { ApiFault } from "./http.ts";

/** Browser-facing helpers for deliberately narrow demo-only server bridges. */
export function requireSameOriginDemoRequest(request: Request): void {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  let sameOrigin = request.headers.get("sec-fetch-site") === "same-origin";

  if (!sameOrigin && origin) {
    try {
      sameOrigin = new URL(origin).origin === new URL(request.url).origin;
    } catch {
      sameOrigin = false;
    }
  }
  if (!sameOrigin && referer) {
    try {
      sameOrigin = new URL(referer).origin === new URL(request.url).origin;
    } catch {
      sameOrigin = false;
    }
  }
  if (!sameOrigin) {
    throw new ApiFault(403, "SAME_ORIGIN_REQUIRED", "Demo controls can only be used from this application origin.");
  }
}

/** Builds an internal server-side request; the operator key never enters browser code. */
export function createDemoOperatorRequest(
  request: Request,
  correlationId: string,
  path: string,
  method: "GET" | "POST",
): Request {
  return new Request(new URL(path, request.url), {
    method,
    headers: {
      "x-demo-operator-key": process.env.DEMO_OPERATOR_KEY ?? "",
      "x-request-id": correlationId,
    },
  });
}

export async function readDemoOperatorResponse(response: Response): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ApiFault(response.ok ? 502 : response.status, "DEMO_API_UNAVAILABLE", "The demo API returned an invalid response.");
  }

  const record = payload as Record<string, unknown>;
  if (!response.ok) {
    const error = record.error !== null && typeof record.error === "object"
      ? record.error as Record<string, unknown>
      : {};
    throw new ApiFault(
      response.status,
      typeof error.code === "string" ? error.code : "DEMO_API_UNAVAILABLE",
      typeof error.message === "string" ? error.message : "The demo API request could not be completed.",
    );
  }
  return record;
}

/** Browser reset is intentionally unavailable on production deployments. */
export function browserDemoResetEnabled(): boolean {
  const operatorKey = process.env.DEMO_OPERATOR_KEY;
  return process.env.DEMO_MODE === "true"
    && process.env.NODE_ENV !== "production"
    && Boolean(operatorKey && operatorKey.length >= 24 && !operatorKey.startsWith("replace-with-"));
}
