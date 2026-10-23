import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const appSource = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
const app = ts.createSourceFile("App.tsx", appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function descendants(node: ts.Node): ts.Node[] {
  const result: ts.Node[] = [];
  const visit = (child: ts.Node) => {
    result.push(child);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return result;
}

function component(name: string): ts.FunctionDeclaration {
  const declaration = app.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration && ts.isFunctionDeclaration(declaration), `missing ${name}`);
  return declaration;
}

function elements(node: ts.Node): Array<ts.JsxOpeningElement | ts.JsxSelfClosingElement> {
  return descendants(node).filter((child): child is ts.JsxOpeningElement | ts.JsxSelfClosingElement =>
    ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child),
  );
}

function attribute(element: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string): string | undefined {
  const property = element.attributes.properties.find((node) => ts.isJsxAttribute(node) && node.name.getText(app) === name);
  if (!property || !ts.isJsxAttribute(property)) return undefined;
  const initializer = property.initializer;
  if (initializer && ts.isJsxExpression(initializer)) return initializer.expression?.getText(app);
  return initializer && ts.isStringLiteral(initializer) ? initializer.text : undefined;
}

function fieldControl(node: ts.Node, expression: string) {
  const control = elements(node).find((element) =>
    attribute(element, "value") === expression || attribute(element, "checked") === expression,
  );
  assert.ok(control, `missing editable control for ${expression}`);
  assert.ok(attribute(control, "onChange"), `${expression} must remain editable`);
  return control;
}

function isConditional(node: ts.Node, boundary: ts.Node): boolean {
  for (let parent = node.parent; parent && parent !== boundary; parent = parent.parent) {
    if (ts.isConditionalExpression(parent) || (ts.isBinaryExpression(parent)
      && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(parent.operatorToken.kind))) return true;
  }
  return false;
}

function eventHandlerNodes(component: ts.Node, element: ts.JsxOpeningElement | ts.JsxSelfClosingElement, event: string): ts.Node[] {
  const property = element.attributes.properties.find((node) => ts.isJsxAttribute(node) && node.name.getText(app) === event);
  assert.ok(property && ts.isJsxAttribute(property) && property.initializer && ts.isJsxExpression(property.initializer));
  const expression = property.initializer.expression;
  assert.ok(expression, `missing ${event} handler`);
  const result = descendants(expression);
  const visited = new Set<string>();
  for (let index = 0; index < result.length; index += 1) {
    const node = result[index];
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || visited.has(node.expression.text)) continue;
    visited.add(node.expression.text);
    const declaration = descendants(component).find((candidate) => ts.isVariableDeclaration(candidate)
      && ts.isIdentifier(candidate.name) && candidate.name.text === node.expression.getText(app));
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) result.push(...descendants(declaration.initializer));
  }
  return result;
}

test("retired enhancements have no settings, navigation or command references in the manager UI", () => {
  const retired = new Set([
    "codexAppZedRemoteOpen", "zedRemoteOpenStrategy", "zedRemoteProjectRegistryEnabled", "zedRemoteSyncToZedSettings",
    "codexAppUpstreamWorktreeCreate", "codexAppNativeMenuLocalization",
    "codexAppFastStartup", "快速启动",
    "codexAppServiceTierControls", "Fast 按钮",
    "ZedRemoteScreen", "ZedRemoteProjectSection", "zedRemote", "list_zed_remote_projects", "open_zed_remote", "forget_zed_remote_project",
    "launchMode", "LaunchMode", "ModeSelector", "saveLaunchMode", "setLaunchMode", "patchMode",
    "repairPluginMarketplace", "refreshRemotePluginMarketplace", "repairRemotePluginMarketplace",
    "PluginMarketplaceRepairResult", "PluginMarketplaceStatusResult", "RemotePluginMarketplaceResult",
    "pluginMarketplaceProgress", "remotePluginMarketplace", "remotePluginMarketplaceProgress",
    "setPluginMarketplaceProgress", "setRemotePluginMarketplace", "setRemotePluginMarketplaceProgress",
    "repair_plugin_marketplace", "plugin_marketplace_status", "remote_plugin_marketplace_status", "repair_remote_plugin_marketplace",
    "修复插件市场", "官方远端插件缓存", "插件市场修复进度", "官方远端插件缓存进度", "释放并注册内置缓存",
    "DictationSettingsPanel", "StepwiseSettingsPanel", "DictationLocalModelState", "GlobalDictationHotkeyState",
    "enhancementTab", "setEnhancementTab", "pendingEnhancementSection", "ENHANCEMENT_SECTION_IDS",
    "dictationSettingsIssue", "dictationSettingsValidationMessage",
    "语音输入", "下一步建议", "语音服务预设", "下载本地模型", "保存全局热键",
    "testStepwiseSettings", "test_stepwise_settings", "download_dictation_local_model",
    "dictation_local_model_status", "load_global_dictation_hotkey", "set_global_dictation_hotkey",
    "StandaloneModeGroup", "WhaleBalanceSettingsFields", "whaleBalanceValidationMessage",
    "whaleBalanceSettingsIssue", "supportsPetRealMouseLook", "setPersistedEnhanceFlag",
    "挂件与桌宠", "独立模式", "Codex 用量挂件", "活动进度条右侧布局", "桌宠跟随真实鼠标", "官方额度解锁",
    "API 余额（可选）", "如果使用官方模式或官方混入 API 模式，通常不需要开启插件市场解锁。",
    "对话与输入", "Markdown 导出", "粘贴修复", "强制中文界面", "容量错误自动重试",
    "打字特效（彩虹 P）", "会话 ID 标识", "对话居中宽度", "切换对话保留位置", "用量状态栏",
    "FeatureGroup", "插件与模型", "NativeBrowserStatusView", "nativeBrowserConsent", "isWindowsPlatform",
    "原生 Edge / Chrome 请求标识兼容（实验）", "模型白名单解锁", "原生 Fast 强制解锁",
  ]);
  const references = descendants(app)
    .filter((node) => ts.isIdentifier(node) || ts.isStringLiteral(node))
    .map((node) => (node as ts.Identifier | ts.StringLiteral).text)
    .filter((name) => retired.has(name));
  assert.deepEqual([...new Set(references)], []);
});

