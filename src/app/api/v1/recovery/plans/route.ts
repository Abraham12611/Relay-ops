import { authorize } from "../../../../../lib/auth.ts";
import { apiRoute, idempotencyKeyFor, requestBody, requiredInteger, requiredString } from "../../../../../lib/http.ts";
import { proposeRecovery } from "../../../../../services/recovery.ts";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return apiRoute(request, async (correlationId) => {
    const principal = authorize(request, { roles: ["DISPATCHER"], scopes: ["recovery:propose"] });
    const body = await requestBody(request);
    const result = await proposeRecovery({
      incidentId: requiredString(body, "incidentId", 64),
      shipmentId: requiredString(body, "shipmentId", 64),
      targetDriverId: requiredString(body, "targetDriverId", 64),
      targetVehicleId: requiredString(body, "targetVehicleId", 64),
      newEtaAt: requiredString(body, "newEtaAt", 64),
      rationale: requiredString(body, "rationale", 1000),
      expectedIncidentVersion: requiredInteger(body, "expectedIncidentVersion"),
    }, principal, idempotencyKeyFor(request), correlationId);
    return { data: result, status: 201 };
  });
}
