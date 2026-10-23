import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { isAggregateProfile } from "./aggregate-members.ts";
import { normalizeRelayModelRoutes } from "./model-routes.ts";

const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const app = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["RelayScreen", "isDirectRelayProfile", "isAggregateRelayProfile"];
const declarations = app.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ""));
const code = ts.transpileModule(declarations.map((node) => node.getText(app)).join("\n"), {
  compilerOptions: { jsx: ts.JsxEmit.React, jsxFactory: "jsx", target: ts.ScriptTarget.ES2022 },
}).outputText;

type Tree = { type: string; props: Record<string, any>; children: unknown[] };
function nodes(value: unknown): Tree[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("children" in value)) return [];
  const tree = value as Tree;
  return [tree, ...tree.children.flatMap(nodes)];
}

function fixture() {
  const slots: any[] = [];
  let cursor = 0;
  const context = vm.createContext({
    ...Object.fromEntries(["PageHeader", "Button", "Panel", "CardContent", "EnvConflictNotice", "ToggleVisual",
      "RelayProfileList", "RelayProfileDetail", "ProviderCatalogScreen", "KeyRound", "Plus"]
      .map((name) => [name, name])),
    jsx: (type: string, props: Record<string, any>, ...children: unknown[]) => ({ type, props: props ?? {}, children }),
    useState: (initial: any) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value: any) => { slots[index] = value; }];
    },
    useEffect: () => {},
    normalizeSettings: (form: unknown) => form,
    normalizeRelayModelRoutes, isAggregateProfile, t: (value: string) => value,
  });
  vm.runInContext(code, context);
  const render = (form: any, actions: any = {}) => {
    cursor = 0;
    return context.RelayScreen({ form, actions, relayFiles: null, envConflicts: null }) as Tree;
  };
  return { render };
}

function settingsFixture() {
  return {
    relayProfilesEnabled: true, ccsDbPath: "", activeRelayId: "failover",
    relayProfiles: [
      { id: "direct", protocol: "responses", relayMode: "pureApi", modelRoutes: [] },
      { id: "official", protocol: "responses", relayMode: "official" },
      { id: "chat", protocol: "chatCompletions", relayMode: "pureApi" },
      { id: "anthropic", protocol: "anthropicMessages", relayMode: "pureApi" },
      { id: "routes", protocol: "responses", relayMode: "pureApi", modelRoutes: [{ model: "a", targetRelayId: "direct" }] },
      { id: "failover", protocol: "responses", relayMode: "aggregate", aggregate: { members: [{ profileId: "direct" }] } },
      { id: "models", protocol: "responses", relayMode: "aggregate", aggregate: { modelAggregationEnabled: true } },
      { id: "legacy", protocol: "responses", relayMode: "pureApi", aggregate: { members: [] } },
    ],
  };
}

test("provider list shows only direct profiles and passes complete settings to save", async () => {
  const form = settingsFixture();
  const before = JSON.stringify(form);
  let saved: unknown;
  const tree = fixture().render(form, { saveSettingsValue: async (next: unknown) => { saved = next; } });
  const list = nodes(tree).find((node) => node.type === "RelayProfileList");
  assert.ok(list);
  assert.deepEqual([...list.props.visibleProfiles].map((profile) => profile.id), ["direct", "official"]);
  assert.equal(list.props.form, form);
  await list.props.onFormChange(form);
  assert.equal(saved, form);
  assert.equal(JSON.stringify(form), before);
});

test("provider cards follow the switching control without an import toolbar or group heading", () => {
  const tree = fixture().render(settingsFixture());
  const content = nodes(tree).find((node) => node.type === "CardContent");
  assert.ok(content);
  const children = content.children.filter((child): child is Tree =>
    !!child && typeof child === "object" && "type" in child);
  assert.deepEqual(children.map((node) => node.type), ["EnvConflictNotice", "label", "RelayProfileList"]);
  assert.ok(!nodes(tree).some((node) =>
    node.children.includes("从第三方导入") || node.children.includes("直连")));
});

test("changing the switching control preserves existing providers and legacy import settings", async () => {
  const form = { ...settingsFixture(), ccsDbPath: "C:/legacy/cc-switch.db" };
  const before = JSON.stringify(form);
  let saved: typeof form | undefined;
  const tree = fixture().render(form, {
    saveSettingsValue: async (next: typeof form) => { saved = next; return next; },
  });
  const toggle = nodes(tree).find((node) => node.type === "input" && node.props.type === "checkbox");
  assert.ok(toggle);
  toggle.props.onChange({ currentTarget: { checked: false } });
  await Promise.resolve();
  assert.ok(saved);
  assert.equal(saved.relayProfilesEnabled, false);
  assert.equal(saved.relayProfiles, form.relayProfiles);
  assert.equal(saved.activeRelayId, form.activeRelayId);
  assert.equal(saved.ccsDbPath, form.ccsDbPath);
  assert.equal(JSON.stringify(form), before);
});

test("a configuration with only converted or aggregate providers stays in the direct empty state", () => {
  const form = settingsFixture();
  form.relayProfiles = form.relayProfiles.slice(2);
  const tree = fixture().render(form);
  const list = nodes(tree).find((node) => node.type === "RelayProfileList");
  assert.ok(list);
  assert.equal(list.props.visibleProfiles.length, 0);
  assert.equal(list.props.form, form);
  assert.ok(nodes(tree).some((node) => node.type === "strong" && node.children.includes("还没有直连供应商")));
  assert.ok(!nodes(tree).some((node) => ["tab", "tablist"].includes(node.props.role)));
});

test("direct provider editing and creation retain the full settings snapshot", async () => {
  const form = settingsFixture();
  const f = fixture();
  let tree = f.render(form);
  const list = nodes(tree).find((node) => node.type === "RelayProfileList");
  assert.ok(list);
  await list.props.onEdit("direct");
  tree = f.render(form);
  assert.equal(tree.type, "RelayProfileDetail");
  assert.equal(tree.props.profile, form.relayProfiles[0]);
  assert.equal(tree.props.form, form);
  tree.props.onBack();
  tree = f.render(form);
  const header = nodes(tree).find((node) => node.type === "PageHeader");
  assert.ok(header);
  header.props.actions.props.onClick();
  tree = f.render(form);
  assert.equal(tree.type, "ProviderCatalogScreen");
  const draft = { id: "new", protocol: "responses", relayMode: "pureApi" };
  tree.props.onSelect(draft);
  tree = f.render(form);
  assert.equal(tree.type, "RelayProfileDetail");
  assert.equal(tree.props.profile, draft);
  assert.equal(tree.props.isNew, true);
  assert.equal(tree.props.form, form);
});

test("retired provider modes have no list navigation, creation or automatic selection", () => {
  const relay = declarations.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "RelayScreen");
  assert.ok(relay);
  assert.doesNotMatch(relay.getText(app), /providerView|selectProviderView|createNewAggregateProfile|newAggregateMode|模型聚合|需协议转换|故障转移|其余分页/);
  const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(styles, /\.provider-view-tabs\b|\.provider-aggregate-toolbar\b/);
});
