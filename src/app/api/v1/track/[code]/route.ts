import { apiRoute } from "../../../../../lib/http.ts";
import { readCustomerTracking } from "../../../../../services/driver-operations.ts";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  return apiRoute(request, async () => {
    const { code } = await context.params;
    return { data: await readCustomerTracking(code) };
  });
}
