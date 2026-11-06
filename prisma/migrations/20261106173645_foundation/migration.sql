-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "demo" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "capacityUnits" INTEGER NOT NULL,
    "occupiedUnits" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "locationLat" REAL NOT NULL,
    "locationLng" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "dutyStatus" TEXT NOT NULL,
    "lastKnownLat" REAL NOT NULL,
    "lastKnownLng" REAL NOT NULL,
    CONSTRAINT "Driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Driver_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingCode" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assignedDriverId" TEXT NOT NULL,
    "assignedVehicleId" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "promisedAt" DATETIME NOT NULL,
    "etaAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "proofOfDeliveryRef" TEXT,
    CONSTRAINT "Shipment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shipment_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shipment_assignedVehicleId_fkey" FOREIGN KEY ("assignedVehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "currentPlanId" TEXT,
    CONSTRAINT "Incident_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Incident_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IncidentShipment" (
    "incidentId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "originalStatus" TEXT NOT NULL,

    PRIMARY KEY ("incidentId", "shipmentId"),
    CONSTRAINT "IncidentShipment_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IncidentShipment_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecoveryPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "targetShipmentId" TEXT NOT NULL,
    "proposedVehicleId" TEXT NOT NULL,
    "proposedDriverId" TEXT NOT NULL,
    "newEtaAt" DATETIME NOT NULL,
    "rationale" TEXT NOT NULL,
    "feasibilitySnapshot" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "RecoveryPlan_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecoveryPlan_targetShipmentId_fkey" FOREIGN KEY ("targetShipmentId") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecoveryPlan_proposedVehicleId_fkey" FOREIGN KEY ("proposedVehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecoveryPlan_proposedDriverId_fkey" FOREIGN KEY ("proposedDriverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "planHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "decisionReason" TEXT,
    CONSTRAINT "Approval_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RecoveryPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "incidentId" TEXT,
    "status" TEXT NOT NULL,
    CONSTRAINT "Assignment_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Assignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Assignment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Assignment_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BusinessEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    CONSTRAINT "BusinessEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BusinessEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerNotification_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerNotification_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,

    PRIMARY KEY ("actor", "action", "key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_code_key" ON "Vehicle"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_userId_key" ON "Driver"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_vehicleId_key" ON "Driver"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_trackingCode_key" ON "Shipment"("trackingCode");

-- CreateIndex
CREATE INDEX "Shipment_assignedDriverId_status_idx" ON "Shipment"("assignedDriverId", "status");

-- CreateIndex
CREATE INDEX "Shipment_assignedVehicleId_status_idx" ON "Shipment"("assignedVehicleId", "status");

-- CreateIndex
CREATE INDEX "Incident_status_createdAt_idx" ON "Incident"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Incident_vehicleId_status_idx" ON "Incident"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "IncidentShipment_shipmentId_idx" ON "IncidentShipment"("shipmentId");

-- CreateIndex
CREATE INDEX "RecoveryPlan_incidentId_status_idx" ON "RecoveryPlan"("incidentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryPlan_incidentId_version_key" ON "RecoveryPlan"("incidentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_planId_key" ON "Approval"("planId");

-- CreateIndex
CREATE INDEX "Assignment_shipmentId_status_idx" ON "Assignment"("shipmentId", "status");

-- CreateIndex
CREATE INDEX "Assignment_driverId_status_idx" ON "Assignment"("driverId", "status");

-- CreateIndex
CREATE INDEX "BusinessEvent_caseId_createdAt_idx" ON "BusinessEvent"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessEvent_shipmentId_visibility_idx" ON "BusinessEvent"("shipmentId", "visibility");

-- CreateIndex
CREATE INDEX "BusinessEvent_idempotencyKey_idx" ON "BusinessEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CustomerNotification_shipmentId_status_idx" ON "CustomerNotification"("shipmentId", "status");
