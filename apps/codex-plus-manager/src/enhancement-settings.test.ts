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
  ]);
  const references = descendants(app)
    .filter((node) => ts.isIdentifier(node) || ts.isStringLiteral(node))
    .map((node) => (node as ts.Identifier | ts.StringLiteral).text)
    .filter((name) => retired.has(name));
  assert.deepEqual([...new Set(references)], []);
});

test("remaining enhancements use the master switch and keep their complete feature groups", () => {
  const enhance = component("EnhanceScreen");
  const toggles = elements(enhance).filter((element) => element.tagName.getText(app) === "FeatureToggle");
  assert.ok(toggles.length > 0);
  for (const toggle of toggles) assert.equal(attribute(toggle, "disabled"), "!masterEnabled");
  assert.equal(attribute(fieldControl(enhance, "form.codexAppPluginMarketplaceUnlock"), "disabled"), "!masterEnabled");
  const groups = elements(enhance).filter((element) => element.tagName.getText(app) === "FeatureGroup");
  assert.deepEqual(groups.map((element) => attribute(element, "title")), ['t("插件与模型")', 't("对话与输入")']);
  for (const group of groups) assert.equal(isConditional(group, enhance), false, "remaining groups stay visible when enhancements are off");

  const visibleEnglish = descendants(app).filter((node) => ts.isStringLiteral(node)
    || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)).filter((node) => /Stepwise/.test(node.getText(app)));
  assert.deepEqual(visibleEnglish.map((node) => node.getText(app)), [], "internal Stepwise fields stay compatible but visible names must use Chinese");
});

test("remaining enhancements display directly without retired panes or a single-item tab strip", () => {
  const enhance = component("EnhanceScreen");
  assert.ok(!elements(enhance).some((element) => ["tab", "tablist", "tabpanel"].includes(attribute(element, "role") ?? "")));
  const general = elements(enhance).find((element) => attribute(element, "className") === "enhance-general");
  assert.ok(general);
  assert.equal(attribute(general, "hidden"), undefined);
  assert.equal(isConditional(general, enhance), false);
  const calls = descendants(enhance).filter(ts.isCallExpression);
  assert.ok(calls.some((node) => node.expression.getText(app) === "actions.saveSettings"), "enhancements must retain their save action");
  assert.ok(!app.statements.some((node) => ts.isFunctionDeclaration(node) && node.name?.text === "SettingsScreen"));
  const screen = elements(app).find((element) => element.tagName.getText(app) === "EnhanceScreen");
  assert.ok(screen);
  assert.equal(attribute(screen, "activeTab"), undefined);
  assert.equal(attribute(screen, "onTabChange"), undefined);
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

test("enhancement saving is an explicit permanent top action", () => {
  const enhance = component("EnhanceScreen");
  const saves = elements(enhance).filter((element) => attribute(element, "onClick")?.includes("actions.saveSettings("));
  assert.equal(saves.length, 1);
  assert.equal(attribute(saves[0], "disabled"), "!dirty");
  assert.equal(isConditional(saves[0], enhance), false);
  const general = elements(enhance).find((element) => attribute(element, "className") === "enhance-general");
  assert.ok(general && saves[0].pos < general.pos);
});

test("retired widget and standalone controls cannot reappear or autosave from enhancements", () => {
  const enhance = component("EnhanceScreen");
  const controls = elements(enhance);
  for (const field of ["codexAppWhaleWidgetEnabled", "codexAppWhaleBalanceProtocol", "codexAppWhaleBalancePath", "codexAppWhaleBalanceField",
    "codexAppWhaleBalanceCurrency", "codexAppWhaleBalanceScale", "codexAppPetRealMouseLook", "codexAppActivityOverlayRight", "codexAppStandaloneQuotaUnlock"]) {
    assert.ok(!controls.some((element) => attribute(element, "checked") === `form.${field}` || attribute(element, "value") === `form.${field}`), field);
  }
  assert.ok(!descendants(enhance).filter(ts.isCallExpression)
    .some((node) => node.expression.getText(app) === "actions.saveSettingsValue"));
  assert.ok(!controls.some((element) => attribute(element, "className") === "hint-line enhance-footer-hint"));
});

test("native Fast unlock is the only Fast enhancement toggle and keeps the provider support notice", () => {
  const enhance = component("EnhanceScreen");
  const nativeFast = fieldControl(enhance, "form.codexAppNativeFastUnlock");
  assert.equal(nativeFast.tagName.getText(app), "FeatureToggle");
  assert.equal(attribute(nativeFast, "title"), 't("原生 Fast 强制解锁")');
  assert.equal(attribute(nativeFast, "disabled"), "!masterEnabled");
  assert.match(attribute(nativeFast, "detail") || "", /纯 API Key.*原生 Fast.*供应商决定/);
  const handler = eventHandlerNodes(enhance, nativeFast, "onChange");
  assert.ok(handler.some((node) => ts.isStringLiteral(node) && node.text === "codexAppNativeFastUnlock"));
  assert.match(appSource, /codexAppNativeFastUnlock: false,/);
  assert.ok(!elements(enhance).some((element) => attribute(element, "checked") === "form.codexAppServiceTierControls"));
});
