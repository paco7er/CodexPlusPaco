import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const css = read("./ManagementPages.css");
const app = read("./App.tsx");

test("all five routes use the same management workspace", () => {
  assert.match(app, /const isManagementScreen = route === "overview" \|\| route === "relay" \|\| route === "sessions" \|\| route === "context" \|\| route === "skills"/);
  assert.match(app, /className="mg-page overview-page"/);
  assert.match(app, /className="mg-header overview-app-header"/);
  assert.match(read("./ManagementExtra.tsx"), /<PageHeader icon=\{<BookOpen/);
  assert.match(read("./ProjectSessionPage.tsx"), /<PageHeader icon=\{<History/);
  assert.doesNotMatch(css, /\.screen\.management-screen > \.mg-session-page\s*\{[^}]*border:0/);
  assert.doesNotMatch(css, /\.mg-skills-page \.mg-primary\s*\{[^}]*hsl\(232/);
});

test("management toolbars wrap without adding observers, blur or animation", () => {
  assert.match(css, /\.mg-header\s*\{[^}]*flex-shrink:0;[^}]*flex-wrap:wrap/);
  assert.match(css, /\.mg-header-actions\s*\{[^}]*flex-wrap:wrap/);
  assert.match(css, /\.mg-toolbar,\.mg-tabs-bar\s*\{[^}]*flex-shrink:0;[^}]*flex-wrap:wrap/);
  assert.match(css, /\.mg-tabs-bar \.mg-search\s*\{[^}]*order:1;[^}]*flex-basis:100%/);
  assert.doesNotMatch(css, /backdrop-filter|will-change|@keyframes/);
});

test("skill rows retain fixed virtual geometry and a bounded list viewport", () => {
  assert.match(css, /\.mg-skill-group \.mg-skill-list\s*\{[^}]*max-height:min\(60vh,680px\);[^}]*overflow:auto/);
  assert.match(css, /\.mg-skill-row\{min-height:68px;height:68px\}/);
  assert.match(read("./ManagementExtra.tsx"), /<SkillListViewport className="mg-skill-list"[^>]*rowHeight=\{68\}/);
  assert.match(read("./ManagementExtra.tsx"), /aria-expanded=\{!collapsed\}/);
  assert.match(css, /\.mg-skill-group-head \.mg-group-head strong\s*\{[^}]*text-overflow:ellipsis/);
});
