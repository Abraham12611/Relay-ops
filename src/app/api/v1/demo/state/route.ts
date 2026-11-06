import { requireDemoOperator } from "../../../../../lib/auth.ts";
import { prisma } from "../../../../../lib/db.ts";
import { apiRoute } from "../../../../../lib/http.ts";
import { loadDemoScenario } from "../../../../../lib/scenario-from-db.ts";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute(request, async () => {
    requireDemoOperator(request);
    const scenario = await loadDemoScenario(prisma);
    return {
      data: {
        state: scenario.incidents.length === 0 ? "PRE-INCIDENT" : "INCIDENT_ACTIVE",
        scenario,
      },
    };
  });
}
