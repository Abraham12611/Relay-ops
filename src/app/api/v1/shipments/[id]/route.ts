import { authorize } from "../../../../../lib/auth.ts";
import { apiRoute, ApiFault } from "../../../../../lib/http.ts";
import { readShipment } from "../../../../../services/recovery.ts";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return apiRoute(request, async () => {
    const principal = authorize(request, { roles: ["DISPATCHER", "DRIVER"], scopes: ["shipment:read"] });
    const { id } = await context.params;
    const shipment = await readShipment(id);
    if (principal.kind === "persona" && principal.role === "DRIVER") {
      if (shipment.assignedDriver.userId !== principal.userId) {
        throw new ApiFault(403, "FORBIDDEN", "Drivers may only read shipments assigned to them.");
      }
    }
    return { data: shipment };
  });
}
