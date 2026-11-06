import { authorize } from "../../../../../lib/auth.ts";
import { apiRoute, ApiFault, requestBody, requiredInteger, requiredString } from "../../../../../lib/http.ts";
import { requiredMutationIdempotencyKey, requiredMutationRequestId } from "../../../../../lib/mutation-headers.ts";
import { decideRecoveryPlan } from "../../../../../services/recovery-transactions.ts";
import type { RecoveryDecision } from "../../../../../services/recovery-transactions.ts";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return apiRoute(request, async (correlationId) => {
    requiredMutationRequestId(request);
    const principal = authorize(request, { roles: ["DISPATCHER"] });
    const body = await requestBody(request);
    const decision = requiredString(body, "decision", 8);
    if (decision !== "APPROVE" && decision !== "REJECT") {
      throw new ApiFault(400, "INVALID_INPUT", "decision must be APPROVE or REJECT.");
    }
    let reason: string | undefined;
    if (body.reason !== undefined) {
      if (typeof body.reason !== "string" || body.reason.trim().length > 1000) {
        throw new ApiFault(400, "INVALID_INPUT", "reason must be a string of at most 1000 characters.");
      }
      reason = body.reason.trim();
    }
    const result = await decideRecoveryPlan({
      planId: requiredString(body, "planId", 64),
      planHash: requiredString(body, "planHash", 128),
      planVersion: requiredInteger(body, "planVersion"),
      decision: decision as RecoveryDecision,
      ...(reason === undefined ? {} : { reason }),
    }, principal, requiredMutationIdempotencyKey(request), correlationId);
    return { data: result.data, status: result.replayed ? 200 : 201 };
  });
}
