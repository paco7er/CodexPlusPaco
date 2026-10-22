import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const text = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const app = ts.createSourceFile("App.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function functionSource(name: string) {
  const declaration = app.statements.find(
    (statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  assert.ok(declaration, `${name} should exist`);
  return declaration.getText(app);
}

test("overview merges the local server and protocol conversion and keeps the debugger", () => {
  const screen = functionSource("OverviewScreen");
  const items = functionSource("healthItems");
  assert.match(screen, /t\("Codex 版本"\)/);
  assert.match(items, /t\("Codex 应用"\)/);
  assert.doesNotMatch(screen + items, /management_shortcut|Codex\+\+ 应用入口|actions\.(checkHealth|repairShortcuts)/);
  for (const title of ["本地服务器状态", "调试连接状态"]) {
    assert.ok(items.includes(`t("${title}")`));
  }
  assert.match(items, /runtime_health/);
  assert.match(items, /协议转换已启用/);
  assert.match(items, /协议转换未启用/);
  assert.doesNotMatch(items, /后台服务状态|代理服务器状态|proxy_server/);
  assert.match(screen, /overview-health-grid/);
  assert.doesNotMatch(screen, /最近启动|LatestLaunch/);
  const entry = functionSource("App");
  assert.match(entry, /codexAppRunning \? actions\.restart\(\) : actions\.launch\(\)/);
  assert.match(entry, /runtime_health\?\.codex_app/);
  assert.match(entry, /codex-app-state/);
  assert.doesNotMatch(entry, /<span>Codex APP<\/span>/);
  assert.match(entry, /Codex \{statusLabel\(overview\?\.runtime_health\?\.codex_app\?\.status/);
  assert.doesNotMatch(entry, /aria-label=\{t\("刷新状态"\)\}/);
  assert.match(screen, /overview-health-header-actions/);
  assert.match(screen, /aria-label=\{t\("刷新状态"\)\}/);
  assert.match(screen, /actions\.refreshCurrent/);
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  assert.match(css, /\.overview-health-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test("overview contains the saved application path and both picker modes", () => {
  const screen = functionSource("OverviewScreen");
  assert.match(screen, /t\("Codex 应用路径"\)/);
  assert.match(screen, /settings\?\.settings\.codexAppPath/);
  assert.match(screen, /StatusRow title=\{t\("当前识别"\)\} status=\{overview\?\.codex_app\.status\}/);
  assert.match(screen, /value=\{savedCodexAppPath\}/);
  assert.match(screen, /readOnly/);
  assert.match(screen, /actions\.chooseCodexAppPath\("folder"\)/);
  assert.match(screen, /actions\.chooseCodexAppPath\("file"\)/);
  assert.match(screen, /actions\.clearCodexAppPath\(\)/);
  assert.equal((screen.match(/disabled=\{!settings\}/g) ?? []).length, 3);
  assert.match(functionSource("App"), /<OverviewScreen\s+overview=\{overview\}\s+settings=\{settings\}/);
});

test("retired settings commands are not exposed while shared configuration remains", () => {
  const entry = functionSource("App");
  assert.doesNotMatch(entry, /export_settings|preview_import_settings|set_settings_path|reset_settings_path/);
  assert.match(entry, /"load_settings"/);
  assert.match(entry, /"save_settings"/);
});

test("maintenance page and its dedicated controls are retired", () => {
  assert.doesNotMatch(text, /MaintenanceScreen|"maintenance"|t\("安装维护"\)|nav-section-bottom/);
  const entry = functionSource("App");
  assert.doesNotMatch(entry, /install_entrypoints|uninstall_entrypoints|removeOwnedData|installEntrypoints|uninstallEntrypoints/);
  assert.doesNotMatch(entry, /checkHealth|repairShortcuts|setWatcher|refreshWatcher|launchForm|setAutoTakeover|refreshAutoTakeover/);
});

test("existing startup settings keep their backend commands", () => {
  const lib = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  assert.match(lib, /commands::set_watcher_enabled,/);
  const commands = readFileSync(new URL("../src-tauri/src/commands.rs", import.meta.url), "utf8");
  assert.match(commands, /pub fn set_watcher_enabled\(enabled: bool\)/);
  assert.match(commands, /pub fn set_watcher_start_codex\(start_codex: bool\)/);
  assert.match(commands, /pub fn set_watcher_start_codex_on_open\(enabled: bool\)/);
  assert.match(lib, /commands::set_watcher_start_codex,/);
  assert.match(lib, /commands::set_watcher_start_codex_on_open,/);
});

function expression(name: string) {
  let result: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if ((ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) && node.name.getText(app) === name) {
      result = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(app);
  assert.ok(result, name);
  return ts.transpileModule(`const action = ${result.getText(app)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
}

function action(name: string, scope: Record<string, unknown>) {
  return new Function(...Object.keys(scope), `${expression(name)}\nreturn action;`)(...Object.values(scope));
}

test("path saves use shared settings persistence and refresh detection only after success", async () => {
  const draft = { revision: "current", codexAppPath: "old", enhancementsEnabled: true };
  const writes: unknown[] = [];
  const refreshes: boolean[] = [];
  let succeeds = true;
  const save = action("saveCodexAppPath", {
    settingsForm: draft,
    saveSettingsValue: async (next: unknown) => { writes.push(next); return succeeds ? next : null; },
    refreshOverview: async (silent: boolean) => { refreshes.push(silent); },
  });
  assert.deepEqual(await save("G:\\Portable Codex\\app"), { ...draft, codexAppPath: "G:\\Portable Codex\\app" });
  succeeds = false;
  assert.equal(await save(""), null);
  assert.deepEqual(writes, [{ ...draft, codexAppPath: "G:\\Portable Codex\\app" }, { ...draft, codexAppPath: "" }]);
  assert.deepEqual(refreshes, [true]);
});

test("pickers preserve file filters, handle cancellation and never report a failed save as success", async () => {
  const options: Array<{ directory: boolean; filters?: unknown }> = [];
  const paths: string[] = [];
  const notices: unknown[][] = [];
  let selection: string | null = " G:\\Portable Codex\\app ";
  let succeeds = true;
  let pickerFails = false;
  const choose = action("chooseCodexAppPath", {
    t: (value: string) => value,
    tf: (value: string, detail: string) => value.replace("{0}", detail),
    open: async (value: { directory: boolean }) => {
      options.push(value);
      if (pickerFails) throw new Error("picker unavailable");
      return selection;
    },
    saveCodexAppPath: async (path: string) => { paths.push(path); return succeeds ? {} : null; },
    showNotice: (...args: unknown[]) => { notices.push(args); },
  });
  await choose("folder");
  assert.equal(options[0].directory, true);
  assert.deepEqual(paths, ["G:\\Portable Codex\\app"]);
  assert.equal(notices.length, 1);
  succeeds = false;
  await choose("file");
  assert.equal(options[1].directory, false);
  assert.deepEqual(options[1].filters, [{ name: "Codex 应用", extensions: ["exe", "app"] }]);
  assert.equal(notices.length, 1);
  selection = null;
  await choose("folder");
  assert.equal(paths.length, 2);
  pickerFails = true;
  await choose("file");
  assert.equal(notices[1][2], "failed");
  assert.match(String(notices[1][1]), /picker unavailable/);
});

test("clearing the saved path restores automatic detection only after persistence succeeds", async () => {
  const paths: string[] = [];
  const notices: unknown[][] = [];
  let succeeds = false;
  const clear = action("clearCodexAppPath", {
    t: (value: string) => value,
    saveCodexAppPath: async (path: string) => { paths.push(path); return succeeds ? {} : null; },
    showNotice: (...args: unknown[]) => { notices.push(args); },
  });
  await clear();
  assert.deepEqual(notices, []);
  succeeds = true;
  await clear();
  assert.deepEqual(paths, ["", ""]);
  assert.equal(notices[0][2], "ok");
});

test("launch and restart read the persisted path and retain their default ports", async () => {
  for (const path of ["G:\\Portable Codex\\app", ""]) {
    const calls: unknown[][] = [];
    const launch = action("launchCommand", {
      settings: { settings: { codexAppPath: path } },
      run: (task: () => unknown) => task(),
      call: (...args: unknown[]) => { calls.push(args); },
    });
    await launch("launch_codex_plus");
    await launch("restart_codex_plus", true);
    assert.deepEqual(calls, [
      ["launch_codex_plus", { request: { appPath: path, debugPort: 9229, helperPort: 57321, syncActiveRelay: false } }],
      ["restart_codex_plus", { request: { appPath: path, debugPort: 9229, helperPort: 57321, syncActiveRelay: true } }],
    ]);
  }
});
