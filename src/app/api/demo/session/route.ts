import { POST as createDemoSession } from "../../v1/demo/session/route.ts";
import { ApiFault, apiRoute, requestBody } from "../../../../lib/http.ts";

export const runtime = "nodejs";

/** Same-origin, demo-only bridge; the operator key stays on the server. */
export async function POST(request: Request): Promise<Response> {
  return apiRoute(request, async (correlationId) => {
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
      throw new ApiFault(403, "SAME_ORIGIN_REQUIRED", "Demo sessions can only be started from this application origin.");
    }

    const body = await requestBody(request);
    const operatorKey = process.env.DEMO_OPERATOR_KEY;
    const internalRequest = new Request(new URL("/api/v1/demo/session", request.url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-demo-operator-key": operatorKey ?? "",
        "x-request-id": correlationId,
      },
      body: JSON.stringify(body),
    });
    const response = await createDemoSession(internalRequest);
    const payload = await response.json() as {
      data?: unknown;
      error?: { code?: unknown; message?: unknown };
    };
    if (!response.ok) {
      throw new ApiFault(
        response.status,
        typeof payload.error?.code === "string" ? payload.error.code : "DEMO_SESSION_UNAVAILABLE",
        typeof payload.error?.message === "string" ? payload.error.message : "Demo session could not be started.",
      );
    }
    return {
      data: payload.data,
      status: response.status,
      headers: { "set-cookie": response.headers.get("set-cookie") ?? "" },
    };
  });
}
