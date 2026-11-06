import type {
  DemoScenario,
  RecoveryFeasibility,
  RecoverySimulationInput,
} from "../types/contracts.ts";

/** Read-only feasibility checks over a scenario snapshot; this never mutates state. */
export function simulateReassignment(
  fixture: DemoScenario,
  input: RecoverySimulationInput,
): RecoveryFeasibility {
  const conflicts: string[] = [];
  const incident = fixture.incidents.find(({ id }) => id === input.incidentId);
  const shipment = fixture.shipments.find(({ id }) => id === input.shipmentId);
  const driver = fixture.drivers.find(({ id }) => id === input.targetDriverId);
  const vehicle = fixture.vehicles.find(({ id }) => id === input.targetVehicleId);

  if (!incident) {
    conflicts.push(`Incident ${input.incidentId} was not found.`);
  }
  if (!shipment) {
    conflicts.push(`Shipment ${input.shipmentId} was not found.`);
  } else {
    const isAffected = fixture.incidentShipments.some(
      (relation) =>
        relation.incidentId === input.incidentId && relation.shipmentId === shipment.id,
    );
    if (!isAffected) {
      conflicts.push(`Shipment ${shipment.id} is not affected by ${input.incidentId}.`);
    }
    if (shipment.status === "DELIVERED") {
      conflicts.push(`Shipment ${shipment.id} is already delivered.`);
    }
  }
  if (!driver) {
    conflicts.push(`Driver ${input.targetDriverId} was not found.`);
  } else {
    if (driver.dutyStatus !== "ON_DUTY") {
      conflicts.push(`Driver ${driver.id} is not on duty.`);
    }
    if (driver.vehicleId !== input.targetVehicleId) {
      conflicts.push(`Driver ${driver.id} is not assigned to vehicle ${input.targetVehicleId}.`);
    }
  }
  if (!vehicle) {
    conflicts.push(`Vehicle ${input.targetVehicleId} was not found.`);
  } else if (vehicle.status !== "AVAILABLE") {
    conflicts.push(`Vehicle ${vehicle.id} is not available.`);
  }

  const capacityOk =
    vehicle !== undefined &&
    shipment !== undefined &&
    vehicle.occupiedUnits + shipment.units <= vehicle.capacityUnits;
  if (vehicle && shipment && !capacityOk) {
    conflicts.push(
      `Vehicle ${vehicle.id} has ${vehicle.capacityUnits - vehicle.occupiedUnits} free units; shipment ${shipment.id} needs ${shipment.units}.`,
    );
  }

  if (vehicle) {
    const conflictingShipment = fixture.shipments.find(
      (candidate) =>
        candidate.id !== shipment?.id &&
        candidate.assignedVehicleId === vehicle.id &&
        candidate.priority === "CRITICAL" &&
        candidate.status !== "DELIVERED" &&
        candidate.status !== "DELIVERY_FAILED",
    );
    if (conflictingShipment) {
      conflicts.push(
        `Vehicle ${vehicle.id} already has active critical shipment ${conflictingShipment.id}.`,
      );
    }
  }

  return {
    eligible: conflicts.length === 0,
    capacityOk,
    conflicts,
  };
}
