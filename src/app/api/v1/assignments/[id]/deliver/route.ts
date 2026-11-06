import { authorize } from "../../../../../../lib/auth.ts";
import { apiRoute, requestBody, requiredString } from "../../../../../../lib/http.ts";
import { requiredMutationIdempotencyKey, requiredMutationRequestId } from "../../../../../../lib/mutation-headers.ts";
import { transitionDriverAssignment } from "../../../../../../services/driver-operations.ts";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return apiRoute(request, async (correlationId) => {
    requiredMutationRequestId(request);
    const principal = authorize(request, { roles: ["DRIVER"] });
    const body = await requestBody(request);
    const proofOfDeliveryRef = requiredString(body, "proofOfDeliveryRef", 500);
    const { id } = await context.params;
    const result = await transitionDriverAssignment(id, "deliver", principal, requiredMutationIdempotencyKey(request), correlationId, proofOfDeliveryRef);
    return { data: result.data };
  });
}
