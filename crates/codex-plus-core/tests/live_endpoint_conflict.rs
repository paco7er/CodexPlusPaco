use std::path::PathBuf;

use codex_plus_core::relay_config::relay_profile_api_key;
use codex_plus_core::relay_switch::{
    LiveConflictChoice, LiveConflictResolution, LiveEndpointConflict,
    switch_relay_profile_in_home_resolving_conflict,
};
use codex_plus_core::settings::{
    BackendSettings, RelayApiKey, RelayMode, RelayProfile, SettingsStore,
};

fn config(url: &str) -> String {
    format!(
        "model_provider = \"custom\"\n[model_providers.custom]\nname = \"custom\"\n\
         wire_api = \"responses\"\nrequires_openai_auth = true\nbase_url = \"{url}\"\n"
    )
}

fn profile(id: &str) -> RelayProfile {
    RelayProfile {
        id: id.into(),
        name: id.to_uppercase(),
        relay_mode: RelayMode::PureApi,
        base_url: format!("https://{id}.example/v1"),
        config_contents: config(&format!("https://{id}.example/v1")),
        auth_contents: format!(r#"{{"OPENAI_API_KEY":"fake-{id}"}}"#),
        api_key: format!("fake-{id}"),
        api_keys: vec![RelayApiKey {
            id: "original".into(),
            name: "原 Key".into(),
            api_key: format!("fake-{id}"),
        }],
        active_api_key_id: "original".into(),
        ..RelayProfile::default()
    }
}

struct Fixture {
    _temp: tempfile::TempDir,
    store: SettingsStore,
    home: PathBuf,
    backups: PathBuf,
    next: BackendSettings,
}

impl Fixture {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("codex");
        let state = temp.path().join("data/state");
        std::fs::create_dir_all(&home).unwrap();
        std::fs::write(
            home.join("config.toml"),
            config("https://external.example/v1"),
        )
        .unwrap();
        std::fs::write(
            home.join("auth.json"),
            r#"{"OPENAI_API_KEY":"fake-external"}"#,
        )
        .unwrap();
        let store = SettingsStore::new(state.join("settings.json"));
        store
            .save(&BackendSettings {
                active_relay_id: "a".into(),
                relay_profiles: vec![profile("a"), profile("b")],
                ..BackendSettings::default()
            })
            .unwrap();
        let mut next = store.load().unwrap();
        next.active_relay_id = "b".into();
        Self {
            _temp: temp,
            store,
            home,
            backups: state.join("backups"),
            next,
        }
    }

    fn switch(
        &self,
        choice: Option<&LiveConflictChoice>,
    ) -> anyhow::Result<(
        codex_plus_core::relay_switch::RelaySwitchResult,
        codex_plus_core::relay_switch::LiveConflictOutcome,
    )> {
        switch_relay_profile_in_home_resolving_conflict(
            &self.store,
            &self.home,
            self.next.clone(),
            "a",
            choice,
            &self.backups,
        )
    }

    fn choice(&self, resolution: LiveConflictResolution) -> LiveConflictChoice {
        let error = self.switch(None).unwrap_err();
        let conflict = error.downcast_ref::<LiveEndpointConflict>().unwrap();
        assert_eq!(conflict.profile_id, "a");
        assert!(conflict.message.contains("endpoint 已改变"));
        LiveConflictChoice {
            resolution,
            live_revision: conflict.live_revision.clone(),
        }
    }

    fn unchanged_files(&self) -> Vec<Vec<u8>> {
        [
            self.home.join("config.toml"),
            self.home.join("auth.json"),
            self.backups.parent().unwrap().join("settings.json"),
        ]
        .iter()
        .map(|path| std::fs::read(path).unwrap())
        .collect()
    }
}

#[test]
fn conflict_without_choice_changes_nothing() {
    let f = Fixture::new();
    let before = f.unchanged_files();
    f.choice(LiveConflictResolution::ImportAsNewProfile);
    assert_eq!(f.unchanged_files(), before);
    assert!(!f.backups.exists());
    assert!(!f.home.join("backups").exists());
}

#[test]
fn import_keeps_original_profile_and_adopts_live_credentials_without_old_named_keys() {
    let f = Fixture::new();
    let original = f.store.load().unwrap().relay_profiles[0].clone();
    let choice = f.choice(LiveConflictResolution::ImportAsNewProfile);
    let (result, outcome) = f.switch(Some(&choice)).unwrap();
    assert_eq!(result.settings.active_relay_id, "b");
    assert_eq!(result.settings.relay_profiles.len(), 3);
    let imported_id = outcome.imported_profile_id.unwrap();
    let imported = result
        .settings
        .relay_profiles
        .iter()
        .find(|p| p.id == imported_id)
        .unwrap();
    assert_eq!(imported.name, "A（实时配置）");
    assert!(
        imported
            .config_contents
            .contains("https://external.example/v1")
    );
    assert_eq!(relay_profile_api_key(imported), "fake-external");
    assert_eq!(imported.api_keys.len(), 1);
    assert_eq!(imported.api_keys[0].api_key, "fake-external");
    assert_eq!(result.settings.relay_profiles[0], original);
    assert!(
        std::fs::read_to_string(f.home.join("config.toml"))
            .unwrap()
            .contains("https://b.example/v1")
    );
    assert!(!f.backups.exists());
}

