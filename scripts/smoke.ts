import "dotenv/config";
import { prisma } from "../src/lib/db.ts";
import { loadDemoScenario } from "../src/lib/scenario-from-db.ts";

try {
  const scenario = await loadDemoScenario(prisma);
  const affected = scenario.shipments.filter(({ assignedVehicleId }) => assignedVehicleId === "VAN-014");
  const van014 = scenario.vehicles.find(({ id }) => id === "VAN-014");
  const passed =
    scenario.incidents.length === 0 &&
    affected.length === 6 &&
    affected.every(({ status }) => status === "IN_TRANSIT") &&
    van014?.status === "AVAILABLE";
  if (!passed) throw new Error("Database is not at the deterministic pre-incident baseline.");
  console.log("PASS demo database is PRE-INCIDENT: VAN-014 operational; six shipments IN_TRANSIT; no incidents.");
} finally {
  await prisma.$disconnect();
}
