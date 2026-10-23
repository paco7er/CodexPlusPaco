import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
const app = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const normalizer = app.statements.find(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === "normalizeSettings",
);
assert.ok(normalizer?.body);
let field: ts.PropertyAssignment | undefined;
function visit(node: ts.Node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(app) === "helperMaxRequestBodyMib") field = node;
  ts.forEachChild(node, visit);
}
visit(normalizer.body);
assert.ok(field);
const expression = ts.transpileModule(`globalThis.limit = ${field.initializer.getText(app)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const clamp = app.statements.find(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === "clampNumber",
);
assert.ok(clamp);
const clampSource = ts.transpileModule(clamp.getText(app), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

test("helper body limit survives frontend normalization, including old settings", () => {
  for (const [value, expected] of [[undefined, 128], [256, 256], [1, 32], [9999, 512], [128.2, 128]]) {
    const context = vm.createContext({ settings: { helperMaxRequestBodyMib: value } });
    vm.runInContext(clampSource + expression, context);
    assert.equal(context.limit, expected);
  }
  assert.match(source, /helperMaxRequestBodyMib: number;/);
  assert.match(source, /helperMaxRequestBodyMib: 128,/);
});

test("body limit migration does not restore proxy settings UI", () => {
  assert.doesNotMatch(source, /function ProtocolProxySettingsScreen/);
  assert.doesNotMatch(source, /helperMaxRequestBodyMib[\s\S]{0,80}onChange/);
});