#[test]
fn discard_backs_up_exact_bytes_in_own_state_directory() {
    let f = Fixture::new();
    let before = f.unchanged_files();
    let original = f.store.load().unwrap().relay_profiles[0].clone();
    let choice = f.choice(LiveConflictResolution::DiscardLiveChanges);
    let (result, outcome) = f.switch(Some(&choice)).unwrap();
    let backup = PathBuf::from(outcome.live_backup_path.unwrap());
    assert!(backup.starts_with(&f.backups));
    assert_eq!(
        std::fs::read(backup.join("config.toml")).unwrap(),
        before[0]
    );
    assert_eq!(std::fs::read(backup.join("auth.json")).unwrap(), before[1]);
    assert_eq!(result.settings.relay_profiles.len(), 2);
    assert_eq!(result.settings.relay_profiles[0], original);
    assert_eq!(result.settings.active_relay_id, "b");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(&backup).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            std::fs::metadata(backup.join("auth.json"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
}

#[test]
fn backup_failure_stops_before_changing_settings_or_live_files() {
    let f = Fixture::new();
    let before = f.unchanged_files();
    let choice = f.choice(LiveConflictResolution::DiscardLiveChanges);
    std::fs::write(&f.backups, "not a directory").unwrap();
    let error = f.switch(Some(&choice)).unwrap_err();
    assert!(error.to_string().contains("备份实时配置失败"));
    assert_eq!(f.unchanged_files(), before);
}

#[test]
fn changed_live_config_or_auth_rejects_both_old_choices() {
    for resolution in [
        LiveConflictResolution::ImportAsNewProfile,
        LiveConflictResolution::DiscardLiveChanges,
    ] {
        for name in ["config.toml", "auth.json"] {
            let f = Fixture::new();
            let choice = f.choice(resolution);
            let changed = if name == "config.toml" {
                config("https://another-external.example/v1")
            } else {
                r#"{"OPENAI_API_KEY":"fake-new-external"}"#.into()
            };
            std::fs::write(f.home.join(name), changed).unwrap();
            let before = f.unchanged_files();
            assert!(
                f.switch(Some(&choice))
                    .unwrap_err()
                    .to_string()
                    .contains("确认期间发生变化")
            );
            assert_eq!(f.unchanged_files(), before);
            assert!(!f.backups.exists());
        }
    }
}

#[test]
fn resolved_endpoint_conflict_cannot_be_used_to_skip_normal_backfill() {
    let f = Fixture::new();
    let choice = f.choice(LiveConflictResolution::DiscardLiveChanges);
    std::fs::write(f.home.join("config.toml"), config("https://a.example/v1")).unwrap();
    let before = f.unchanged_files();
    assert!(
        f.switch(Some(&choice))
            .unwrap_err()
            .to_string()
            .contains("冲突已变化")
    );
    assert_eq!(f.unchanged_files(), before);
    assert!(!f.backups.exists());
}

#[test]
fn failed_target_apply_rolls_back_import_and_preserves_live_files() {
    for resolution in [
        LiveConflictResolution::ImportAsNewProfile,
        LiveConflictResolution::DiscardLiveChanges,
    ] {
        let mut f = Fixture::new();
        let choice = f.choice(resolution);
        // 目标认证解析失败时，必须连同新增的供应商一起回滚。
        f.next.relay_profiles[1] = RelayProfile {
            id: "b".into(),
            name: "B".into(),
            relay_mode: RelayMode::PureApi,
            config_contents: "model_provider = \"custom\"\n".into(),
            auth_contents: "{bad json".into(),
            ..RelayProfile::default()
        };
        let before = f.unchanged_files();
        assert!(f.switch(Some(&choice)).is_err());
        assert_eq!(f.unchanged_files(), before);
        if resolution == LiveConflictResolution::DiscardLiveChanges {
            assert_eq!(std::fs::read_dir(&f.backups).unwrap().count(), 1);
        }
    }
}

#[test]
fn stale_settings_revision_does_not_overwrite_new_settings() {
    let f = Fixture::new();
    let choice = f.choice(LiveConflictResolution::ImportAsNewProfile);
    let mut changed = f.store.load().unwrap();
    changed.relay_profiles[0].name = "外部改名".into();
    f.store.save(&changed).unwrap();
    let before = f.unchanged_files();
    assert!(f.switch(Some(&choice)).is_err());
    assert_eq!(f.unchanged_files(), before);
}

#[test]
fn choice_wire_format_requires_revision_and_known_resolution() {
    let choice: LiveConflictChoice = serde_json::from_value(serde_json::json!({
        "resolution": "importAsNewProfile", "liveRevision": "revision"
    }))
    .unwrap();
    assert_eq!(
        choice.resolution,
        LiveConflictResolution::ImportAsNewProfile
    );
    assert!(
        serde_json::from_value::<LiveConflictChoice>(serde_json::json!({
            "resolution": "discardLiveChanges"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<LiveConflictChoice>(serde_json::json!({
            "resolution": "overwrite", "liveRevision": "revision"
        }))
        .is_err()
    );
}
