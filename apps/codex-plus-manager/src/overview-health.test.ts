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
  assert.match(css, /\.overview-health-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test("overview shows the saved application path once and keeps both picker modes", () => {
  const screen = functionSource("OverviewScreen");
  assert.match(screen, /t\("Codex 应用路径"\)/);
  assert.match(screen, /settings\?\.settings\.codexAppPath/);
  assert.match(screen, /StatusRow title=\{t\("当前识别"\)\} status=\{overview\?\.codex_app\.status\}/);
  assert.match(screen, /path=\{savedCodexAppPath \|\| null\}/);
  assert.doesNotMatch(screen, /<Input|<Field|<Panel|<CardContent/);
  assert.match(screen, /actions\.chooseCodexAppPath\("folder"\)/);
  assert.match(screen, /actions\.chooseCodexAppPath\("file"\)/);
  assert.match(screen, /actions\.clearCodexAppPath\(\)/);
  assert.equal((screen.match(/disabled=\{!settings\}/g) ?? []).length, 2);
  assert.match(screen, /disabled=\{!settings \|\| !savedCodexAppPath\}/);
  assert.match(functionSource("App"), /<OverviewScreen\s+overview=\{overview\}\s+settings=\{settings\}/);
});

type ElementFixture = {
  type: string;
  props: Record<string, any>;
  children: Array<ElementFixture | string | null>;
};

function renderOverview(overview: unknown, savedPath: string | null = null) {
  const calls: string[] = [];
  const scope = {
    React: {
      createElement: (type: string, props: Record<string, unknown> | null, ...children: ElementFixture["children"]) =>
        ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    },
    t: (value: string) => value,
    useState: (value: unknown) => [value, () => {}],
    useRef: (value: unknown) => ({ current: value }),
    ...Object.fromEntries(["Button", "Badge", "StatusRow", "FeatureToggle", "RefreshCw", "Package", "Monitor", "Server", "Cable",
      "FolderOpen", "FileCode2", "Trash2"].map((name) => [name, name])),
  };
  const code = ts.transpileModule(`${functionSource("healthItems")}\n${functionSource("OverviewScreen")}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const render = new Function(...Object.keys(scope), `${code}\nreturn OverviewScreen;`)(...Object.values(scope));
  const root: ElementFixture = render({
    overview,
    settings: savedPath === null ? null : { settings: { codexAppPath: savedPath } },
    form: { enhancementsEnabled: true, codexAppPluginMarketplaceUnlock: true },
    actions: {
      refreshCurrent: () => calls.push("refresh"),
      chooseCodexAppPath: (mode: string) => calls.push(mode),
      clearCodexAppPath: () => calls.push("clear"),
    },
  });
  const nodes: ElementFixture[] = [];
  const visit = (node: ElementFixture | string | null) => {
    if (!node || typeof node !== "object") return;
    nodes.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  return { nodes, calls };
}

test("overview renders all health states, full paths and accessible compact tools", () => {
  const path = `G:\\${"Long application directory\\".repeat(15)}Codex.exe`;
  for (const overview of [null, {
    codex_version: "1.2.3",
    codex_app: { status: "found", path },
    runtime_health: {
      local_server: { status: "running", address: "http://127.0.0.1:57321", message: "ready" },
      debugger: { status: "connected", address: "http://127.0.0.1:9229", message: "connected" },
      protocol_conversion_enabled: true,
    },
  }]) {
    const { nodes, calls } = renderOverview(overview, path);
    assert.equal(nodes.filter((node) => node.props.role === "listitem").length, 4);
    assert.deepEqual(nodes.filter((node) => node.type === "Badge").map((node) => node.props.status),
      overview ? ["ok", "found", "running", "connected"] : Array(4).fill("not_checked"));
    const labels = nodes.filter((node) => node.props.className === "overview-health-label");
    assert.deepEqual(labels.map((node) => (node.children[0] as ElementFixture).type), ["Package", "Monitor", "Server", "Cable"]);
    const paths = nodes.filter((node) => node.type === "StatusRow");
    assert.equal(paths.length, 2);
    assert.equal(paths[0].props.path, path);
    assert.equal(paths[1].props.path, overview?.codex_app.path);
    const tools = nodes.filter((node) => node.type === "Button");
    assert.deepEqual(tools.map((node) => node.props["aria-label"]), ["刷新状态", "选择应用目录", "选择 Codex.exe", "清除保存路径"]);
    for (const tool of tools) {
      assert.equal(tool.props.size, "icon");
      assert.equal(tool.props.title, tool.props["aria-label"]);
      assert.ok(!tool.props.disabled);
      tool.props.onClick();
    }
    assert.deepEqual(calls, ["refresh", "folder", "file", "clear"]);
  }
});

test("path tools stay disabled while loading and clear requires a saved path", () => {
  for (const savedPath of [null, "", "G:\\Codex.exe"]) {
    const { nodes } = renderOverview(null, savedPath);
    const tools = nodes.filter((node) => node.type === "Button").slice(1);
    assert.deepEqual(tools.map((node) => node.props.disabled),
      [savedPath === null, savedPath === null, !savedPath]);
  }
});

test("overview layout groups individual health items with wrapping details and a narrow single column", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  assert.match(css, /\.overview-health-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto/);
  assert.match(css, /\.overview-health-detail\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /@media \(max-width: 760px\)\s*\{\s*\.overview-health-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.overview-app-path \.status-row code\s*\{[^}]*grid-column:\s*1 \/ -1/);
});

test("status styling keeps idle states neutral without suppressing failures or missing applications", () => {
  const scope = {
    React: {
      createElement: (type: string, props: Record<string, unknown>, ...children: unknown[]) => ({ type, props, children }),
    },
    UiBadge: "UiBadge",
    t: (value: string) => value,
  };
  const code = ts.transpileModule(
    ["statusLabel", "statusClass", "Badge"].map(functionSource).join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } },
  ).outputText;
  const render = new Function(...Object.keys(scope), `${code}\nreturn Badge;`)(...Object.values(scope));
  for (const [status, label, tone] of [
    ["stopped", "未运行", "warn"], ["not_checked", "未检查", "warn"],
    ["disconnected", "未连接", "warn"], ["failed", "失败", "bad"],
    ["missing", "缺失", "bad"], ["running", "运行中", "good"],
  ]) {
    const badge = render({ status });
    assert.equal(badge.props["data-status"], status);
    assert.equal(badge.props.className, tone);
    assert.deepEqual(badge.children, [label]);
  }
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const neutralRule = css.match(/\.overview-page \[data-status\]:is\(([^)]+)\)[^{]+\{([^}]+)\}/);
  assert.ok(neutralRule);
  assert.doesNotMatch(neutralRule[1], /failed|missing|degraded|running/);
  for (const status of ["not_checked", "stopped", "disconnected", "disabled", "unknown"]) {
    assert.ok(neutralRule[1].includes(`[data-status="${status}"]`));
  }
  assert.match(neutralRule[2], /color:\s*hsl\(var\(--muted-foreground\)\)/);
  assert.match(css, /\.overview-marketplace-status\[data-failed\]\s*\{[^}]*--status-error/);
});

test("macOS-inspired palette retains readable text contrast and visible keyboard focus", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const luminance = (name: string) => {
    const value = css.match(new RegExp(`--${name}:\\s*([\\d.]+) ([\\d.]+)% ([\\d.]+)%;`));
    assert.ok(value, `${name} must be an HSL color token`);
    const hue = Number(value[1]), saturation = Number(value[2]) / 100, lightness = Number(value[3]) / 100;
    const channel = (offset: number) => {
      const k = (offset + hue / 30) % 12;
      const color = lightness - saturation * Math.min(lightness, 1 - lightness) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return color <= 0.04045 ? color / 12.92 : ((color + 0.055) / 1.055) ** 2.4;
    };
    return channel(0) * 0.2126 + channel(8) * 0.7152 + channel(4) * 0.0722;
  };
  const contrast = (a: string, b: string) => {
    const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  assert.ok(contrast("foreground", "shell-bg") >= 7);
  assert.ok(contrast("muted-foreground", "shell-bg") >= 4.5);
  assert.ok(contrast("primary", "primary-foreground") >= 4.5);
  assert.ok(contrast("ring", "shell-bg") >= 3);
  assert.match(css, /input:focus-visible ~ \.toggle-switch-visual\s*\{[^}]*outline:\s*2px solid hsl\(var\(--ring\)\)/);
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
