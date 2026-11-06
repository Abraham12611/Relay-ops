import { authorize } from "../../../../../lib/auth.ts";
import { apiRoute } from "../../../../../lib/http.ts";
import { listDriverJobs } from "../../../../../services/driver-operations.ts";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute(request, async () => {
    const principal = authorize(request, { roles: ["DRIVER"] });
    return { data: await listDriverJobs(principal) };
  });
}
