use codex_plus_core::settings::{BackendSettings, RelayMode, RelayProfile, SettingsStore};

#[test]
fn fresh_settings_remain_empty_across_load_save_and_reload() {
    let dir = tempfile::tempdir().unwrap();
    let store = SettingsStore::new(dir.path().join("settings.json"));
    assert!(BackendSettings::default().relay_profiles.is_empty());
    assert!(serde_json::from_str::<BackendSettings>("{}").unwrap().relay_profiles.is_empty());
    let fresh = store.load().unwrap();
    assert!(fresh.relay_profiles.is_empty());
    assert!(!dir.path().join("settings.json").exists());
    store.save(&fresh).unwrap();
    let reloaded = store.load().unwrap();
    assert!(reloaded.relay_profiles.is_empty());
    assert!(reloaded.tools.values().all(|tool| tool.relay_profiles.is_empty()));
    store.save(&reloaded).unwrap();
    assert!(store.load().unwrap().relay_profiles.is_empty());
}

#[test]
fn empty_settings_do_not_adopt_local_codex_files_or_remove_saved_providers() {
    let dir = tempfile::tempdir().unwrap();
    let store = SettingsStore::new(dir.path().join("settings.json"));
    let config = "invalid [";
    let auth = r#"{"OPENAI_API_KEY":"fixture-only"}"#;
    std::fs::write(dir.path().join("config.toml"), config).unwrap();
    std::fs::write(dir.path().join("auth.json"), auth).unwrap();
    let mut settings = store.load().unwrap();
    assert!(settings.relay_profiles.is_empty());
    settings.relay_profiles.push(RelayProfile {
        id: "saved".into(),
        name: "已有供应商".into(),
        relay_mode: RelayMode::PureApi,
        base_url: "https://fixture.invalid/v1".into(),
        api_key: "fixture-only".into(),
        ..RelayProfile::default()
    });
    settings.active_relay_id = "saved".into();
    store.save(&settings).unwrap();
    let saved = store.load().unwrap();
    assert_eq!(saved.relay_profiles.len(), 1);
    assert_eq!(saved.relay_profiles[0].id, "saved");
    assert_eq!(saved.active_relay_id, "saved");
    assert_eq!(std::fs::read_to_string(dir.path().join("config.toml")).unwrap(), config);
    assert_eq!(std::fs::read_to_string(dir.path().join("auth.json")).unwrap(), auth);
}
