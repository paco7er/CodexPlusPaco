import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

/// 取顶格书写的选择器规则体，空白按 \s+ 容忍，避免误匹配组合选择器。
function ruleBody(selector: string) {
  const pattern = selector
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const match = styles.match(new RegExp(`^${pattern}\\s*\\{([^}]*)\\}`, "m"));
  assert.ok(match, `missing top-level rule ${selector}`);
  return match[1];
}

test("marketplace setting is a compact overview row with stable save status", () => {
  assert.match(ruleBody(".overview-marketplace"), /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.match(ruleBody(".overview-marketplace"), /border-top:\s*1px solid/);
  assert.doesNotMatch(ruleBody(".overview-marketplace"), /border-radius:|box-shadow:|backdrop-filter:/);
  assert.match(ruleBody(".overview-marketplace-status"), /width:\s*5em/);
  assert.doesNotMatch(styles, /\.enhance-/);
});