test("overview shows one marketplace switch reflecting both persisted flags", () => {
  const enhance = component("OverviewScreen");
  const toggles = elements(enhance).filter((element) => element.tagName.getText(app) === "FeatureToggle");
  assert.equal(toggles.length, 1);
  assert.equal(attribute(toggles[0], "checked"), "form.enhancementsEnabled && form.codexAppPluginMarketplaceUnlock");
  assert.equal(attribute(toggles[0], "disabled"), "!settings || savingMarketplace");
  assert.equal(attribute(toggles[0], "title"), 't("插件市场解锁")');
  assert.equal(isConditional(toggles[0], enhance), false, "marketplace unlock stays visible when enhancements are off");

  const visibleEnglish = descendants(app).filter((node) => ts.isStringLiteral(node)
    || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)).filter((node) => /Stepwise/.test(node.getText(app)));
  assert.deepEqual(visibleEnglish.map((node) => node.getText(app)), [], "internal Stepwise fields stay compatible but visible names must use Chinese");
});

test("marketplace setting follows the app path without a dedicated enhancement screen", () => {
  const enhance = component("OverviewScreen");
  assert.ok(!elements(enhance).some((element) => ["tab", "tablist", "tabpanel"].includes(attribute(element, "role") ?? "")));
  const general = elements(enhance).find((element) => attribute(element, "className") === "overview-marketplace");
  const path = elements(enhance).find((element) => attribute(element, "className") === "overview-app-path");
  assert.ok(general);
  assert.ok(path && path.pos < general.pos);
  assert.equal(attribute(general, "hidden"), undefined);
  assert.equal(isConditional(general, enhance), false);
  const calls = descendants(enhance).filter(ts.isCallExpression);
  assert.ok(calls.some((node) => node.expression.getText(app) === "actions.saveSettingsValue"));
  assert.ok(!app.statements.some((node) => ts.isFunctionDeclaration(node)
    && ["SettingsScreen", "EnhanceScreen"].includes(node.name?.text ?? "")));
  assert.doesNotMatch(appSource, /t\("Codex增强"\)|t\("扩展"\)|t\("保存增强设置"\)/);
  const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(styles, /\.enhance-tabs\b|\.enhance-tab-panel\b|\.enhance-service-|\.stepwise-settings-|\.stepwise-advanced\b/);
});

test("retired service panels have no dedicated manager commands while runtime configuration stays compatible", () => {
  const commands = readFileSync(new URL("../src-tauri/src/commands.rs", import.meta.url), "utf8");
  const handlers = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  for (const command of ["test_stepwise_settings", "dictation_local_model_status", "download_dictation_local_model", "load_global_dictation_hotkey", "set_global_dictation_hotkey"]) {
    assert.doesNotMatch(commands, new RegExp(`pub (?:async )?fn ${command}\\(`));
    assert.ok(!handlers.includes(`commands::${command},`));
  }
  assert.match(appSource, /dictation: normalizeDictationSettings\(settings\.dictation\)/);
  assert.match(appSource, /codexAppStepwiseEnabled: boolean;/);
});

test("marketplace saving has an accessible status instead of a second save action", () => {
  const overview = component("OverviewScreen");
  const saves = elements(overview).filter((element) => attribute(element, "onClick")?.includes("actions.saveSettings("));
  assert.equal(saves.length, 0);
  const status = elements(overview).find((element) => attribute(element, "className") === "overview-marketplace-status");
  assert.ok(status);
  assert.equal(attribute(status, "role"), "status");
  assert.equal(attribute(status, "aria-live"), "polite");
});

