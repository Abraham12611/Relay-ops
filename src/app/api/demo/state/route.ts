import { GET as readDemoState } from "../../v1/demo/state/route.ts";
import { apiRoute } from "../../../../lib/http.ts";
import {
  createDemoOperatorRequest,
  readDemoOperatorResponse,
  requireSameOriginDemoRequest,
  browserDemoResetEnabled,
} from "../../../../lib/demo-browser-bridge.ts";

export const runtime = "nodejs";

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function rows(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(asRecord).filter((row): row is RecordValue => row !== null) : [];
}

/** Returns only scenario counts/status, not the full protected demo database snapshot. */
export async function GET(request: Request): Promise<Response> {
  return apiRoute(request, async (correlationId) => {
    requireSameOriginDemoRequest(request);
    const internalRequest = createDemoOperatorRequest(request, correlationId, "/api/v1/demo/state", "GET");
    const payload = await readDemoOperatorResponse(await readDemoState(internalRequest));
    const data = asRecord(payload.data);
    const scenario = asRecord(data?.scenario);
    if (!scenario) {
      throw new Error("Demo state did not include the expected scenario snapshot.");
    }

    const incidents = rows(scenario.incidents);
    const incident = incidents.find((item) => item.id === "INC-1042") ?? incidents[0] ?? null;
    const incidentId = typeof incident?.id === "string" ? incident.id : null;
    const relations = rows(scenario.incidentShipments);
    const affectedRelations = incidentId
      ? relations.filter((relation) => relation.incidentId === incidentId)
      : [];
    const affectedShipmentIds = new Set(affectedRelations.map((relation) => relation.shipmentId));
    const shipments = rows(scenario.shipments);
    const baselineShipmentCount = shipments.filter((shipment) => shipment.assignedVehicleId === "VAN-014").length;
    const terminalShipmentCount = shipments.filter((shipment) =>
      affectedShipmentIds.has(shipment.id) && ["DELIVERED", "DELIVERY_FAILED"].includes(String(shipment.status)),
    ).length;

    return {
      data: {
        state: incident
          ? (typeof incident.status === "string" ? incident.status : "INCIDENT_ACTIVE")
          : "PRE-INCIDENT",
        incidentId,
        incidentCount: incidents.length,
        baselineShipmentCount,
        affectedShipmentCount: affectedRelations.length,
        terminalShipmentCount,
        resetAvailable: browserDemoResetEnabled(),
      },
    };
  });
}
