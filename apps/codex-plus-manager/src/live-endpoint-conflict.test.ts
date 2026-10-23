import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const text = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const app = ts.createSourceFile("App.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const statements: string[] = [];
function collect(node: ts.Node) {
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some(
    (declaration) => ["switchRelayProfile", "snapshotActiveRelayFilesBeforeSwitch"].includes(declaration.name.getText(app)),
  )) statements.push(node.getText(app));
  ts.forEachChild(node, collect);
}
collect(app);
const code = ts.transpileModule(
  `${statements.join("\n")}\nglobalThis.testSwitch = switchRelayProfile;`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function fixture(choice: string | null, finalStatus = "ok") {
  const calls: { command: string; request: any }[] = [];
  const notices: string[] = [];
  const switching: boolean[] = [];
  let switches = 0;
  let dialogCount = 0;
  const original = { activeRelayId: "b", relayProfilesEnabled: true, revision: "settings-revision" };
  const context = vm.createContext({
    settingsForm: { activeRelayId: "a" },
    relaySwitching: false,
    normalizeSettings: (value: unknown) => value,
    activeRelayProfile: (value: any) => ({ id: value.activeRelayId, name: "供应商", relayMode: "pureApi" }),
    relayProfileSwitchValidation: () => "",
    relayProfileSwitchCommand: () => "switch_relay_profile",
    shouldBackfillRelayProfileBeforeSwitch: () => true,
    logDiagnostic: () => {},
    t: (value: string) => value,
    showNotice: (_title: string, message: string) => notices.push(message),
    run: (action: () => unknown) => action(),
    call: async (command: string, { request }: any) => {
      calls.push({ command, request });
      if (command === "backfill_relay_profile_from_live") {
        return { settings: original, status: "failed", message: "预检冲突不应重复提示", liveConflict: true };
      }
      switches += 1;
      if (switches === 1) {
        return {
          status: "failed", settings: { ...original, activeRelayId: "a" }, relay: {},
          message: "地址冲突",
          liveConflict: { profileId: "a", profileName: "A", liveRevision: "live-revision" },
        };
      }
      return { status: finalStatus, settings: original, relay: {}, message: "最终结果" };
    },
    setRelaySwitching: (value: boolean) => switching.push(value),
    setSettings: () => {},
    setSettingsForm: () => {},
    setRelay: () => {},
    refreshRelayFiles: async () => {},
    isSuccessStatus: (status: string) => status === "ok",
    isDegradedStatus: (status: string) => status === "degraded",
    setLiveConflictDialog: (dialog: any) => {
      dialogCount += 1;
      assert.equal(dialog.profileName, "A");
      assert.equal(switching.at(-1), false, "必须释放切换状态后才允许确认重试");
      dialog.resolve(choice);
    },
  });
  vm.runInContext(code, context);
  return { context, calls, notices, switching, original, dialogCount: () => dialogCount };
}

test("取消实时配置冲突不重试、不自动导入，也不重复显示预检报错", async () => {
  const f = fixture(null);
  await f.context.testSwitch(f.original, "a");
  assert.equal(f.calls.length, 2);
  assert.equal(f.dialogCount(), 1);
  assert.deepEqual(f.notices, []);
  assert.deepEqual(f.switching, [true, false]);
  assert.equal(f.original.activeRelayId, "b");
});

for (const resolution of ["importAsNewProfile", "discardLiveChanges"]) {
  test(`${resolution} 重试携带冲突版本，跳过重复预回填并保留原目标`, async () => {
    const f = fixture(resolution);
    await f.context.testSwitch(f.original, "a");
    assert.deepEqual(f.calls.map((call) => call.command), [
      "backfill_relay_profile_from_live", "switch_relay_profile", "switch_relay_profile",
    ]);
    const request = f.calls[2].request;
    assert.equal(request.previousActiveRelayId, "a");
    assert.equal(request.settings.activeRelayId, "b");
    assert.equal(request.liveConflictChoice.resolution, resolution);
    assert.equal(request.liveConflictChoice.liveRevision, "live-revision");
    assert.equal(f.dialogCount(), 1);
    assert.deepEqual(f.notices, ["最终结果"]);
    assert.deepEqual(f.switching, [true, false, true, false]);
  });
}

test("确认后的失败明确提示并释放状态，不重复弹窗", async () => {
  const f = fixture("discardLiveChanges", "failed");
  await f.context.testSwitch(f.original, "a");
  assert.equal(f.dialogCount(), 1);
  assert.deepEqual(f.notices, ["最终结果"]);
  assert.equal(f.switching.at(-1), false);
});

test("旧调用方没有冲突处理选择时继续使用默认停止行为", () => {
  const backend = readFileSync(new URL("../src-tauri/src/commands.rs", import.meta.url), "utf8");
  assert.match(backend, /#\[serde\(default\)\]\s+pub live_conflict_choice: Option</);
  assert.match(backend, /relay_switch_error_detail\(&error, &error_secrets\)/);
  assert.match(backend, /default_app_state_dir\(\)\.join\("backups"\)/);
});
