use std::io::ErrorKind;
use std::path::Path;

use anyhow::Context;
use sha2::{Digest, Sha256};

use crate::relay_config::{
    LiveEndpointChanged, RelayBackfillPolicy, backfill_relay_profile_from_home_with_common,
    backfill_relay_profile_from_home_with_common_and_policy, relay_config_status_from_home,
};
use crate::settings::{BackendSettings, RelayMode, SettingsStore};

#[derive(Debug, Clone, PartialEq)]
pub struct RelaySwitchResult {
    pub settings: BackendSettings,
    pub configured: bool,
    pub backup_path: Option<String>,
}

#[derive(Debug)]
pub struct LiveEndpointConflict {
    pub profile_id: String,
    pub live_revision: String,
    pub message: String,
}

impl std::fmt::Display for LiveEndpointConflict {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for LiveEndpointConflict {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LiveConflictResolution {
    ImportAsNewProfile,
    DiscardLiveChanges,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveConflictChoice {
    pub resolution: LiveConflictResolution,
    pub live_revision: String,
}

#[derive(Debug, Default)]
pub struct LiveConflictOutcome {
    pub imported_profile_id: Option<String>,
    pub live_backup_path: Option<String>,
}

pub fn switch_relay_profile_in_home(
    store: &SettingsStore,
    home: &Path,
    next_settings: BackendSettings,
    previous_active_relay_id: &str,
) -> anyhow::Result<RelaySwitchResult> {
    switch_relay_profile_in_home_resolving_conflict(
        store,
        home,
        next_settings,
        previous_active_relay_id,
        None,
        &crate::paths::default_app_state_dir().join("backups"),
    )
    .map(|(result, _)| result)
}

pub fn switch_relay_profile_in_home_resolving_conflict(
    store: &SettingsStore,
    home: &Path,
    next_settings: BackendSettings,
    previous_active_relay_id: &str,
    choice: Option<&LiveConflictChoice>,
    backup_root: &Path,
) -> anyhow::Result<(RelaySwitchResult, LiveConflictOutcome)> {
    let mut selected_settings = next_settings;
    if !selected_settings.relay_profiles_enabled {
        anyhow::bail!("供应商配置总开关已关闭，未写入 config.toml / auth.json。");
    }
    // 读不到当前设置时不要用默认值继续：回滚分支会把「仅剩默认供应商」写回磁盘，
    // 这正是供应商列表被清空的成因。读失败直接中止切换，保住原文件。
    let saved_settings = store
        .load()
        .context("读取当前供应商设置失败，已中止切换以免覆盖用户配置")?;
    let original_settings_bytes = store
        .snapshot_raw_bytes()
        .context("读取当前供应商原始快照失败，已中止切换")?;
    let live_snapshot = LiveFilesSnapshot::capture(home).context("读取当前 Codex 实时配置失败")?;
    // 先补回被过滤掉的供应商，再做上一个供应商的回填：回填按 id 在列表里找
    // 「当前供应商」，子集请求里同样可能缺它（否则会误报「已不在配置列表中」）。
    restore_missing_saved_profiles(&mut selected_settings, &saved_settings);
    let mut outcome = LiveConflictOutcome::default();
    if !previous_active_relay_id.trim().is_empty()
        && previous_active_relay_id != selected_settings.active_relay_id
    {
        let mut backfilled = selected_settings.clone();
        match backfill_profile_before_switch(home, &mut backfilled, previous_active_relay_id) {
            Ok(()) => {
                anyhow::ensure!(choice.is_none(), "实时配置冲突已变化，请重新切换供应商。");
                selected_settings = backfilled;
            }
            Err(error) if error.chain().any(|cause| cause.is::<LiveEndpointChanged>()) => {
                let revision = live_snapshot.revision();
                let Some(choice) = choice else {
                    return Err(LiveEndpointConflict {
                        profile_id: previous_active_relay_id.to_string(),
                        live_revision: revision,
                        message: format!("{error:#}"),
                    }.into());
                };
                anyhow::ensure!(
                    choice.live_revision == revision,
                    "实时配置在确认期间发生变化，已停止切换；请重新检查后再试。"
                );
                match choice.resolution {
                    LiveConflictResolution::ImportAsNewProfile => {
                        outcome.imported_profile_id = Some(import_live_as_new_profile(
                            home, &mut selected_settings, previous_active_relay_id,
                        )?);
                    }
                    LiveConflictResolution::DiscardLiveChanges => {
                        outcome.live_backup_path = Some(live_snapshot.backup(backup_root)
                            .context("备份实时配置失败，已停止切换")?);
                    }
                }
            }
            Err(error) => return Err(error),
        }
    } else {
        anyhow::ensure!(choice.is_none(), "切换目标已变化，请重新切换供应商。");
    }
    anyhow::ensure!(
        LiveFilesSnapshot::capture(home)? == live_snapshot,
        "实时配置在切换准备期间发生变化，已停止切换并保留原配置。"
    );
    crate::codex_app_state::capture_app_state_snapshot_nonfatal(home, "relay_switch.before");

    let committed_revision = store
        .save_versioned(&selected_settings)
        .context("保存供应商设置失败")?;
    let selected_settings = store.load().context("读取供应商设置失败")?;

    match apply_selected_relay_profile(home, &selected_settings) {
        Ok(result) => {
            crate::codex_app_state::sync_app_state_after_provider_switch_nonfatal(
                home,
                "relay_switch.after",
            );
            // 换供应商/聚合后，Codex 模型选择器里可能还留着上一个目录的模型 ID
            // （例如别的管理器写下的 `ccs-xxx/model`），按新目录清一遍。
            crate::codex_app_state::prune_stale_model_references_after_switch_nonfatal(
                home,
                &selected_settings,
                "relay_switch.after",
            );
            Ok((result, outcome))
        }
        Err(error) => {
            // 内部回滚恢复已验证原始字节，保留unknown字段并避免2→default1保护误拦。
            let settings_restore_error = store
                .restore_raw_snapshot(original_settings_bytes.as_deref(), &committed_revision)
                .err();
            let live_restore_error = live_snapshot.restore(home).err();
            if settings_restore_error.is_some() || live_restore_error.is_some() {
                anyhow::bail!(
                    "切换供应商失败：{error}；同时回滚配置失败：settings.json={}，Codex 实时文件={}",
                    settings_restore_error
                        .map(|error| error.to_string())
                        .unwrap_or_else(|| "ok".to_string()),
                    live_restore_error
                        .map(|error| error.to_string())
                        .unwrap_or_else(|| "ok".to_string())
                );
            }
            Err(error)
        }
    }
}

/// 切换请求必须携带完整 settings。供应商列表页曾按分页过滤后直接把子集提交给切换
/// （前端缺陷）：模型聚合会因成员不在请求里直接失败（聚合成员供应商不存在），
/// 一旦成功保存，其它分页的供应商还会从 settings.json 里消失。
/// 这里按 id 把磁盘上已有、请求里缺失的供应商与聚合配置补回；请求里的同 id 版本优先，
/// 只兜底缺失项，保证任何调用方都不会把用户配置越切越少。
fn restore_missing_saved_profiles(selected: &mut BackendSettings, saved: &BackendSettings) {
    let mut restored_ids: Vec<String> = Vec::new();
    for profile in &saved.relay_profiles {
        if !selected
            .relay_profiles
            .iter()
            .any(|item| item.id == profile.id)
        {
            selected.relay_profiles.push(profile.clone());
            restored_ids.push(profile.id.clone());
        }
    }
    for aggregate in &saved.aggregate_relay_profiles {
        if !selected
            .aggregate_relay_profiles
            .iter()
            .any(|item| item.id == aggregate.id)
        {
            selected.aggregate_relay_profiles.push(aggregate.clone());
            restored_ids.push(format!("aggregate:{}", aggregate.id));
        }
    }
    if !restored_ids.is_empty() {
        let _ = crate::diagnostic_log::append_diagnostic_log(
            "relay_switch.restored_missing_profiles",
            serde_json::json!({
                "restoredIds": restored_ids,
                "selectedProfileCount": selected.relay_profiles.len(),
                "savedProfileCount": saved.relay_profiles.len(),
            }),
        );
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LiveFilesSnapshot {
    config: Option<Vec<u8>>,
    auth: Option<Vec<u8>>,
}

impl LiveFilesSnapshot {
    fn revision(&self) -> String {
        let mut hash = Sha256::new();
        for contents in [&self.config, &self.auth] {
            match contents {
                Some(bytes) => {
                    hash.update([1]);
                    hash.update((bytes.len() as u64).to_le_bytes());
                    hash.update(bytes);
                }
                None => hash.update([0]),
            }
        }
        format!("{:x}", hash.finalize())
    }

    fn backup(&self, root: &Path) -> anyhow::Result<String> {
        // 自有备份不写 CODEX_HOME；每次使用独立目录，避免覆盖旧备份。
        let directory = root.join(format!("codex-plus-live-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root)?;
        let builder = std::fs::DirBuilder::new();
        #[cfg(unix)]
        let builder = {
            use std::os::unix::fs::DirBuilderExt;
            let mut builder = builder;
            builder.mode(0o700);
            builder
        };
        builder.create(&directory)?;
        for (name, contents) in [("config.toml", &self.config), ("auth.json", &self.auth)] {
            if let Some(contents) = contents {
                use std::io::Write;
                let mut options = std::fs::OpenOptions::new();
                options.write(true).create_new(true);
                #[cfg(unix)]
                {
                    use std::os::unix::fs::OpenOptionsExt;
                    options.mode(0o600);
                }
                let mut file = options.open(directory.join(name))?;
                file.write_all(contents)?;
                file.sync_all()?;
            }
        }
        Ok(directory.to_string_lossy().into_owned())
    }

    fn capture(home: &Path) -> anyhow::Result<Self> {
        Ok(Self {
            config: read_optional_bytes(&home.join("config.toml"))?,
            auth: read_optional_bytes(&home.join("auth.json"))?,
        })
    }

    fn restore(&self, home: &Path) -> anyhow::Result<()> {
        std::fs::create_dir_all(home)?;
        restore_optional_file(&home.join("config.toml"), self.config.as_deref())
            .context("恢复 config.toml 失败")?;
        restore_optional_file(&home.join("auth.json"), self.auth.as_deref())
            .context("恢复 auth.json 失败")?;
        Ok(())
    }
}

fn read_optional_bytes(path: &Path) -> anyhow::Result<Option<Vec<u8>>> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn restore_optional_file(path: &Path, contents: Option<&[u8]>) -> anyhow::Result<()> {
    match contents {
        Some(contents) => crate::settings::atomic_write(path, contents).map_err(Into::into),
        None => match std::fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        },
    }
}

fn backfill_profile_before_switch(
    home: &Path,
    settings: &mut BackendSettings,
    previous_active_relay_id: &str,
) -> anyhow::Result<()> {
    // 确认属于另一个已保存供应商的 live 配置，不回填到旧 profile（共享 Key 也适用）。
    if crate::relay_config::live_config_matches_other_profile_in_home(
        home,
        settings,
        previous_active_relay_id,
    )? {
        return Ok(());
    }
    // 找不到上一个供应商是用户能自助处理的一类原因（它已被删除或 id 变了），
    // 单独给一条能直接照做的话；下面回填失败则属于另一类，见那里的写法。
    let profile = settings
        .relay_profiles
        .iter_mut()
        .find(|profile| profile.id == previous_active_relay_id)
        .with_context(|| {
            format!(
                "当前供应商（{previous_active_relay_id}）已不在配置列表中，已停止切换以避免覆盖用户改动。"
            )
        })?;
    // issue #1888：管理器把本函数返回的错误拼成「回填当前供应商配置失败：{error}」，
    // 而 `{error}` 只打印最外层 context，底层原因（读 home 失败等）会被丢掉，
    // 用户看到的就是一句没有信息量的报错。这里把 context 链完整拼进消息里。
    backfill_relay_profile_from_home_with_common(
        home,
        profile,
        &mut settings.relay_context_config_contents,
    )
    .with_context(|| format!("回填当前供应商配置失败（供应商：{previous_active_relay_id}）"))
    .map_err(|error| {
        if error.chain().any(|cause| cause.is::<LiveEndpointChanged>()) {
            error
        } else {
            anyhow::anyhow!("{error:#}")
        }
    })
}

fn import_live_as_new_profile(
    home: &Path,
    settings: &mut BackendSettings,
    previous_active_relay_id: &str,
) -> anyhow::Result<String> {
    let mut imported = settings.relay_profiles.iter()
        .find(|profile| profile.id == previous_active_relay_id)
        .cloned()
        .context("原供应商已不存在，已停止导入实时配置")?;
    let base_name = if imported.name.trim().is_empty() {
        imported.id.clone()
    } else {
        imported.name.trim().to_string()
    };
    imported.id = format!("relay-{}", uuid::Uuid::new_v4());
    imported.name = format!("{base_name}（实时配置）");
    backfill_relay_profile_from_home_with_common_and_policy(
        home,
        &mut imported,
        &mut settings.relay_context_config_contents,
        RelayBackfillPolicy::AdoptLiveIdentity,
    ).context("把实时配置导入为新供应商失败，已停止切换")?;
    let id = imported.id.clone();
    settings.relay_profiles.push(imported);
    Ok(id)
}

fn apply_selected_relay_profile(
    home: &Path,
    settings: &BackendSettings,
) -> anyhow::Result<RelaySwitchResult> {
    let relay = settings.active_relay_profile();
    let common_config = relay_combined_common_config(settings);
    let result = if relay.relay_mode == RelayMode::Official && !relay.official_mix_api_key {
        crate::relay_config::apply_relay_profile_with_preservation(home, &relay, &common_config, crate::protocol_proxy::protocol_proxy_port(), settings.relay_preserve_nonprovider_settings)?
    } else {
        validate_switch_profile_files(&relay)?;
        crate::relay_config::apply_relay_profile_with_preservation(
            home, &relay, &common_config, crate::protocol_proxy::protocol_proxy_port(), settings.relay_preserve_nonprovider_settings,
        )?
    };
    let status = relay_config_status_from_home(home);
    if relay.relay_mode == RelayMode::PureApi && !status.configured {
        anyhow::bail!(
            "纯 API 配置写入后未检测到完整 custom provider，请检查 config.toml 和供应商 API Key。"
        );
    }
    Ok(RelaySwitchResult {
        settings: settings.clone(),
        configured: status.configured,
        backup_path: result.backup_path,
    })
}

fn validate_switch_profile_files(profile: &crate::settings::RelayProfile) -> anyhow::Result<()> {
    if profile.relay_mode != RelayMode::Aggregate && profile.config_contents.trim().is_empty() {
        anyhow::bail!(
            "供应商「{}」缺少独立 config.toml，已停止切换，避免继续显示上一套配置文件。",
            if profile.name.trim().is_empty() {
                profile.id.as_str()
            } else {
                profile.name.as_str()
            }
        );
    }
    if profile.relay_mode == RelayMode::Official
        && serde_json::from_str::<serde_json::Value>(&profile.auth_contents)
            .ok()
            .and_then(|value| {
                value
                    .get("OPENAI_API_KEY")
                    .and_then(serde_json::Value::as_str)
                    .map(str::trim)
                    .map(str::is_empty)
            })
            == Some(false)
    {
        anyhow::bail!(
            "官方混合 API 不应在 auth.json 中保存 OPENAI_API_KEY。请清理此供应商的 auth.json 后再切换。"
        );
    }
    Ok(())
}

fn relay_combined_common_config(settings: &BackendSettings) -> String {
    let sections = [
        settings.relay_common_config_contents.trim(),
        settings.relay_context_config_contents.trim(),
    ]
    .into_iter()
    .filter(|section| !section.is_empty())
    .collect::<Vec<_>>();
    if sections.is_empty() {
        String::new()
    } else {
        crate::relay_config::normalize_config_text(&format!("{}\n", sections.join("\n\n")))
    }
}
