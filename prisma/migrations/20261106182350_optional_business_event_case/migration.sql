-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BusinessEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT,
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
INSERT INTO "new_BusinessEvent" ("actorId", "actorType", "caseId", "correlationId", "createdAt", "id", "idempotencyKey", "payload", "shipmentId", "type", "visibility") SELECT "actorId", "actorType", "caseId", "correlationId", "createdAt", "id", "idempotencyKey", "payload", "shipmentId", "type", "visibility" FROM "BusinessEvent";
DROP TABLE "BusinessEvent";
ALTER TABLE "new_BusinessEvent" RENAME TO "BusinessEvent";
CREATE INDEX "BusinessEvent_caseId_createdAt_idx" ON "BusinessEvent"("caseId", "createdAt");
CREATE INDEX "BusinessEvent_shipmentId_visibility_idx" ON "BusinessEvent"("shipmentId", "visibility");
CREATE INDEX "BusinessEvent_idempotencyKey_idx" ON "BusinessEvent"("idempotencyKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
