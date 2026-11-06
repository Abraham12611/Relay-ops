import { authorize } from "../../../../../../lib/auth.ts";
import { apiRoute } from "../../../../../../lib/http.ts";
import { readIncidentEvents } from "../../../../../../services/driver-operations.ts";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return apiRoute(request, async () => {
    authorize(request, { roles: ["DISPATCHER"], scopes: ["incident:read"] });
    const { id } = await context.params;
    return { data: await readIncidentEvents(id) };
  });
}
