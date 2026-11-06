import { POST as resetDemo } from "../../v1/demo/reset/route.ts";
import { ApiFault, apiRoute } from "../../../../lib/http.ts";
import {
  browserDemoResetEnabled,
  createDemoOperatorRequest,
  readDemoOperatorResponse,
  requireSameOriginDemoRequest,
} from "../../../../lib/demo-browser-bridge.ts";

export const runtime = "nodejs";

/** Same-origin demo-only reset bridge; production deployments cannot reset through the browser. */
export async function POST(request: Request): Promise<Response> {
  return apiRoute(request, async (correlationId) => {
    requireSameOriginDemoRequest(request);
    if (!browserDemoResetEnabled()) {
      throw new ApiFault(
        503,
        "DEMO_RESET_DISABLED",
        "Browser reset is available only in a configured, non-production demo environment.",
      );
    }

    const internalRequest = createDemoOperatorRequest(request, correlationId, "/api/v1/demo/reset", "POST");
    const payload = await readDemoOperatorResponse(await resetDemo(internalRequest));
    return { data: payload.data ?? { state: "PRE-INCIDENT" } };
  });
}
