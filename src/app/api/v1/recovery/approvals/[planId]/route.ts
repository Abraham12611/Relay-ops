import { authorize } from "../../../../../../lib/auth.ts";
import { apiRoute } from "../../../../../../lib/http.ts";
import { readRecoveryApproval } from "../../../../../../services/recovery-transactions.ts";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ planId: string }> },
): Promise<Response> {
  return apiRoute(request, async (correlationId) => {
    authorize(request, { roles: ["DISPATCHER"], scopes: ["incident:read"] });
    const { planId } = await context.params;
    return { data: await readRecoveryApproval(planId, correlationId) };
  });
}
