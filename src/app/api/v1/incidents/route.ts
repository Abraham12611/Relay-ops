import { authorize } from "../../../../lib/auth.ts";
import { apiRoute, idempotencyKeyFor, requestBody, requiredString } from "../../../../lib/http.ts";
import { listIncidents, reportBreakdown } from "../../../../services/incidents.ts";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute(request, async () => {
    authorize(request, { roles: ["DISPATCHER"], scopes: ["incident:read"] });
    return { data: await listIncidents() };
  });
}

export async function POST(request: Request): Promise<Response> {
  return apiRoute(request, async (correlationId) => {
    const principal = authorize(request, { roles: ["DRIVER"] });
    const body = await requestBody(request);
    const summary = requiredString(body, "summary", 500);
    let vehicleId: string | undefined;
    if (body.vehicleId !== undefined) vehicleId = requiredString(body, "vehicleId", 64);
    const input = vehicleId === undefined ? { summary } : { summary, vehicleId };
    const result = await reportBreakdown(input, principal, idempotencyKeyFor(request), correlationId);
    return { data: result, status: result.duplicate ? 200 : 201 };
  });
}
