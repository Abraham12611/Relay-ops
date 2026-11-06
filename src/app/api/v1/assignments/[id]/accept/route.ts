import { authorize } from "../../../../../../lib/auth.ts";
import { apiRoute } from "../../../../../../lib/http.ts";
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
    const { id } = await context.params;
    const result = await transitionDriverAssignment(id, "accept", principal, requiredMutationIdempotencyKey(request), correlationId);
    return { data: result.data };
  });
}
