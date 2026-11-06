import { requireDemoOperator } from "../../../../../lib/auth.ts";
import { prisma } from "../../../../../lib/db.ts";
import { apiRoute } from "../../../../../lib/http.ts";
import { resetDemoData } from "../../../../../lib/seed.ts";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return apiRoute(request, async () => {
    requireDemoOperator(request);
    await resetDemoData(prisma);
    return { data: { state: "PRE-INCIDENT", incidentCount: 0, affectedShipmentCount: 6 } };
  });
}
