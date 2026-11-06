import type { DeepReadonly, DemoScenario, Shipment } from "../types/contracts.ts";

export const SEEDED_AT = "2026-11-06T17:09:00.000Z";

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value as DeepReadonly<T>;
}

const affectedShipments = [
  {
    id: "MED-2048",
    trackingCode: "TRK-2048",
    priority: "CRITICAL",
    promisedAt: "2026-11-06T18:30:00.000Z",
    etaAt: "2026-11-06T18:22:00.000Z",
    units: 2,
  },
  {
    id: "PKG-2049",
    trackingCode: "TRK-2049",
    priority: "NORMAL",
    promisedAt: "2026-11-06T19:00:00.000Z",
    etaAt: "2026-11-06T18:45:00.000Z",
    units: 2,
  },
  {
    id: "PKG-2050",
    trackingCode: "TRK-2050",
    priority: "NORMAL",
    promisedAt: "2026-11-06T19:15:00.000Z",
    etaAt: "2026-11-06T18:58:00.000Z",
    units: 2,
  },
  {
    id: "PKG-2051",
    trackingCode: "TRK-2051",
    priority: "NORMAL",
    promisedAt: "2026-11-06T19:30:00.000Z",
    etaAt: "2026-11-06T19:10:00.000Z",
    units: 2,
  },
  {
    id: "PKG-2052",
    trackingCode: "TRK-2052",
    priority: "NORMAL",
    promisedAt: "2026-11-06T19:45:00.000Z",
    etaAt: "2026-11-06T19:25:00.000Z",
    units: 2,
  },
  {
    id: "PKG-2053",
    trackingCode: "TRK-2053",
    priority: "NORMAL",
    promisedAt: "2026-11-06T20:00:00.000Z",
    etaAt: "2026-11-06T19:42:00.000Z",
    units: 2,
  },
] as const satisfies readonly Pick<
  Shipment,
  "id" | "trackingCode" | "priority" | "promisedAt" | "etaAt" | "units"
>[];

const shipments: readonly Shipment[] = [
  ...affectedShipments.map((shipment) => ({
    ...shipment,
    customerId: "USR-CUSTOMER-01",
    assignedDriverId: "DRV-014",
    assignedVehicleId: "VAN-014",
    status: "IN_TRANSIT" as const,
    proofOfDeliveryRef: null,
  })),
  {
    id: "SHP-1010",
    trackingCode: "TRK-1010",
    customerId: "USR-CUSTOMER-01",
    assignedDriverId: "DRV-009",
    assignedVehicleId: "VAN-009",
    priority: "NORMAL",
    promisedAt: "2026-11-06T20:30:00.000Z",
    etaAt: "2026-11-06T20:10:00.000Z",
    status: "IN_TRANSIT",
    units: 2,
    proofOfDeliveryRef: null,
  },
];

const scenario = {
  seededAt: SEEDED_AT,
  users: [
    { id: "USR-CUSTOMER-01", displayName: "Demo Customer", role: "CUSTOMER", demo: true },
    { id: "USR-DRIVER-014", displayName: "Driver 014", role: "DRIVER", demo: true },
    { id: "USR-DRIVER-009", displayName: "Driver 009", role: "DRIVER", demo: true },
    { id: "USR-DISPATCHER-01", displayName: "Demo Dispatcher", role: "DISPATCHER", demo: true },
    { id: "USR-DEMO-01", displayName: "Demo Operator", role: "DEMO", demo: true },
  ],
  vehicles: [
    {
      id: "VAN-014",
      code: "VAN-014",
      capacityUnits: 12,
      occupiedUnits: 12,
      status: "AVAILABLE",
      locationLat: 6.5244,
      locationLng: 3.3792,
    },
    {
      id: "VAN-009",
      code: "VAN-009",
      capacityUnits: 10,
      occupiedUnits: 2,
      status: "AVAILABLE",
      locationLat: 6.535,
      locationLng: 3.365,
    },
  ],
  drivers: [
    {
      id: "DRV-014",
      userId: "USR-DRIVER-014",
      vehicleId: "VAN-014",
      dutyStatus: "ON_DUTY",
      lastKnownLat: 6.5244,
      lastKnownLng: 3.3792,
    },
    {
      id: "DRV-009",
      userId: "USR-DRIVER-009",
      vehicleId: "VAN-009",
      dutyStatus: "ON_DUTY",
      lastKnownLat: 6.535,
      lastKnownLng: 3.365,
    },
  ],
  shipments,
  incidents: [],
  incidentShipments: [],
  recoveryPlans: [],
  approvals: [],
  assignments: [
    ...affectedShipments.map((shipment, index) => ({
      id: `ASG-${2048 + index}`,
      shipmentId: shipment.id,
      driverId: "DRV-014",
      vehicleId: "VAN-014",
      incidentId: null,
      status: "ACCEPTED" as const,
    })),
    {
      id: "ASG-1010",
      shipmentId: "SHP-1010",
      driverId: "DRV-009",
      vehicleId: "VAN-009",
      incidentId: null,
      status: "ACCEPTED",
    },
  ],
  events: shipments.map((shipment) => ({
    id: `EVT-SEED-${shipment.id}`,
    caseId: null,
    shipmentId: shipment.id,
    actorType: "SYSTEM" as const,
    actorId: "SYSTEM",
    type: "SHIPMENT_REGISTERED",
    visibility: "CUSTOMER" as const,
    payload: { status: "IN_TRANSIT", message: "Your shipment is in transit." },
    createdAt: SEEDED_AT,
    correlationId: `seed-${shipment.id}`,
    idempotencyKey: null,
  })),
  notifications: [],
  idempotencyRecords: [],
} as const satisfies DemoScenario;

/**
 * Immutable, synthetic pre-incident baseline for contract tests and persistence seeding.
 * Reporting the breakdown creates INC-1042; reset itself does not create an incident.
 */
export const DEMO_SCENARIO: DeepReadonly<typeof scenario> = deepFreeze(scenario);

export function getAffectedShipments(
  fixture: DemoScenario,
  incidentId: string,
): readonly Readonly<Shipment>[] {
  const shipmentIds = new Set(
    fixture.incidentShipments
      .filter((relation) => relation.incidentId === incidentId)
      .map((relation) => relation.shipmentId),
  );

  return fixture.shipments.filter((shipment) => shipmentIds.has(shipment.id));
}
