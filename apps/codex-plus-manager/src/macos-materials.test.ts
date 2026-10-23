import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

test("persistent glass is limited to one bounded toolbar with a solid fallback", () => {
  assert.match(css, /@supports \(backdrop-filter: blur\(1px\)\)\s*\{\s*\.topbar\s*\{[^}]*backdrop-filter: blur\(12px\) saturate\(130%\)/);
  assert.match(css, /\.topbar\s*\{[^}]*background: hsl\(var\(--background\)\)/);
  for (const selector of ["sidebar", "nav-item", "overview-app-identity", "overview-health-row", "overview-path-actions"]) {
    const rules = [...css.matchAll(new RegExp(`\\.${selector}(?:[\\s\\S]*?)\\{([^}]+)\\}`, "g"))];
    for (const rule of rules) assert.doesNotMatch(rule[1], /backdrop-filter|will-change/);
  }
});

test("glass respects transparency and contrast preferences without requiring JavaScript", () => {
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\), \(forced-colors: active\)\s*\{\s*\.topbar\s*\{[^}]*background: hsl\(var\(--background\)\);[^}]*backdrop-filter: none/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*?\.nav-icon,[^{]*\{[^}]*background: Canvas;[^}]*color: CanvasText/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation-iteration-count: 1 !important/);
  const forcedColors = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.match(forcedColors, /\.toggle-switch-visual\s*\{[^}]*forced-color-adjust: none;[^}]*border: 1px solid ButtonText;[^}]*background: Canvas/);
  assert.match(forcedColors, /input:checked ~ \.toggle-switch-visual[^{]*\{[^}]*background: Highlight;/);
  assert.match(forcedColors, /input:checked ~ \.toggle-switch-visual \.toggle-switch-thumb[^{]*\{[^}]*background: HighlightText;/);
});

test("glass highlights and health items are static rather than animated filter effects", () => {
  const treatment = css.slice(css.indexOf("/* 常驻导航"), css.indexOf(".screen {", css.indexOf("/* 常驻导航")));
  assert.doesNotMatch(treatment, /@keyframes|will-change|animation:|url\(/);
  assert.match(css, /\.overview-app-identity > svg\s*\{[^}]*border-radius: 8px;[^}]*background: hsl\(var\(--brand-accent\) \/ 0\.07\)/);
  assert.doesNotMatch(css.match(/\.overview-health-row\s*\{([^}]+)\}/)?.[1] ?? "", /background:|box-shadow:|border-radius:/);
  assert.match(css, /input:checked ~ \.toggle-switch-visual[^{]*\{[^}]*background: hsl\(var\(--switch-on\)\)/);
});

test("navigation icons keep their route identity and selection remains accessible", () => {
  assert.match(app, /data-route=\{item\.id\}/);
  assert.match(app, /aria-current=\{route === item\.id \? "page" : undefined\}/);
  for (const route of ["relay", "context", "skills", "sessions"]) {
    assert.match(css, new RegExp(`\\.nav-item\\[data-route="${route}"\\]\\s*\\{[^}]*--nav-tint:`));
  }
  assert.match(css, /\.nav-item:focus-visible,\s*\.topbar-actions > button:focus-visible,\s*\.overview-health-header-actions button:focus-visible,\s*\.overview-path-actions button:focus-visible\s*\{[^}]*outline: 2px solid hsl\(var\(--ring\)\);[^}]*outline-offset: 2px/);
});
