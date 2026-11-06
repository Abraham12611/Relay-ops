import { createDemoSessionToken, demoDriverUsers, demoSessionCookie, isDemoOperator } from "../../../../../lib/auth.ts";
import { apiRoute, requestBody, requiredString, ApiFault } from "../../../../../lib/http.ts";

export const runtime = "nodejs";

const roles = ["CUSTOMER", "DRIVER", "DISPATCHER", "DEMO"] as const;

export async function POST(request: Request): Promise<Response> {
  return apiRoute(request, async () => {
    const body = await requestBody(request);
    const role = requiredString(body, "role", 16);
    if (!roles.some((candidate) => candidate === role)) {
      throw new ApiFault(400, "INVALID_ROLE", "role must be CUSTOMER, DRIVER, DISPATCHER, or DEMO.");
    }
    if (Object.hasOwn(body, "userId")) {
      throw new ApiFault(400, "INVALID_INPUT", "userId cannot be supplied; select an allowlisted driver with driverId.");
    }
    let userId: string | undefined;
    let driverId: string | undefined;
    if (role === "DRIVER") {
      driverId = body.driverId === undefined ? "DRV-014" : requiredString(body, "driverId", 16);
      userId = demoDriverUsers[driverId as keyof typeof demoDriverUsers];
      if (!userId) throw new ApiFault(400, "INVALID_DRIVER", "driverId must be DRV-014 or DRV-009.");
    } else if (Object.hasOwn(body, "driverId")) {
      throw new ApiFault(400, "INVALID_INPUT", "driverId is only valid for the DRIVER persona.");
    }

    const operatorKey = request.headers.get("x-demo-operator-key");
    const expected = process.env.DEMO_OPERATOR_KEY;
    if (process.env.DEMO_MODE !== "true" || !expected || expected.length < 24 || expected.startsWith("replace-with-")) {
      throw new ApiFault(503, "DEMO_AUTH_NOT_CONFIGURED", "Demo persona authentication is not configured.");
    }
    if (!operatorKey || !isDemoOperator(request)) {
      throw new ApiFault(401, "UNAUTHENTICATED", "A valid demo operator credential is required.");
    }
    const token = createDemoSessionToken(role as typeof roles[number], Date.now(), userId);
    return {
      data: { role, ...(userId ? { userId } : {}), ...(driverId ? { driverId } : {}), expiresInSeconds: 28800 },
      status: 201,
      headers: { "set-cookie": demoSessionCookie(token) },
    };
  });
}
