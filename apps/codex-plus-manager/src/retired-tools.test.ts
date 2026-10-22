import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const libSource = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const commandsSource = readFileSync(new URL("../src-tauri/src/commands.rs", import.meta.url), "utf8");

test("retired Claude and Grok workspaces have no routes, screens or bundled icons", () => {
  for (const tool of ["claude", "grok"]) {
    assert.doesNotMatch(appSource, new RegExp(`id: "${tool}"`));
    assert.doesNotMatch(appSource, new RegExp(`route === "${tool}"`));
    assert.ok(!appSource.includes(`./assets/agents/${tool}.svg`));
  }
  assert.ok(!appSource.includes("ClaudeLocalizationScreen"));
  assert.ok(!appSource.includes("GrokScreen"));
  assert.match(appSource, /id: "relay".*tool: "codex"/);
  assert.ok(appSource.includes("./assets/agents/chatgpt.svg"));
});

test("retired Claude and Grok commands are neither implemented nor registered", () => {
  for (const command of [
    "claude_localization_status",
    "claude_localization_action",
    "claude_localization_set_voice_input",
    "claude_localization_set_localization",
    "load_grok_providers",
    "apply_grok_relay_profile",
    "load_grok_config",
    "save_grok_config",
  ]) {
    assert.ok(!appSource.includes(`"${command}"`), command);
    assert.ok(!libSource.includes(`commands::${command}`), command);
    assert.doesNotMatch(commandsSource, new RegExp(`pub (?:async )?fn ${command}\\(`), command);
  }
});
