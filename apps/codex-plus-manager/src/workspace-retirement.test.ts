import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("multi-launch, WeChat and skins have no manager entry or command", () => {
  const app = read("./App.tsx");
  assert.doesNotMatch(app, /multiLaunch|MultiLaunch|weixin|Weixin|dreamSkin|DreamSkin|launchMultiInstance/);
  const commands = read("../src-tauri/src/commands.rs");
  const handlers = read("../src-tauri/src/lib.rs");
  assert.doesNotMatch(commands, /pub (?:async )?fn \w*(?:codex_multi_instance|weixin_connect|dream_skin)\w*\(/);
  assert.doesNotMatch(handlers, /commands::\w*(?:codex_multi_instance|weixin|dream_skin)\w*/);
  assert.doesNotMatch(read("./styles.css"), /\.(?:multi-launch|weixin|dream-skin)[\w-]*/);
});

test("core and injection no longer load retired runtimes, settings or assets", () => {
  const core = read("../../../crates/codex-plus-core/src/lib.rs");
  assert.doesNotMatch(core, /pub mod (?:dream_skin\w*|connect|multi_worker|packaged_launch);/);
  const assets = read("../../../crates/codex-plus-core/src/assets.rs");
  assert.doesNotMatch(assets, /include_(?:str|bytes)!\([^)]*(?:dream-skin|snow-skin|cidala-tiger|glass-vision)/);
  assert.doesNotMatch(assets, /CODEX_PLUS_INSTANCE_LABEL|CODEX_PLUS_INSTANCE_ID/);
  const renderer = read("../../../assets/inject/renderer-inject.js");
  assert.doesNotMatch(renderer, /function (?:installDreamSkin|refreshDreamSkin|applyDreamSkinLiveUpdate|installCodexPlusInstanceIdentity)|codexAppDreamSkin|dreamSkinEnabled/);
  const launcher = read("../../../crates/codex-plus-core/src/launcher.rs");
  assert.doesNotMatch(launcher, /\/dream-skin\/image|CODEX_PLUS_MULTI_INSTANCE|launch_packaged_multi_instance/);
});

test("reinjection retires stale skin callbacks even when one callback throws", () => {
  const source = read("../../../assets/inject/renderer-inject/00-prelude.js");
  const start = source.indexOf("  function retireLegacySkinRuntime()");
  const end = source.indexOf("  function codexPlusStatsigClients()", start);
  assert.ok(start >= 0 && end > start);
  const calls: string[] = [];
  const window: Record<string, unknown> = {
    __CODEX_PLUS_CLEAR_DREAM_SKIN__: () => { calls.push("legacy"); throw new Error("stale"); },
    __CODEX_PLUS_DREAM_SKIN_API_OBSERVER__: { disconnect() { calls.push("observer"); } },
    __CODEX_DREAM_SKIN_STATE__: { cleanup() { calls.push("dream"); } },
    __CODEX_GLASS_VISION_SKIN_STATE__: { cleanup() { calls.push("glass"); } },
    __CODEX_PLUS_APPLY_DREAM_SKIN__: () => assert.fail("retired installer must not run"),
    codexPlus: { constants: { publicClassName: "unchanged" } },
  };
  const cleanup = new Function("window", source.slice(start, end));
  cleanup(window);
  cleanup(window);
  assert.deepEqual(calls, ["legacy", "observer", "dream", "glass"]);
  for (const key of Object.keys(window)) assert.equal(key, "codexPlus");
  assert.deepEqual(window.codexPlus, { constants: { publicClassName: "unchanged" } });
});

test("reinjection removes the old multi-launch identity without reinstalling it", () => {
  const source = read("../../../assets/inject/renderer-inject/99-startup.js");
  const end = source.indexOf("  installCodexConfigReadDeadline();");
  assert.ok(end > 0);
  let removed = 0;
  const window: Record<string, unknown> = {
    __CODEX_PLUS_INSTANCE_LABEL__: "Old provider",
    __CODEX_PLUS_INSTANCE_ID__: "old-instance",
  };
  const document = {
    getElementById(id: string) {
      assert.equal(id, "codex-plus-instance-identity");
      return removed === 0 ? { remove() { removed += 1; } } : null;
    },
  };
  const cleanup = new Function("window", "document", source.slice(0, end));
  cleanup(window, document);
  cleanup(window, document);
  assert.equal(removed, 1);
  assert.deepEqual(window, {});
});

test("installers stop registering the retired skin protocol", () => {
  for (const path of [
    "../src-tauri/Info.plist",
    "../../../scripts/installer/macos/package-dmg.sh",
    "../../../scripts/installer/linux/build-deb.sh",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /<string>dreamskin<\/string>|x-scheme-handler\/dreamskin/);
    assert.match(source, /codexplusplus/);
  }
  const nsis = read("../../../scripts/installer/windows/CodexPlusPlus.nsi");
  assert.doesNotMatch(nsis, /WriteRegStr[^\n]*dreamskin/);
});
