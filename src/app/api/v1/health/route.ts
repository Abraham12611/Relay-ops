import { prisma } from "../../../../lib/db.ts";
import { apiRoute } from "../../../../lib/http.ts";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return apiRoute(request, async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { data: { status: "ok", database: "healthy" } };
  });
}
