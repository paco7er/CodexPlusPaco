use codex_plus_core::settings::{BackendSettings, SettingsStore};
use serde_json::json;

#[test]
fn helper_body_limit_defaults_to_128_mib_for_old_settings() {
    let defaults = BackendSettings::default();
    assert_eq!(defaults.helper_max_request_body_mib, 128);
    assert_eq!(defaults.helper_max_request_body_bytes(), 128 * 1024 * 1024);
    assert_eq!(serde_json::to_value(&defaults).unwrap()["helperMaxRequestBodyMib"], json!(128));

    let settings: BackendSettings = serde_json::from_value(json!({
        "enhancementsEnabled": true,
        "codexAppPluginMarketplaceUnlock": true
    })).unwrap();
    assert_eq!(settings.helper_max_request_body_mib, 128);
    assert!(settings.codex_app_plugin_marketplace_unlock);
}

#[test]
fn helper_body_limit_round_trips_and_clamps() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("settings.json");
    let store = SettingsStore::new(path.clone());
    let mut settings = BackendSettings::default();
    settings.helper_max_request_body_mib = 256;
    store.save(&settings).unwrap();
    assert_eq!(store.load().unwrap().helper_max_request_body_mib, 256);

    store.update(json!({"helperMaxRequestBodyMib": 300})).unwrap();
    assert_eq!(store.load().unwrap().helper_max_request_body_mib, 300);
    let raw: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    assert_eq!(raw["helperMaxRequestBodyMib"], json!(300));

    for (value, expected) in [(9999, 512), (1, 32), (u64::MAX, 512)] {
        store.update(json!({"helperMaxRequestBodyMib": value})).unwrap();
        assert_eq!(store.load().unwrap().helper_max_request_body_mib, expected);
    }
    settings = store.load().unwrap();
    settings.helper_max_request_body_mib = 9999;
    store.save(&settings).unwrap();
    assert_eq!(store.load().unwrap().helper_max_request_body_mib, 512);
    settings = store.load().unwrap();
    settings.helper_max_request_body_mib = 0;
    store.save(&settings).unwrap();
    assert_eq!(store.load().unwrap().helper_max_request_body_mib, 32);

    let mut raw = serde_json::to_value(BackendSettings::default()).unwrap();
    raw["helperMaxRequestBodyMib"] = json!(4096);
    std::fs::write(&path, serde_json::to_vec(&raw).unwrap()).unwrap();
    assert_eq!(store.load().unwrap().helper_max_request_body_mib, 512);
}

#[test]
fn helper_body_limit_bytes_never_overflow() {
    let mut settings = BackendSettings::default();
    settings.helper_max_request_body_mib = u32::MAX;
    assert_eq!(settings.helper_max_request_body_bytes(), 512 * 1024 * 1024);
    settings.helper_max_request_body_mib = 0;
    assert_eq!(settings.helper_max_request_body_bytes(), 32 * 1024 * 1024);
}
