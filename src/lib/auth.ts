import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "../types/contracts.ts";
import { ApiFault } from "./http.ts";

export type AgentScope = "incident:read" | "shipment:read" | "vehicle:read" | "recovery:simulate" | "recovery:propose" | "recovery:execute";

export type Principal =
  | { kind: "persona"; role: Role; userId: string }
  | { kind: "agent"; actorId: string; scopes: readonly AgentScope[] };

export interface AuthorizationOptions {
  roles?: readonly Role[];
  scopes?: readonly AgentScope[];
}

const SESSION_COOKIE = "relayops_demo_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

const demoUsers: Record<Role, string> = {
  CUSTOMER: "USR-CUSTOMER-01",
  DRIVER: "USR-DRIVER-014",
  DISPATCHER: "USR-DISPATCHER-01",
  DEMO: "USR-DEMO-01",
};

function configuredSecret(name: string): string | null {
  const value = process.env[name];
  return value && value.length >= 24 && !value.startsWith("replace-with-") ? value : null;
}

function safeEqual(supplied: string | null, expected: string | null): boolean {
  if (!supplied || !expected) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function cookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function demoModeEnabled(): boolean {
  return process.env.DEMO_MODE === "true";
}

export function isDemoOperator(request: Request): boolean {
  if (!demoModeEnabled()) return false;
  return safeEqual(request.headers.get("x-demo-operator-key"), configuredSecret("DEMO_OPERATOR_KEY"));
}

export function createDemoSessionToken(role: Role, now = Date.now()): string {
  if (!demoModeEnabled()) {
    throw new ApiFault(503, "DEMO_MODE_DISABLED", "Demo persona sessions are disabled.");
  }
  const secret = configuredSecret("DEMO_OPERATOR_KEY");
  if (!secret) {
    throw new ApiFault(503, "DEMO_AUTH_NOT_CONFIGURED", "Demo operator authentication is not configured.");
  }
  const payload = Buffer.from(JSON.stringify({
    userId: demoUsers[role],
    role,
    expiresAt: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
  })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function demoSessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

function personaFromRequest(request: Request): Principal | null {
  if (!demoModeEnabled()) return null;
  const secret = configuredSecret("DEMO_OPERATOR_KEY");
  const token = cookieValue(request, SESSION_COOKIE);
  if (!secret || !token) return null;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = token.slice(0, separator);
  if (!safeEqual(token.slice(separator + 1), sign(payload, secret))) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (decoded === null || typeof decoded !== "object") return null;
    const session = decoded as { userId?: unknown; role?: unknown; expiresAt?: unknown };
    if (
      typeof session.userId !== "string" ||
      typeof session.role !== "string" ||
      !Object.hasOwn(demoUsers, session.role) ||
      typeof session.expiresAt !== "number" ||
      session.expiresAt <= Math.floor(Date.now() / 1000) ||
      demoUsers[session.role as Role] !== session.userId
    ) return null;
    return { kind: "persona", userId: session.userId, role: session.role as Role };
  } catch {
    return null;
  }
}

function agentFromRequest(request: Request): Principal | null {
  const supplied = request.headers.get("x-agent-api-key");
  if (!supplied) return null;
  const keyNames: readonly [string, readonly AgentScope[]][] = [
    ["AGENT_READ_API_KEY", ["incident:read", "shipment:read", "vehicle:read", "recovery:simulate"]],
    ["AGENT_PROPOSE_API_KEY", ["incident:read", "shipment:read", "vehicle:read", "recovery:simulate", "recovery:propose"]],
    ["AGENT_EXECUTE_API_KEY", ["recovery:execute"]],
  ];
  const matches = keyNames.filter(([name]) => safeEqual(supplied, configuredSecret(name)));
  if (matches.length !== 1 || !matches[0]) return null;
  return { kind: "agent", actorId: "AGENT", scopes: matches[0][1] };
}

export function resolvePrincipal(request: Request): Principal | null {
  return agentFromRequest(request) ?? personaFromRequest(request);
}

export function authorize(request: Request, options: AuthorizationOptions): Principal {
  const principal = resolvePrincipal(request);
  if (!principal) {
    throw new ApiFault(401, "UNAUTHENTICATED", "A valid demo session or scoped agent credential is required.");
  }
  if (principal.kind === "persona") {
    if (options.roles?.includes(principal.role)) return principal;
  } else if (options.scopes?.some((scope) => principal.scopes.includes(scope))) {
    return principal;
  }
  throw new ApiFault(403, "FORBIDDEN", "This identity is not authorized for the requested operation.");
}

export function requireDemoOperator(request: Request): void {
  if (!demoModeEnabled()) {
    throw new ApiFault(503, "DEMO_MODE_DISABLED", "Demo reset operations are disabled.");
  }
  if (!configuredSecret("DEMO_OPERATOR_KEY")) {
    throw new ApiFault(503, "DEMO_AUTH_NOT_CONFIGURED", "Demo operator authentication is not configured.");
  }
  if (!isDemoOperator(request)) {
    throw new ApiFault(401, "UNAUTHENTICATED", "A valid demo operator credential is required.");
  }
}
