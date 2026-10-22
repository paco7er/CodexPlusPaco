import assert from "node:assert/strict";
import { test } from "node:test";
import { managerNavigationDestination } from "./enhancement-navigation.ts";

test("legacy settings section links open the remaining enhancements", () => {
  for (const section of ["stepwise", "dictation"] as const) {
    const intent = { page: "settings", section } as const;
    assert.deepEqual(managerNavigationDestination(intent), { route: "enhance" });
    assert.deepEqual(intent, { page: "settings", section });
  }
});

test("enhancement links ignore retired sections", () => {
  assert.deepEqual(managerNavigationDestination({ page: "enhance" }), { route: "enhance" });
  for (const section of ["stepwise", "dictation"] as const) {
    assert.deepEqual(managerNavigationDestination({ page: "enhance", section }), { route: "enhance" });
  }
});

test("retired settings links fall back to enhancements", () => {
  assert.deepEqual(managerNavigationDestination({ page: "settings" }), { route: "enhance" });
});

test("retired plugin market links fall back to overview without an enhancement section", () => {
  assert.deepEqual(managerNavigationDestination({ page: "pluginMarket" }), { route: "overview" });
  assert.deepEqual(managerNavigationDestination({ page: "pluginMarket", section: "dictation" }), { route: "overview" });
});
