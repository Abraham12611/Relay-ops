import { resetDemo } from "./lib/demo-api.mjs";

try {
  const state = await resetDemo();
  console.log(`Demo reset verified: ${state.seededAt}; INC-1042 OPEN; MED-2048 / TRK-2048; six affected shipments.`);
} catch (error) {
  console.error(`Demo reset failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
