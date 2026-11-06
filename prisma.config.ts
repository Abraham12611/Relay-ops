import "dotenv/config";
import { defineConfig } from "prisma/config";

process.env.DATABASE_URL ??= "file:../relayops.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx scripts/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
