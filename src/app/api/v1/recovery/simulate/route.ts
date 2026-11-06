import { authorize } from "../../../../../lib/auth.ts";
import { apiRoute, requestBody, requiredString } from "../../../../../lib/http.ts";
import { simulateRecovery } from "../../../../../services/recovery.ts";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return apiRoute(request, async () => {
    authorize(request, { roles: ["DISPATCHER"], scopes: ["recovery:simulate"] });
    const body = await requestBody(request);
    const result = await simulateRecovery({
      incidentId: requiredString(body, "incidentId", 64),
      shipmentId: requiredString(body, "shipmentId", 64),
      targetDriverId: requiredString(body, "targetDriverId", 64),
      targetVehicleId: requiredString(body, "targetVehicleId", 64),
    });
    return { data: result };
  });
}
