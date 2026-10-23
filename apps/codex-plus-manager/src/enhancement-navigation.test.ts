import assert from "node:assert/strict";
import { test } from "node:test";
import { managerNavigationDestination } from "./enhancement-navigation.ts";

test("legacy settings section links open overview", () => {
  for (const section of ["stepwise", "dictation"] as const) {
    const intent = { page: "settings", section } as const;
    assert.deepEqual(managerNavigationDestination(intent), { route: "overview" });
    assert.deepEqual(intent, { page: "settings", section });
  }
});

test("enhancement links open overview and ignore retired sections", () => {
  assert.deepEqual(managerNavigationDestination({ page: "enhance" }), { route: "overview" });
  for (const section of ["stepwise", "dictation"] as const) {
    assert.deepEqual(managerNavigationDestination({ page: "enhance", section }), { route: "overview" });
  }
});

test("retired settings links fall back to overview", () => {
  assert.deepEqual(managerNavigationDestination({ page: "settings" }), { route: "overview" });
});

test("retired plugin market links fall back to overview without an enhancement section", () => {
  assert.deepEqual(managerNavigationDestination({ page: "pluginMarket" }), { route: "overview" });
  assert.deepEqual(managerNavigationDestination({ page: "pluginMarket", section: "dictation" }), { route: "overview" });
});
