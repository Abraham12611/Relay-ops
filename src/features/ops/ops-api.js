/**
 * Browser-side adapter for the documented RelayOps API.
 * The server remains the authorization and state-transition authority.
 */

export class OpsApiError extends Error {
  constructor(message, { status = 0, code = "NETWORK_ERROR", correlationId = null } = {}) {
    super(message);
    this.name = "OpsApiError";
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
  }
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * @param {{ fetchImpl?: typeof fetch, basePath?: string }} options
 */
export function createOpsApi({ fetchImpl = globalThis.fetch, basePath = "/api/v1" } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required.");
  }

  async function request(path, { method = "GET", body, idempotencyKey } = {}) {
    const headers = new Headers({ Accept: "application/json" });
    const options = {
      method,
      headers,
      credentials: "same-origin",
    };

    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
      headers.set("X-Request-ID", requestId());
      headers.set("Idempotency-Key", idempotencyKey ?? requestId());
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetchImpl(`${basePath}${path}`, options);
    } catch (cause) {
      throw new OpsApiError("The RelayOps API could not be reached.", {
        code: "NETWORK_ERROR",
      });
    }

    const payload = await readBody(response);
    if (!response.ok) {
      const apiError = payload?.error ?? {};
      throw new OpsApiError(apiError.message ?? `Request failed (${response.status}).`, {
        status: response.status,
        code: apiError.code ?? "HTTP_ERROR",
        correlationId: apiError.correlationId ?? null,
      });
    }
    return payload;
  }

  return Object.freeze({
    getHealth: () => request("/health"),
    listIncidents: () => request("/incidents"),
    getIncident: (incidentId) => request(`/incidents/${encodeURIComponent(incidentId)}`),
    getEvents: (incidentId) =>
      request(`/incidents/${encodeURIComponent(incidentId)}/events`),
    getShipment: (shipmentId) =>
      request(`/shipments/${encodeURIComponent(shipmentId)}`),
    getAvailableVehicles: () => request("/vehicles/available"),
    simulateRecovery: (input) =>
      request("/recovery/simulate", { method: "POST", body: input }),
    decideRecoveryPlan: ({ planId, planHash, planVersion, decision, reason }) => {
      if (!planId || !planHash || !Number.isInteger(planVersion) || planVersion < 1) {
        throw new TypeError("A recovery decision must identify the exact plan ID, hash, and version.");
      }
      if (decision !== "APPROVE" && decision !== "REJECT") {
        throw new TypeError("Decision must be APPROVE or REJECT.");
      }
      const idempotencyKey = requestId();
      return request("/recovery/approvals", {
        method: "POST",
        idempotencyKey,
        body: {
          planId,
          planHash,
          planVersion,
          decision,
          ...(reason ? { reason } : {}),
        },
      });
    },
  });
}
