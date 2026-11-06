import assert from "node:assert/strict";
import test from "node:test";
import { browserDemoResetEnabled, requireSameOriginDemoRequest } from "./demo-browser-bridge.ts";

function withEnvironment(values, action) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    action();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("browser reset is limited to configured non-production demo mode", () => {
  withEnvironment({ DEMO_MODE: "true", DEMO_OPERATOR_KEY: "x".repeat(24), NODE_ENV: "development" }, () => {
    assert.equal(browserDemoResetEnabled(), true);
    process.env.NODE_ENV = "production";
    assert.equal(browserDemoResetEnabled(), false);
    process.env.NODE_ENV = "development";
    process.env.DEMO_MODE = "false";
    assert.equal(browserDemoResetEnabled(), false);
    process.env.DEMO_MODE = "true";
    process.env.DEMO_OPERATOR_KEY = "replace-with-a-real-key";
    assert.equal(browserDemoResetEnabled(), false);
  });
});

test("demo browser bridges require the application origin", () => {
  assert.doesNotThrow(() => requireSameOriginDemoRequest(new Request("http://localhost:4173/api/demo/state", {
    headers: { "sec-fetch-site": "same-origin" },
  })));
  assert.doesNotThrow(() => requireSameOriginDemoRequest(new Request("http://localhost:4173/api/demo/state", {
    headers: { origin: "http://localhost:4173" },
  })));
  assert.throws(() => requireSameOriginDemoRequest(new Request("http://localhost:4173/api/demo/state", {
    headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
  })), (error) => error.status === 403 && error.code === "SAME_ORIGIN_REQUIRED");
});
