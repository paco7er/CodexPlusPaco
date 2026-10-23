import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const app = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const variables = ["defaultRelayProfile", "defaultSettings"];
const functions = ["normalizeSettings", "syncLegacyRelayFields", "activeRelayProfile", "clampNumber"];
const statements = app.statements.filter(node =>
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => variables.includes(item.name.getText(app))))
  || (ts.isFunctionDeclaration(node) && functions.includes(node.name?.text ?? "")));
const code = ts.transpileModule(statements.map(node => node.getText(app)).join("\n") +
  "\nglobalThis.defaults = defaultSettings;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture() {
  const context = vm.createContext({
    t: (value: string) => value,
    defaultWhaleBalanceSettings: () => ({}),
    defaultDictationSettings: () => ({}),
    emptyContextSelection: () => ({}),
    splitContextConfigText: (value: string) => ({ common: value, context: "" }),
    joinTomlSectionsRootFirst: (values: string[]) => values.filter(Boolean).join("\n"),
    contextSelectionForAllEntries: () => ({}),
    normalizeWhaleBalanceSettings: () => ({}),
    normalizeDictationSettings: (value: unknown) => value,
    normalizeTypingEffect: (value: unknown) => value,
    normalizeStepwiseProtocol: (value: unknown) => value,
    normalizeStepwiseGenerationMode: (value: unknown) => value,
    normalizeRelayProfile: (value: unknown) => value,
    hydrateAggregateRelayProfile: (value: unknown) => value,
    deriveRelayProfileFromFiles: (value: unknown) => value,
    isAggregateRelayProfile: () => false,
    normalizeAggregateProfilesFromRelayProfiles: () => [],
  });
  vm.runInContext(code, context);
  return context;
}

test("new settings and repeated normalization keep the provider list empty", () => {
  const f = fixture();
  assert.equal(f.defaults.relayProfiles.length, 0);
  assert.equal(f.defaults.activeRelayId, "");
  const first = f.normalizeSettings(f.defaults);
  const second = f.normalizeSettings(first);
  for (const settings of [first, second]) {
    assert.equal(settings.relayProfiles.length, 0);
    assert.equal(settings.activeRelayId, "");
    assert.equal(settings.aggregateRelayProfiles.length, 0);
  }
  assert.ok(f.activeRelayProfile(second), "内部兼容兜底不应成为列表中的记录");
  assert.equal(second.relayProfiles.length, 0);
});

test("explicit empty arrays do not revive a provider from legacy fields", () => {
  const f = fixture();
  const next = f.normalizeSettings({ ...f.defaults, relayProfiles: [], activeRelayId: "old",
    relayBaseUrl: "https://fixture.invalid", relayApiKey: "fixture-only" });
  assert.equal(next.relayProfiles.length, 0);
  assert.equal(next.activeRelayId, "");
  assert.equal(next.relayBaseUrl, "https://fixture.invalid");
  assert.equal(next.relayApiKey, "fixture-only");
});

test("saved providers and legacy single-provider settings remain available", () => {
  const f = fixture();
  const profile = { id: "saved", name: "已有供应商", baseUrl: "https://fixture.invalid", apiKey: "fixture-only" };
  const next = f.normalizeSettings({ ...f.defaults, relayProfiles: [profile], activeRelayId: "saved" });
  assert.equal(next.relayProfiles.length, 1);
  assert.equal(next.relayProfiles[0], profile);
  assert.equal(next.activeRelayId, "saved");
  const legacy = f.normalizeSettings({ ...f.defaults, relayProfiles: undefined,
    relayBaseUrl: profile.baseUrl, relayApiKey: profile.apiKey });
  assert.equal(legacy.relayProfiles.length, 1);
  assert.equal(legacy.relayProfiles[0].baseUrl, profile.baseUrl);
  assert.equal(legacy.relayProfiles[0].apiKey, profile.apiKey);
});

test("manager loading does not import local Codex files as a system-default provider", () => {
  const commands = readFileSync(new URL("../src-tauri/src/commands.rs", import.meta.url), "utf8");
  const load = commands.match(/pub fn load_settings\(\)[\s\S]*?^\}/m)?.[0];
  assert.ok(load);
  assert.match(load, /match store\.load\(\)/);
  assert.doesNotMatch(load, /initialize_local_config_provider|读取本机默认供应商/);
});
