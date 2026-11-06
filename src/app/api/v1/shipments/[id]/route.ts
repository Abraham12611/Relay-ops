import { authorize } from "../../../../../lib/auth.ts";
import { apiRoute, ApiFault } from "../../../../../lib/http.ts";
import { readDriver, readShipmentDto } from "../../../../../services/driver-operations.ts";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return apiRoute(request, async () => {
    const principal = authorize(request, { roles: ["DISPATCHER", "DRIVER"], scopes: ["shipment:read"] });
    const { id } = await context.params;
    const shipment = await readShipmentDto(id);
    if (principal.kind === "persona" && principal.role === "DRIVER") {
      const driver = await readDriver(principal);
      if (shipment.assignedDriverId !== driver.id) {
        throw new ApiFault(403, "FORBIDDEN", "Drivers may only read shipments currently assigned to them.");
      }
    }
    return { data: shipment };
  });
}
