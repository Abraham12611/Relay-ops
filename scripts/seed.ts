import { prisma } from "../src/lib/db.ts";
import { resetDemoData } from "../src/lib/seed.ts";

try {
  await resetDemoData(prisma);
  console.log("Demo database seeded to the deterministic pre-incident baseline.");
} finally {
  await prisma.$disconnect();
}
