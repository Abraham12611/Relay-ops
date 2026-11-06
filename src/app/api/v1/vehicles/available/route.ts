import { authorize } from "../../../../../lib/auth.ts";
import { apiRoute } from "../../../../../lib/http.ts";
import { availableVehicles } from "../../../../../services/recovery.ts";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute(request, async () => {
    authorize(request, { roles: ["DISPATCHER"], scopes: ["vehicle:read"] });
    return { data: await availableVehicles() };
  });
}
