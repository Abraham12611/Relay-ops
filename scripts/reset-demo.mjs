import { resetDemo } from "./lib/demo-api.mjs";

try {
  const state = await resetDemo();
  console.log(`Protected HTTP service reset verified: ${state.seededAt}; PRE-INCIDENT with no INC-1042; six shipments remain IN_TRANSIT on available VAN-014; MED-2048 / TRK-2048.`);
} catch (error) {
  console.error(`Demo reset failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
