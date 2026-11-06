-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CustomerNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "caseId" TEXT,
    "channel" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerNotification_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerNotification_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CustomerNotification" ("caseId", "channel", "content", "createdAt", "id", "shipmentId", "status") SELECT "caseId", "channel", "content", "createdAt", "id", "shipmentId", "status" FROM "CustomerNotification";
DROP TABLE "CustomerNotification";
ALTER TABLE "new_CustomerNotification" RENAME TO "CustomerNotification";
CREATE INDEX "CustomerNotification_shipmentId_status_idx" ON "CustomerNotification"("shipmentId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
