import "dotenv/config";
import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL ??= "file:../relayops.db";

const globalForPrisma = globalThis as unknown as { relayOpsPrisma?: PrismaClient };

export const prisma = globalForPrisma.relayOpsPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.relayOpsPrisma = prisma;
}
