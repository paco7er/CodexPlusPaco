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

test("the remaining enhancement fits a single column without retired group layout", () => {
  assert.match(ruleBody(".feature-switch-grid"), /align-items:\s*start/);

  assert.match(
    ruleBody(".enhance-switch-grid"),
    /grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  assert.match(ruleBody(".enhance-switch-grid"), /width:\s*min\(100%,\s*420px\)/);
  assert.doesNotMatch(styles, /\.enhance-footer-hint\b|\.enhance-feature-groups\b/);
});
