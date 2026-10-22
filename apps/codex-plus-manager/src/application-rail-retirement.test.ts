import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("./App.tsx");
const commands = read("../src-tauri/src/commands.rs");
const handlers = read("../src-tauri/src/lib.rs");

test("application rail and retired pages cannot be navigated to", () => {
  for (const name of ["ApplicationRail", "ToolSwitcher", "RecommendationsScreen", "AboutScreen", "SettingsScreen", "AgentCacheScreen", "AgentCollaborationPage", "UpdateDialog", "PluginMarketScreen"]) {
    assert.doesNotMatch(app, new RegExp(`\\b${name}\\b`), name);
  }
  const source = ts.createSourceFile("App.tsx", app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const route = source.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === "Route");
  assert.ok(route);
  const routeText = route.getText(source);
  for (const id of ["recommendations", "agentCache", "agentCollaboration", "about", "settings", "maintenance", "pluginMarket"]) {
    assert.ok(!routeText.includes(`"${id}"`), id);
  }
  for (const id of ["overview", "relay", "context", "skills", "sessions", "enhance"]) {
    assert.ok(routeText.includes(`"${id}"`), id);
  }
  assert.match(app, /<div className="shell">/);
  assert.doesNotMatch(app, /app-rail|global-workspace|toggleTheme|setLanguage|codex-plus-theme/);
});

test("retired commands and modules have no implementation or invoke handler", () => {
  for (const command of ["list_tools", "load_ads", "scan_agent_cache", "clean_agent_cache", "check_update", "perform_update", "startup_options", "read_latest_logs", "clear_logs", "copy_diagnostics", "export_settings", "preview_import_settings", "set_settings_path", "reset_settings_path", "reset_settings", "reset_image_overlay_settings", "update_tray_labels", "refresh_plugin_market", "install_plugin_market_item", "plugin_market_install_status"]) {
    assert.doesNotMatch(commands, new RegExp(`pub (?:async )?fn ${command}\\(`), command);
    assert.ok(!handlers.includes(`commands::${command},`), command);
    assert.ok(!app.includes(`"${command}"`), command);
  }
  const core = read("../../../crates/codex-plus-core/src/lib.rs");
  for (const module of ["ads", "agent_cache", "agent_collaboration", "update"]) {
    assert.ok(!core.includes(`pub mod ${module};`), module);
  }
  for (const command of ["load_settings", "save_settings", "launch_codex_plus"]) {
    assert.ok(handlers.includes(`commands::${command},`), command);
  }
});

test("manager has two columns and fixed light colors without the deleted rail", () => {
  const css = read("./styles.css");
  assert.match(css, /grid-template-columns: 232px minmax\(0, 1fr\)/);
  assert.match(css, /grid-template-columns: 68px minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /\.app-rail\b|\.tool-switcher\b|\.dark\b|\.light\b|color-scheme: dark/);
});

test("reinjection tears down the old overlay without reinstalling it", () => {
  const source = read("../../../assets/inject/renderer-inject/00-prelude.js");
  const start = source.indexOf("  // 热重注入时清理旧版本覆盖层");
  const end = source.indexOf("  window.__codexThreadScrollSyncRevision", start);
  assert.ok(start >= 0 && end > start);
  const keys = ["__codexPlusImageOverlayReadyCleanup", "__codexPlusImageOverlayGeometryCleanup", "__codexPlusImageOverlayCleanup"];
  const calls: string[] = [];
  const window = Object.fromEntries(keys.map((key) => [key, () => {
    calls.push(key);
    if (key.includes("Geometry")) throw new Error("stale runtime");
  }]));
  let removed = false;
  new Function("window", "document", source.slice(start, end))(window, {
    getElementById(id: string) {
      assert.equal(id, "codex-plus-image-overlay");
      return { remove() { removed = true; } };
    },
  });
  assert.deepEqual(calls, keys);
  for (const key of keys) assert.equal(window[key], null);
  assert.equal(removed, true);
  assert.doesNotMatch(source, /installCodexPlusImageOverlay|scheduleCodexPlusImageOverlay|__CODEX_PLUS_IMAGE_OVERLAY__/);
});
