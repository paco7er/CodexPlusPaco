import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const text = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
const app = ts.createSourceFile("App.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
test("the manager no longer requests or imports third-party CCS databases", () => {
  const commands: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(app) === "call") {
      const command = node.arguments[0];
      if (command && ts.isStringLiteral(command)) commands.push(command.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(app);
  assert.ok(commands.includes("load_settings"));
  assert.ok(!commands.includes("load_ccs_providers"));
  assert.ok(!commands.includes("import_ccs_providers"));
});
