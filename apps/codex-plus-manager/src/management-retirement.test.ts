import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("proxy settings, request history and user scripts have no manager page or dedicated command", () => {
  const app = read("./App.tsx");
  for (const name of ["ProxySettingsScreen", "RequestLogScreen", "UserScriptsScreen", "ScriptMarketResult", "RelayEnvironmentScreen"]) {
    assert.doesNotMatch(app, new RegExp(`\\b${name}\\b`));
  }
  const source = ts.createSourceFile("App.tsx", app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const route = source.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === "Route");
  assert.ok(route);
  for (const id of ["relayEnvironment", "requestLog", "userScripts"]) {
    assert.ok(!route.getText(source).includes(`"${id}"`));
  }
  const commands = read("../src-tauri/src/commands.rs");
  const handlers = read("../src-tauri/src/lib.rs");
  for (const command of [
    "check_relay_environment", "load_request_logs", "clear_request_logs",
    "refresh_script_market", "install_market_script", "refresh_user_script_inventory",
    "reload_user_scripts", "set_user_scripts_enabled", "set_user_scripts_skip_next_start",
    "set_user_script_enabled", "delete_user_script",
  ]) {
    assert.doesNotMatch(commands, new RegExp(`pub (?:async )?fn ${command}\\(`));
    assert.ok(!handlers.includes(`commands::${command},`));
    assert.ok(!app.includes(`"${command}"`));
  }
  assert.doesNotMatch(read("./styles.css"), /\.(?:request-log|proxy-provider|relay-environment|script-market|script-row)(?:-|\b)/);
  assert.match(handlers, /commands::load_relay_proxy,/);
  assert.match(handlers, /commands::refresh_plugin_market,/);
});

test("request history has no storage backend and script loading is absent from the launcher", () => {
  const core = read("../../../crates/codex-plus-core/src/lib.rs");
  assert.doesNotMatch(core, /pub mod (?:request_log|script_market|user_scripts|relay_environment);/);
  const metrics = read("../../../crates/codex-plus-core/src/request_metrics.rs");
  assert.doesNotMatch(metrics, /std::fs|OpenOptions|request-log\.jsonl|read_request_logs|append_request_log/);
  const launcher = read("../../codex-plus-launcher/src/main.rs");
  assert.doesNotMatch(launcher, /user_scripts|UserScriptManager|BOOTSTRAP_SCRIPT|script_market/);
  for (const file of ["user-scripts-runtime.js", "user-scripts-bootstrap.js"]) {
    assert.equal(existsSync(new URL(`../../../assets/inject/${file}`, import.meta.url)), false);
  }
  const renderer = read("../../../assets/inject/renderer-inject.js");
  assert.doesNotMatch(renderer, /\/(?:user-scripts|script-market)\/|function openCodexPlusExtensions|id: codexPlusRailExtensionsId/);
  assert.match(renderer, /document\.getElementById\(codexPlusRailExtensionsId\)\?\.remove\(\)/);
  assert.match(renderer, /const codexPlusExtensionConstants = \{/);
  assert.match(renderer, /window\.codexPlus = buildCodexPlusExtensionApi\(\)/);
});

test("reinjection releases old script resources once and isolates failing cleanup callbacks", () => {
  const source = read("../../../assets/inject/renderer-inject/00-prelude.js");
  const start = source.indexOf("  function retireLegacyUserScripts()");
  const end = source.indexOf("  function codexPlusStatsigClients()", start);
  assert.ok(start >= 0 && end > start);
  const calls: string[] = [];
  const window: Record<string, unknown> = {
    __codexPlusUserScripts: {
      scripts: {
        first: { cleanups: [() => calls.push("first")] },
        second: { cleanups: [() => { calls.push("second"); throw new Error("stale script"); }] },
        legacy: {},
      },
    },
    __codexPlusUserScriptsBootstrap: true,
    codexPlus: { constants: { pageClass: "public-contract" } },
  };
  const cleanup = new Function("window", source.slice(start, end));
  cleanup(window);
  cleanup(window);
  assert.deepEqual(calls, ["second", "first"]);
  assert.deepEqual(window, { codexPlus: { constants: { pageClass: "public-contract" } } });
});
