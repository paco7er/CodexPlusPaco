use codex_plus_core::settings::{BackendSettings, SettingsStore};
use serde_json::{Value, json};

#[test]
fn legacy_enhancements_are_disabled_in_runtime_without_changing_saved_settings() {
    let temp = tempfile::tempdir().unwrap();
    let store = SettingsStore::new(temp.path().join("settings.json"));
    let mut legacy = serde_json::to_value(BackendSettings::default()).unwrap();
    let flags = [
        "codexAppStandaloneQuotaUnlock",
        "codexAppModelWhitelistUnlock",
        "codexAppSessionDelete",
        "codexAppMarkdownExport",
        "codexAppSessionShare",
        "codexAppUsageStatusLine",
        "codexAppPasteFix",
        "codexAppForceChineseLocale",
        "codexAppThreadIdBadge",
        "codexAppConversationView",
        "codexAppThreadScrollRestore",
        "codexAppNativeMenuPlacement",
        "codexAppNativeBrowserRequireIdentification",
        "codexAppNativeFastUnlock",
        "codexAppPetRealMouseLook",
        "codexAppActivityOverlayRight",
        "codexAppCapacityAutoRetry",
        "codexAppWhaleWidgetEnabled",
        "codexAppStepwiseEnabled",
        "codexAppAnswerOutlineEnabled",
        "codexAppStepwiseDirectSend",
    ];
    for key in flags {
        legacy[key] = json!(true);
    }
    legacy["codexAppTypingEffect"] = json!("stars");
    legacy["dictation"]["enabled"] = json!(true);
    let settings: BackendSettings = serde_json::from_value(legacy).unwrap();
    store.save(&settings).unwrap();
    let saved = store.load().unwrap();
    let runtime = saved.clone().marketplace_only_enhancements();
    let value = serde_json::to_value(&runtime).unwrap();
    for key in flags {
        assert_eq!(value[key], Value::Bool(false), "{key}");
    }
    assert_eq!(value["codexAppTypingEffect"], "off");
    assert_eq!(value["dictation"]["enabled"], false);
    assert_eq!(runtime.relay_profiles, saved.relay_profiles);
    assert_eq!(runtime.relay_context_config_contents, saved.relay_context_config_contents);
    assert!(store.load().unwrap().codex_app_native_fast_unlock);
    assert!(store.load().unwrap().dictation.enabled);
}

#[test]
fn marketplace_and_master_switches_are_preserved_in_runtime() {
    for master in [false, true] {
        for marketplace in [false, true] {
            let settings = BackendSettings {
                enhancements_enabled: master,
                codex_app_plugin_marketplace_unlock: marketplace,
                ..BackendSettings::default()
            }
            .marketplace_only_enhancements();
            assert_eq!(settings.enhancements_enabled, master);
            assert_eq!(settings.codex_app_plugin_marketplace_unlock, marketplace);
        }
    }
}
