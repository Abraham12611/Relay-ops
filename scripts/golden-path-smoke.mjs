import { runGoldenPath } from "./lib/golden-path.mjs";

try {
  const result = await runGoldenPath();
  console.log(`Golden-path API smoke passed for ${result.incidentId} (${result.assignmentId}).`);
  for (const step of result.steps) console.log(`PASS ${step}`);
  console.log("This is business-API evidence only; it does not prove live Switch/Mattermost interaction.");
} catch (error) {
  console.error(`Golden-path API smoke failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
