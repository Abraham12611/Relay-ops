import type { Shipment as PrismaShipment } from "@prisma/client";
import type { Shipment } from "../types/contracts.ts";

/** Expose the stable Shipment DTO, not Prisma relations or internal staff records. */
export function shipmentDto(record: PrismaShipment): Shipment {
  return {
    id: record.id,
    trackingCode: record.trackingCode,
    customerId: record.customerId,
    assignedDriverId: record.assignedDriverId,
    assignedVehicleId: record.assignedVehicleId,
    priority: record.priority as Shipment["priority"],
    promisedAt: record.promisedAt.toISOString(),
    etaAt: record.etaAt.toISOString(),
    status: record.status as Shipment["status"],
    units: record.units,
    proofOfDeliveryRef: record.proofOfDeliveryRef,
  };
}
