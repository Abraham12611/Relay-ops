import { authorize } from "../../../../../lib/auth.ts";
import { apiRoute, ApiFault } from "../../../../../lib/http.ts";
import { listDriverJobs } from "../../../../../services/recovery.ts";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute(request, async () => {
    const principal = authorize(request, { roles: ["DRIVER"] });
    if (principal.kind !== "persona" || principal.role !== "DRIVER") {
      throw new ApiFault(403, "DRIVER_REQUIRED", "Only an authenticated driver can read their assigned jobs.");
    }
    return { data: await listDriverJobs(principal.userId) };
  });
}
