import { authorize } from "../../../../../lib/auth.ts";
import { apiRoute, ApiFault, requestBody, requiredString } from "../../../../../lib/http.ts";
import { requiredMutationIdempotencyKey, requiredMutationRequestId } from "../../../../../lib/mutation-headers.ts";
import { executeRecovery } from "../../../../../services/recovery-transactions.ts";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return apiRoute(request, async (correlationId) => {
    requiredMutationRequestId(request);
    const principal = authorize(request, { scopes: ["recovery:execute"] });
    const body = await requestBody(request);
    const bodyKey = requiredString(body, "idempotencyKey", 200);
    const headerKey = requiredMutationIdempotencyKey(request);
    if (bodyKey !== headerKey) {
      throw new ApiFault(400, "IDEMPOTENCY_KEY_MISMATCH", "The body idempotencyKey must match the Idempotency-Key header.");
    }
    const result = await executeRecovery({
      approvalId: requiredString(body, "approvalId", 128),
      planId: requiredString(body, "planId", 64),
    }, principal, headerKey, correlationId);
    return { data: result.data, status: result.replayed ? 200 : 201 };
  });
}
