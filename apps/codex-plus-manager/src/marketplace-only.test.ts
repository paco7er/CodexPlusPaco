import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../../assets/inject/renderer-inject.js", import.meta.url), "utf8");

async function start(master = true, marketplace = true) {
  const listeners: string[] = [];
  const intervals: number[] = [];
  const frames: Array<() => void> = [];
  const routes: string[] = [];
  const queries: string[] = [];
  const settings: Record<string, unknown> = {
    enhancementsEnabled: master,
    codexAppPluginMarketplaceUnlock: marketplace,
    codexAppVersion: "26.1000.1",
    dictation: { enabled: true },
    relayProfilesEnabled: true,
    activeRelayId: "official",
    relayProfiles: [{ id: "official", relayMode: "official", officialMixApiKey: true }],
  };
  for (const key of source.matchAll(/: "(codexApp\w+)"/g)) settings[key[1]] = true;
  settings.codexAppPluginMarketplaceUnlock = marketplace;
  const node = {
    querySelector: () => null,
    querySelectorAll: () => [],
    style: { removeProperty() {} },
    removeAttribute() {},
    classList: { remove() {} },
  };
  const document = {
    hidden: false,
    body: node,
    documentElement: node,
    getElementById: () => null,
    createDocumentFragment: () => node,
    createElement: () => assert.fail("marketplace unlock must not create built-in UI"),
    querySelector: (selector: string) => { queries.push(selector); return null; },
    querySelectorAll: (selector: string) => { queries.push(selector); return []; },
    addEventListener: (name: string) => listeners.push(`document:${name}`),
    removeEventListener() {},
  };
  const storage = { getItem: () => JSON.stringify({ pluginMarketplaceUnlock: true, sessionDelete: true, typingEffect: "stars" }) };
  const window: Record<string, any> = {
    __CODEX_PLUS_MARKETPLACE_ONLY__: true,
    location: { href: "app://-/index.html", search: "" },
    addEventListener: (name: string) => listeners.push(`window:${name}`),
    removeEventListener() {},
    clearInterval() {},
    clearTimeout() {},
    dispatchEvent: () => true,
    localStorage: storage,
    electronBridge: { sendMessageFromView: async () => ({}) },
    __codexSessionDeleteBridge: async (path: string) => {
      routes.push(path);
      if (path === "/settings/get") return settings;
      return { status: "ok" };
    },
  };
  window.top = window;
  window.self = window;
  let observerOptions: unknown;
  const context = vm.createContext({
    window, document, localStorage: storage,
    navigator: { userAgent: "Windows", language: "en-US" },
    performance: { getEntriesByType: () => [] },
    setTimeout: () => 1, clearTimeout() {},
    setInterval: (_callback: unknown, delay: number) => { intervals.push(delay); return intervals.length; },
    clearInterval() {},
    requestAnimationFrame: (callback: () => void) => { frames.push(callback); return frames.length; },
    cancelAnimationFrame() {},
    MutationObserver: class { observe(_target: unknown, options: unknown) { observerOptions = options; } disconnect() {} },
    console,
  });
  const instrumented = source.replace(
    "  window.codexPlus = buildCodexPlusExtensionApi();",
    `  window.codexPlus = buildCodexPlusExtensionApi();
       window.testRuntime = { settings: codexPlusSettings, heartbeat: syncBackendSettingsFromHeartbeat,
         scan, set: setCodexPlusSetting };`,
  );
  vm.runInContext(instrumented, context);
  for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
  for (const frame of frames.splice(0)) frame();
  return {
    window, context, settings, listeners, intervals, routes, queries, observerOptions,
    async reinject() {
      vm.runInContext(instrumented, context);
      for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
      for (const frame of frames.splice(0)) frame();
    },
  };
}

test("production renderer ignores legacy flags and starts only marketplace and bridge health", async () => {
  const runtime = await start();
  const effective = runtime.window.testRuntime.settings();
  for (const [key, value] of Object.entries(effective)) {
    if (typeof value === "boolean") assert.equal(value, key === "pluginMarketplaceUnlock", key);
  }
  assert.equal(effective.typingEffect, "off");
  assert.deepEqual(runtime.intervals, [5000]);
  assert.deepEqual(runtime.listeners.sort(), ["document:visibilitychange", "window:message", "window:message"]);
  assert.ok(runtime.routes.every((route) => ["/settings/get", "/backend/status", "/diagnostics/log"].includes(route)), runtime.routes.join(", "));
  assert.equal(runtime.window.__codexSessionDeleteScanFailures, undefined);
  assert.equal(runtime.window.__codexPluginBuildFlavorFilterPatch, "17");
  assert.equal(runtime.window.codexPlus.apiVersion, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.observerOptions)), {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["disabled", "aria-disabled", "data-disabled"],
  });
  runtime.window.testRuntime.set("sessionDelete", true);
  assert.equal(runtime.window.testRuntime.settings().sessionDelete, false);
});

test("both marketplace switches prevent installation and disable an installed filter after heartbeat", async () => {
  for (const [master, marketplace] of [[false, true], [true, false], [false, false]]) {
    const runtime = await start(master, marketplace);
    assert.equal(runtime.window.testRuntime.settings().pluginMarketplaceUnlock, false);
    assert.equal(runtime.window.__codexPluginBuildFlavorFilterPatch, undefined);
  }
  for (const key of ["enhancementsEnabled", "codexAppPluginMarketplaceUnlock"]) {
    const runtime = await start();
    const filtered = () => vm.runInContext(`(() => {
      const official = name => name === "openai-curated", current = "other";
      return [{marketplaceName:"openai-curated"}, {marketplaceName:"other"}]
        .filter(p => !official(p.marketplaceName) || p.marketplaceName === current).length;
    })()`, runtime.context);
    assert.equal(filtered(), 2);
    runtime.settings[key] = false;
    await runtime.window.testRuntime.heartbeat();
    assert.equal(filtered(), 1);
    runtime.settings[key] = true;
    await runtime.window.testRuntime.heartbeat();
    assert.equal(filtered(), 2);
    await runtime.reinject();
    runtime.settings[key] = false;
    await runtime.window.testRuntime.heartbeat();
    assert.equal(filtered(), 1, "existing patches must use settings from the latest injection");
  }
});