test("retired enhancement controls do not reappear in overview", () => {
  const enhance = component("OverviewScreen");
  const controls = elements(enhance);
  assert.ok(!controls.some((element) => attribute(element, "title") === 't("会话删除")'));
  for (const field of ["codexAppWhaleWidgetEnabled", "codexAppWhaleBalanceProtocol", "codexAppWhaleBalancePath", "codexAppWhaleBalanceField",
    "codexAppWhaleBalanceCurrency", "codexAppWhaleBalanceScale", "codexAppPetRealMouseLook", "codexAppActivityOverlayRight", "codexAppStandaloneQuotaUnlock",
    "codexAppSessionDelete", "codexAppMarkdownExport", "codexAppPasteFix", "codexAppForceChineseLocale", "codexAppCapacityAutoRetry",
    "codexAppTypingEffect", "codexAppThreadIdBadge", "codexAppConversationView", "codexAppThreadScrollRestore", "codexAppUsageStatusLine",
    "codexAppNativeBrowserRequireIdentification", "codexAppModelWhitelistUnlock", "codexAppNativeFastUnlock"]) {
    assert.ok(!controls.some((element) => attribute(element, "checked") === `form.${field}` || attribute(element, "value") === `form.${field}`), field);
  }
  assert.ok(!controls.some((element) => attribute(element, "checked") === "form.enhancementsEnabled"));
});

test("marketplace toggle saves through the shared persistence action without the retired browser panel", () => {
  const enhance = component("OverviewScreen");
  const marketplace = fieldControl(enhance, "form.enhancementsEnabled && form.codexAppPluginMarketplaceUnlock");
  const handler = eventHandlerNodes(enhance, marketplace, "onChange");
  assert.ok(handler.some((node) => ts.isCallExpression(node) && node.expression.getText(app) === "actions.saveSettingsValue"));
  assert.doesNotMatch(appSource, /native-browser-settings|NativeBrowserStatusView/);
  assert.match(appSource, /codexAppNativeBrowserRequireIdentification: false,/);
  assert.match(appSource, /codexAppModelWhitelistUnlock: true,/);
  assert.match(appSource, /codexAppNativeFastUnlock: false,/);
});

function marketplaceAction(form: Record<string, unknown>, save: (value: Record<string, unknown>) => Promise<unknown>, loaded = true) {
  const declaration = descendants(component("OverviewScreen")).find((node) =>
    ts.isVariableDeclaration(node) && node.name.getText(app) === "updateMarketplaceUnlock");
  assert.ok(declaration && ts.isVariableDeclaration(declaration) && declaration.initializer);
  const code = ts.transpileModule(`const action = ${declaration.initializer.getText(app)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const pending = { current: false };
  const saving: boolean[] = [];
  const failed: boolean[] = [];
  const action = new Function("form", "settings", "marketplaceSavePending", "setSavingMarketplace",
    "setMarketplaceSaveFailed", "actions", `${code}\nreturn action;`)(
    form, loaded ? {} : null, pending, (value: boolean) => saving.push(value),
    (value: boolean) => failed.push(value), { saveSettingsValue: save },
  );
  return { action, pending, saving, failed };
}

test("single marketplace switch saves both flags and preserves unrelated settings", async () => {
  for (const master of [false, true]) {
    for (const marketplace of [false, true]) {
      for (const enabled of [false, true]) {
        const form = { revision: "current", enhancementsEnabled: master, codexAppPluginMarketplaceUnlock: marketplace,
          codexAppPath: "fixture-path", relayProfiles: [{ id: "fixture" }], codexAppNativeFastUnlock: true };
        const writes: unknown[] = [];
        const fixture = marketplaceAction(form, async (next) => { writes.push(next); return next; });
        await fixture.action(enabled);
        assert.deepEqual(writes, [{ ...form, enhancementsEnabled: enabled, codexAppPluginMarketplaceUnlock: enabled }]);
        assert.equal(form.enhancementsEnabled, master);
        assert.equal(form.codexAppPluginMarketplaceUnlock, marketplace);
        assert.deepEqual(fixture.saving, [true, false]);
        assert.deepEqual(fixture.failed, [false, false]);
        assert.equal(fixture.pending.current, false);
      }
    }
  }
});

test("marketplace saving blocks duplicate writes and allows retry after failure", async () => {
  let finish!: (value: unknown) => void;
  let writes = 0;
  const fixture = marketplaceAction({}, async () => {
    writes++;
    return new Promise((resolve) => { finish = resolve; });
  });
  const first = fixture.action(true);
  await fixture.action(false);
  assert.equal(writes, 1);
  assert.equal(fixture.pending.current, true);
  finish(null);
  await first;
  assert.equal(fixture.failed.at(-1), true);
  assert.equal(fixture.pending.current, false);
  const retry = fixture.action(true);
  finish({});
  await retry;
  assert.equal(writes, 2);
  assert.equal(fixture.failed.at(-1), false);

  const unloaded = marketplaceAction({}, async () => assert.fail("settings not loaded"), false);
  await unloaded.action(true);
  assert.deepEqual(unloaded.saving, []);
});
