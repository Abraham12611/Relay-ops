import { spawnSync } from "node:child_process";
import { INTEGRATION_ENV, requireIntegrationEnvironment } from "./lib/demo-api.mjs";

try {
  requireIntegrationEnvironment(INTEGRATION_ENV);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Integration setup incomplete.");
  process.exitCode = 2;
}

if (process.exitCode !== 2) {
  const result = spawnSync(process.execPath, [
    "--experimental-strip-types",
    "--disable-warning=ExperimentalWarning",
    "--test",
    "tests/api-contract.test.mjs",
  ], {
    stdio: "inherit",
    env: { ...process.env, RELAYOPS_RUN_INTEGRATION_TESTS: "1" },
  });
  process.exitCode = result.status ?? 1;
}
