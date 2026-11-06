import { DEMO_SCENARIO, getAffectedShipments } from "../src/fixtures/scenario.ts";

const incident = DEMO_SCENARIO.incidents[0];
if (incident) {
  // @ts-expect-error The exported baseline must be immutable in TypeScript too.
  incident.status = "RESOLVED";
}

const firstAffectedShipment = getAffectedShipments(DEMO_SCENARIO, "INC-1042")[0];
if (firstAffectedShipment) {
  // @ts-expect-error Affected fixture records must not be mutable through the helper.
  firstAffectedShipment.status = "DELIVERED";
}
