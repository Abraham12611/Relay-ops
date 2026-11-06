import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_SCENARIO, SEEDED_AT } from "../src/fixtures/scenario.ts";
import { simulateReassignment } from "../src/domain/recovery-feasibility.ts";

const affectedShipments = DEMO_SCENARIO.shipments.filter(
  ({ assignedVehicleId }) => assignedVehicleId === "VAN-014",
);
const recoveryScenario = {
  ...DEMO_SCENARIO,
  vehicles: DEMO_SCENARIO.vehicles.map((vehicle) =>
    vehicle.id === "VAN-014" ? { ...vehicle, status: "BROKEN_DOWN" } : vehicle,
  ),
  shipments: DEMO_SCENARIO.shipments.map((shipment) =>
    shipment.assignedVehicleId === "VAN-014" ? { ...shipment, status: "AT_RISK" } : shipment,
  ),
  incidents: [
    {
      id: "INC-1042",
      type: "BREAKDOWN",
      vehicleId: "VAN-014",
      reporterId: "USR-DRIVER-014",
      severity: "CRITICAL",
      status: "OPEN",
      summary: "Synthetic vehicle breakdown affecting six deliveries.",
      version: 1,
      createdAt: SEEDED_AT,
      resolvedAt: null,
      currentPlanId: null,
    },
  ],
  incidentShipments: affectedShipments.map(({ id }) => ({
    incidentId: "INC-1042",
    shipmentId: id,
    originalStatus: "IN_TRANSIT",
  })),
  assignments: DEMO_SCENARIO.assignments.map((assignment) =>
    assignment.vehicleId === "VAN-014" ? { ...assignment, incidentId: "INC-1042" } : assignment,
  ),
};

const recoveryInput = {
  incidentId: "INC-1042",
  shipmentId: "MED-2048",
  targetDriverId: "DRV-009",
  targetVehicleId: "VAN-009",
};

test("reset fixture is a frozen pre-incident baseline with six operational shipments", () => {
  assert.equal(DEMO_SCENARIO.seededAt, SEEDED_AT);
  assert.deepEqual(DEMO_SCENARIO.incidents, []);
  assert.equal(DEMO_SCENARIO.shipments.filter(({ assignedVehicleId }) => assignedVehicleId === "VAN-014").length, 6);
  assert.ok(DEMO_SCENARIO.shipments.filter(({ assignedVehicleId }) => assignedVehicleId === "VAN-014").every(({ status }) => status === "IN_TRANSIT"));
  assert.equal(DEMO_SCENARIO.shipments.find(({ id }) => id === "MED-2048").trackingCode, "TRK-2048");
  assert.equal(DEMO_SCENARIO.shipments.find(({ id }) => id === "MED-2048").priority, "CRITICAL");
  assert.equal(DEMO_SCENARIO.vehicles.find(({ id }) => id === "VAN-014").status, "AVAILABLE");
  assert.equal(DEMO_SCENARIO.vehicles.find(({ id }) => id === "VAN-009").status, "AVAILABLE");
  assert.ok(Object.isFrozen(DEMO_SCENARIO));
  assert.ok(Object.isFrozen(DEMO_SCENARIO.shipments[0]));
  assert.throws(() => {
    DEMO_SCENARIO.shipments[0].status = "DELIVERED";
  }, TypeError);
});

test("backup vehicle and driver pass the post-report recovery feasibility checks", () => {
  const result = simulateReassignment(recoveryScenario, recoveryInput);

  assert.deepEqual(result, { eligible: true, capacityOk: true, conflicts: [] });
});

test("broken vehicles are not eligible targets", () => {
  const fixture = {
    ...recoveryScenario,
    vehicles: recoveryScenario.vehicles.map((vehicle) =>
      vehicle.id === "VAN-014" ? { ...vehicle, capacityUnits: 14 } : vehicle,
    ),
  };
  const result = simulateReassignment(fixture, {
    ...recoveryInput,
    targetDriverId: "DRV-014",
    targetVehicleId: "VAN-014",
  });

  assert.equal(result.eligible, false);
  assert.equal(result.capacityOk, true);
  assert.ok(result.conflicts.includes("Vehicle VAN-014 is not available."));
});

test("over-capacity assignments are rejected", () => {
  const fixture = {
    ...recoveryScenario,
    vehicles: recoveryScenario.vehicles.map((vehicle) =>
      vehicle.id === "VAN-009" ? { ...vehicle, capacityUnits: 3, occupiedUnits: 2 } : vehicle,
    ),
  };
  const result = simulateReassignment(fixture, recoveryInput);

  assert.equal(result.eligible, false);
  assert.equal(result.capacityOk, false);
  assert.ok(result.conflicts.some((conflict) => conflict.includes("shipment MED-2048 needs 2")));
});

test("a second active critical shipment on the target vehicle is a conflict", () => {
  const fixture = {
    ...recoveryScenario,
    shipments: [
      ...recoveryScenario.shipments,
      {
        ...recoveryScenario.shipments[0],
        id: "MED-9999",
        trackingCode: "TRK-9999",
        assignedVehicleId: "VAN-009",
      },
    ],
  };
  const result = simulateReassignment(fixture, recoveryInput);

  assert.equal(result.eligible, false);
  assert.equal(result.capacityOk, true);
  assert.ok(result.conflicts.includes("Vehicle VAN-009 already has active critical shipment MED-9999."));
});

test("unknown, unrelated and mismatched inputs are rejected without writes", () => {
  const originalEventCount = recoveryScenario.events.length;
  const result = simulateReassignment(recoveryScenario, {
    incidentId: "INC-4040",
    shipmentId: "SHP-1010",
    targetDriverId: "DRV-014",
    targetVehicleId: "VAN-009",
  });

  assert.equal(result.eligible, false);
  assert.ok(result.conflicts.includes("Incident INC-4040 was not found."));
  assert.ok(result.conflicts.includes("Shipment SHP-1010 is not affected by INC-4040."));
  assert.ok(result.conflicts.includes("Driver DRV-014 is not assigned to vehicle VAN-009."));
  assert.equal(recoveryScenario.events.length, originalEventCount);
});

test("off-duty drivers cannot receive a recovery assignment", () => {
  const fixture = {
    ...recoveryScenario,
    drivers: recoveryScenario.drivers.map((driver) =>
      driver.id === "DRV-009" ? { ...driver, dutyStatus: "OFF_DUTY" } : driver,
    ),
  };
  const result = simulateReassignment(fixture, recoveryInput);

  assert.equal(result.eligible, false);
  assert.ok(result.conflicts.includes("Driver DRV-009 is not on duty."));
});

test("delivered shipments cannot be reassigned", () => {
  const fixture = {
    ...recoveryScenario,
    shipments: recoveryScenario.shipments.map((shipment) =>
      shipment.id === "MED-2048" ? { ...shipment, status: "DELIVERED" } : shipment,
    ),
  };
  const result = simulateReassignment(fixture, recoveryInput);

  assert.equal(result.eligible, false);
  assert.ok(result.conflicts.includes("Shipment MED-2048 is already delivered."));
});
