use codex_plus_core::settings::{BackendSettings, SettingsStore};
use serde_json::{Value, json};

#[test]
fn retired_settings_are_ignored_without_deleting_existing_files_or_fields() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("settings.json");
    let theme = temp.path().join("personal-theme.png");
    let instance = temp.path().join("codex-multi");
    std::fs::write(&theme, b"personal image").unwrap();
    std::fs::create_dir(&instance).unwrap();
    let session = instance.join("session.jsonl");
    std::fs::write(&session, b"existing session").unwrap();
    let legacy = json!({
        "weixinConnectEnabled": true,
        "weixinConnectBaseUrl": "https://unused.example.test",
        "weixinConnectToken": "test-only-placeholder",
        "codexAppDreamSkinEnabled": true,
        "codexAppDreamSkinPaused": false,
        "codexAppDreamSkinImagePath": theme.to_string_lossy(),
        "codexAppDreamSkinThemeConfig": { "id": "personal", "custom": true }
    });
    let mut raw = serde_json::to_value(BackendSettings::default()).unwrap();
    raw.as_object_mut()
        .unwrap()
        .extend(legacy.as_object().unwrap().clone());
    std::fs::write(&path, serde_json::to_vec_pretty(&raw).unwrap()).unwrap();

    let store = SettingsStore::new(path.clone());
    let mut settings = store.load().unwrap();
    let active = serde_json::to_value(&settings).unwrap();
    for key in legacy.as_object().unwrap().keys() {
        assert!(active.get(key).is_none(), "{key} must not be active");
    }
    settings.codex_app_thread_id_badge = true;
    store.save(&settings).unwrap();
    store
        .update(json!({ "weixinConnectEnabled": false, "codexAppDreamSkinEnabled": false }))
        .unwrap();
    let after: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    for (key, value) in legacy.as_object().unwrap() {
        assert_eq!(&after[key], value, "preserve existing retired field: {key}");
    }
    assert!(store.load().unwrap().codex_app_thread_id_badge);
    assert_eq!(std::fs::read(theme).unwrap(), b"personal image");
    assert_eq!(std::fs::read(session).unwrap(), b"existing session");
}

#[test]
fn malformed_retired_settings_do_not_block_provider_configuration_loading() {
    let settings: BackendSettings = serde_json::from_value(json!({
        "weixinConnectEnabled": { "old": "invalid" },
        "weixinConnectSandbox": 123,
        "codexAppDreamSkinThemeConfig": "invalid old theme",
        "relayProfiles": [{ "id": "kept", "name": "Kept provider" }],
        "activeRelayId": "kept"
    }))
    .unwrap();
    assert_eq!(settings.active_relay_id, "kept");
    assert_eq!(settings.relay_profiles[0].name, "Kept provider");
}
