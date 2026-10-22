use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use codex_plus_core::models::{DeleteResult, SessionRef};
use codex_plus_core::settings::{
    BackendSettings, RelayMode, RelayProfile, RelaySessionProvider, SettingsStore,
};
use codex_plus_core::status::{LaunchStatus, StatusStore};
use serde::Serialize;
use serde_json::{Value, json};
use tauri::Emitter;

use crate::install::{self, InstallActionResult};

#[tauri::command]
pub fn dictation_local_model_status() -> Value {
    codex_plus_core::dictation::local_model_status()
}

/// 只注册为管理器命令，不开放给用户脚本或公开 HTTP 路由。
#[tauri::command]
pub async fn download_dictation_local_model() -> CommandResult<Value> {
    match codex_plus_core::dictation::prepare_local_model().await {
        Ok(state) => ok("本地 SenseVoice 模型下载并校验完成。", state),
        Err(error) => failed(&error.message, json!({})),
    }
}

#[tauri::command]
pub fn load_global_dictation_hotkey() -> CommandResult<Value> {
    ok(
        "全局听写热键设置已读取。",
        serde_json::to_value(codex_plus_core::global_dictation::load_config()).unwrap_or_else(|_| json!({})),
    )
}

#[tauri::command]
pub fn set_global_dictation_hotkey(enabled: bool, hotkey: String) -> CommandResult<Value> {
    let config = codex_plus_core::global_dictation::GlobalDictationConfig {
        enabled,
        hotkey: hotkey.trim().to_string(),
    };
    match crate::global_dictation::save_and_apply_config(&config) {
        Ok(()) => ok(
            if enabled { "全局听写热键已开启。" } else { "全局听写热键已关闭。" },
            serde_json::to_value(config).unwrap_or_else(|_| json!({})),
        ),
        Err(error) => failed(
            &format!("更新全局听写热键失败：{error:#}"),
            serde_json::to_value(codex_plus_core::global_dictation::load_config()).unwrap_or_else(|_| json!({})),
        ),
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CommandResult<T>
where
    T: Serialize,
{
    pub status: String,
    pub message: String,
    #[serde(flatten)]
    pub payload: T,
}

#[derive(Debug, Clone, Serialize)]
pub struct VersionPayload {
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PathState {
    pub status: String,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OverviewPayload {
    pub codex_app: PathState,
    pub codex_version: Option<String>,
    pub silent_shortcut: PathState,
    pub management_shortcut: PathState,
    pub latest_launch: Option<LaunchStatus>,
    pub runtime_health: crate::runtime_health::RuntimeHealth,
    pub current_version: String,
    pub settings_path: String,
    pub logs_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SettingsPayload {
    pub revision: String,
    pub settings: BackendSettings,
    pub settings_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcsProvidersPayload {
    pub db_path: String,
    pub configured_db_path: String,
    pub fallback_reason: Option<String>,
    pub providers: Vec<codex_plus_core::ccs_import::CcsProviderImport>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingProviderImportPayload {
    pub pending: Option<codex_plus_core::provider_import::ProviderImportRequest>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSessionsPayload {
    pub db_path: String,
    pub db_paths: Vec<String>,
    pub sessions: Vec<codex_plus_data::LocalSession>,
    pub offset: usize,
    pub limit: usize,
    pub has_more: bool,
    pub total_count: usize,
}

const DEFAULT_LOCAL_SESSIONS_PAGE_SIZE: usize = 50;
const MAX_LOCAL_SESSIONS_PAGE_SIZE: usize = 100;

fn default_local_sessions_page_size() -> usize {
    DEFAULT_LOCAL_SESSIONS_PAGE_SIZE
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListLocalSessionsRequest {
    #[serde(default)]
    pub offset: usize,
    #[serde(default = "default_local_sessions_page_size")]
    pub limit: usize,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListProjectSessionsRequest {
    #[serde(default)]
    pub cwd: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteLocalSessionRequest {
    pub session_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub db_path: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveLocalSessionsRequest {
    #[serde(default)]
    pub sessions: Vec<codex_plus_data::LocalSession>,
    #[serde(default)]
    pub archived: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayPayload {
    pub authenticated: bool,
    pub auth_source: String,
    pub account_label: Option<String>,
    pub config_path: String,
    pub configured: bool,
    pub requires_openai_auth: bool,
    pub has_bearer_token: bool,
    pub backup_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayFilesPayload {
    pub config_path: String,
    pub auth_path: String,
    pub config_contents: String,
    pub auth_contents: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelaySwitchPayload {
    pub settings: BackendSettings,
    pub relay: RelayPayload,
    pub settings_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsBackfillPayload {
    pub settings: BackendSettings,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextEntriesPayload {
    pub settings: BackendSettings,
    pub entries: codex_plus_core::relay_config::CodexContextEntries,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveContextEntriesPayload {
    pub entries: codex_plus_core::relay_config::CodexContextEntries,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractRelayCommonConfigPayload {
    pub common_config_contents: String,
    pub profile_config_contents: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayProfileTestPayload {
    pub http_status: u16,
    pub endpoint: String,
    pub response_preview: String,
    pub protocol_valid: bool,
    pub completion_status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepwiseTestPayload {
    pub item_count: usize,
    pub error: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayProfileModelsPayload {
    pub models: Vec<String>,
    pub endpoint: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sub2ApiBillingPayload {
    pub endpoint: String,
    pub group_rate_multiplier: f64,
    pub user_rate_multiplier: Option<f64>,
    pub resolved_rate_multiplier: f64,
    pub peak_rate_enabled: bool,
    pub peak_rate_multiplier: Option<f64>,
    pub applied_peak_multiplier: Option<f64>,
    pub effective_rate_multiplier: f64,
    pub observed_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDoctorCheck {
    pub id: String,
    pub title: String,
    pub status: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDoctorPayload {
    pub profile_name: String,
    pub model: String,
    pub summary: String,
    pub recommendation: String,
    pub checks: Vec<ProviderDoctorCheck>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvConflictsPayload {
    pub conflicts: Vec<codex_plus_core::env_conflicts::EnvConflict>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveEnvConflictsRequest {
    pub names: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveEnvConflictsPayload {
    pub removed: Vec<codex_plus_core::env_conflicts::EnvConflictRemoval>,
    pub backup_path: Option<String>,
    pub remaining: Vec<codex_plus_core::env_conflicts::EnvConflict>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRelayFileRequest {
    pub kind: String,
    pub contents: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackfillRelayProfileRequest {
    pub settings: BackendSettings,
    pub profile_id: String,
    #[serde(default)]
    pub adopt_provider_identity: bool,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSettingsRequest {
    pub settings: BackendSettings,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextEntryRequest {
    pub settings: BackendSettings,
    pub kind: String,
    pub id: String,
    pub toml_body: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextDeleteRequest {
    pub settings: BackendSettings,
    pub kind: String,
    pub id: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractRelayCommonConfigRequest {
    pub config_contents: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    #[serde(default)]
    pub app_path: String,
    #[serde(default = "default_debug_port")]
    pub debug_port: u16,
    #[serde(default = "default_helper_port")]
    pub helper_port: u16,
    #[serde(default)]
    pub sync_active_relay: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct WatcherPayload {
    pub enabled: bool,
    pub disabled_flag: String,
    pub start_minimized: bool,
    pub start_codex: bool,
    pub start_codex_on_open: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsPayload {
    pub skills: Vec<codex_plus_core::skills::SkillEntry>,
    pub repos: Vec<codex_plus_core::skills::SkillRepo>,
    pub repository_skills: Vec<codex_plus_core::skills::SkillEntry>,
    pub repo_counts: std::collections::BTreeMap<String, usize>,
    pub backups: Vec<codex_plus_core::skills::SkillBackup>,
    /// 单个仓库拉取失败不该让整块面板空掉，把错误单独带回前端提示。
    pub repo_errors: Vec<String>,
    pub skills_dir: String,
    pub codex_skills_dir: String,
}

#[tauri::command]
pub fn backend_version() -> CommandResult<VersionPayload> {
    ok(
        "后端版本已读取。",
        VersionPayload {
            version: codex_plus_core::version::VERSION.to_string(),
        },
    )
}

#[tauri::command]
pub fn consume_pending_manager_navigation()
-> Result<Option<codex_plus_core::manager_navigation::ManagerNavigationIntent>, String> {
    codex_plus_core::manager_navigation::consume_pending_manager_navigation()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn load_overview() -> CommandResult<OverviewPayload> {
    let payload = tauri::async_runtime::spawn_blocking(load_overview_payload).await;
    let Ok((codex_app_path, entrypoints, latest_launch, runtime_health)) = payload else {
        return failed(
            "概览后台任务失败。",
            OverviewPayload {
                codex_app: path_state(None),
                codex_version: None,
                silent_shortcut: path_state(None),
                management_shortcut: path_state(None),
                latest_launch: None,
                runtime_health: crate::runtime_health::RuntimeHealth::unavailable(),
                current_version: codex_plus_core::version::VERSION.to_string(),
                settings_path: codex_plus_core::paths::default_settings_path()
                    .to_string_lossy()
                    .to_string(),
                logs_path: codex_plus_core::paths::default_diagnostic_log_path()
                    .to_string_lossy()
                    .to_string(),
            },
        );
    };
    ok(
        "概览已加载。",
        OverviewPayload {
            codex_version: codex_app_path
                .as_deref()
                .and_then(codex_plus_core::app_paths::codex_app_version),
            codex_app: path_state(codex_app_path),
            silent_shortcut: shortcut_state(entrypoints.silent_shortcut),
            management_shortcut: shortcut_state(entrypoints.management_shortcut),
            latest_launch,
            runtime_health,
            current_version: codex_plus_core::version::VERSION.to_string(),
            settings_path: codex_plus_core::paths::default_settings_path()
                .to_string_lossy()
                .to_string(),
            logs_path: codex_plus_core::paths::default_diagnostic_log_path()
                .to_string_lossy()
                .to_string(),
        },
    )
}

#[tauri::command]
pub async fn launch_codex_plus(request: LaunchRequest) -> CommandResult<Value> {
    match tauri::async_runtime::spawn_blocking(move || {
        let _guard = match try_acquire_launch_guard() {
            Ok(guard) => guard,
            Err(message) => return failed(message, json!({})),
        };
        spawn_codex_plus_launch(request, "启动任务已在后台开始，可稍后查看概览状态。")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => failed(&format!("启动后台任务失败：{error}"), json!({})),
    }
}

#[tauri::command]
pub async fn restart_codex_plus(request: LaunchRequest) -> CommandResult<Value> {
    match tauri::async_runtime::spawn_blocking(move || restart_codex_plus_blocking(request)).await {
        Ok(result) => result,
        Err(error) => failed(&format!("重启后台任务失败：{error}"), json!({})),
    }
}

static LAUNCH_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

struct LaunchGuard;

impl Drop for LaunchGuard {
    fn drop(&mut self) {
        LAUNCH_IN_PROGRESS.store(false, Ordering::Release);
    }
}

fn try_acquire_launch_guard() -> Result<LaunchGuard, &'static str> {
    LAUNCH_IN_PROGRESS
        .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
        .map(|_| LaunchGuard)
        .map_err(|_| "启动或重启正在进行，请等待本次操作完成。")
}

/// 供自动接管守护线程复用同一把串行锁：它与用户点「启动/重启」必须互斥，
/// 否则会出现两套 launcher 会话抢同一个官方 App。
pub fn try_acquire_launch_guard_for_takeover() -> Result<impl Drop, &'static str> {
    try_acquire_launch_guard()
}

/// 是否有启动/重启在途（判据用，只读）。
pub fn launch_in_progress() -> bool {
    LAUNCH_IN_PROGRESS.load(Ordering::Acquire)
}

/// 自动接管发起的启动：走与「点启动」完全相同的 launcher 链路。
///
/// 与 `start_embedded_launcher` 的唯一区别是入参由守护线程解析，不接受前端传来的
/// 临时状态。
pub fn run_auto_takeover_launch(request: LaunchRequest) -> Result<(), String> {
    if crate::app_is_exiting() {
        return Err("Codex++ 正在退出，未启动 Codex".to_string());
    }
    let launch_options = codex_plus_launcher::LaunchOptions {
        app_dir: (!request.app_path.trim().is_empty())
            .then(|| PathBuf::from(request.app_path.trim())),
        debug_port: request.debug_port,
        helper_port: request.helper_port,
        status_store: StatusStore::default(),
        ..Default::default()
    };
    codex_plus_launcher::start(launch_options).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_auto_takeover_state() -> CommandResult<crate::auto_takeover::AutoTakeoverPayload> {
    ok("自动接管状态已加载。", crate::auto_takeover::payload())
}

#[tauri::command]
pub fn take_over_codex_now() -> CommandResult<crate::auto_takeover::AutoTakeoverPayload> {
    match crate::auto_takeover::take_over_now() {
        Ok(()) => ok("已发起接管。", crate::auto_takeover::payload()),
        Err(message) => failed(&message, crate::auto_takeover::payload()),
    }
}

#[tauri::command]
pub fn pause_auto_takeover_for_instance() -> CommandResult<crate::auto_takeover::AutoTakeoverPayload>
{
    match crate::auto_takeover::pause_until_next_instance() {
        Ok(()) => ok(
            "本次不再自动接管，重启官方 App 后恢复。",
            crate::auto_takeover::payload(),
        ),
        Err(message) => failed(&message, crate::auto_takeover::payload()),
    }
}

#[derive(Debug, PartialEq, Eq)]
enum RestartDisposition {
    LaunchOnly,
    StopAndRestart,
}

fn restart_disposition(sync_active_relay: bool, app_running: bool) -> RestartDisposition {
    if !sync_active_relay && !app_running {
        RestartDisposition::LaunchOnly
    } else {
        RestartDisposition::StopAndRestart
    }
}

fn restart_codex_plus_blocking(request: LaunchRequest) -> CommandResult<Value> {
    let _launch_guard = match try_acquire_launch_guard() {
        Ok(guard) => guard,
        Err(message) => return failed(message, json!({})),
    };
    let request = normalize_launch_request(request);
    // 按本实例的调试端口判定是否在跑。
    // 早先用 `find_codex_processes_for_debug_port`，但它在非 macOS 上返回全部
    // Codex 进程：Windows 上只要有多开实例在跑，就会把「主 Codex 没开」误判成
    // 「已运行」，进而走进重启分支去停进程。
    let app_running = codex_plus_core::cdp::endpoint_available(request.debug_port);
    if restart_disposition(request.sync_active_relay, app_running) == RestartDisposition::LaunchOnly
    {
        return spawn_codex_plus_launch(request, "Codex 未运行，已按直接启动方式在后台唤起。");
    }
    let Ok(_guard) = relay_switch_mutex().try_lock() else {
        return failed(
            "供应商切换正在进行或锁不可用，未执行重启；请稍后重试。",
            json!({}),
        );
    };
    let settings = if request.sync_active_relay {
        match SettingsStore::default().load() {
            Ok(settings) => Some(settings),
            Err(error) => {
                return failed(
                    &format!("读取已保存供应商设置失败，未执行重启：{error}"),
                    json!({
                        "debugPort": request.debug_port,
                        "helperPort": request.helper_port
                    }),
                );
            }
        }
    } else {
        None
    };
    let provider_guard = match ensure_provider_sync_is_idle_before_stop() {
        Ok(guard) => guard,
        Err(message) => return failed(&message, json!({})),
    };
    // 停止 Codex 后清理同进程后台服务，再确认浏览器恢复结果。
    // 先记录停止阶段，让界面在等待期间显示进度（issue #2403）。
    // 该状态带的是当前时间戳，早于后面返回给前端的 launch_started_at_ms，
    // 因此等待完成度判定时会被视作 stale，不会误报成最终结果。
    let _ = StatusStore::default().save_latest(&requested_launch_status_with_phase(
        &request,
        "stopping",
        "正在停止 Codex 并清理后台服务…",
        current_timestamp_ms(),
        "restart_stopping",
        10,
    ));
    let native_browser_shutdown = match stop_codex_plus_for_restart(
        || {
            // 主实例在 Windows 上是 AUMID 激活的，命令行未必带调试端口；
            // 这里允许「按端口没匹配到就退回全局结束」，否则重启会卡在
            // 「Codex 进程尚未退出」。多开页的结束走的是不允许退回的那个版本。
            #[cfg(windows)]
            codex_plus_core::watcher::stop_codex_processes_for_debug_port_with_fallback(
                request.debug_port,
                true,
            );
            #[cfg(not(windows))]
            codex_plus_core::watcher::stop_codex_processes_for_debug_port_and_wait(
                request.debug_port,
            );
            anyhow::ensure!(
                !codex_plus_core::cdp::endpoint_available(request.debug_port),
                "Codex 进程尚未退出；未启动新实例"
            );
            Ok(())
        },
        codex_plus_launcher::stop,
        || {
            codex_plus_core::native_browser::wait_for_monitor_shutdown(
                std::time::Duration::from_secs(10),
            )
        },
    ) {
        Ok(shutdown) => shutdown,
        Err(error) => {
            return failed(
                &restart_stop_failure_message(&error),
                json!({"debugPort": request.debug_port, "helperPort": request.helper_port}),
            );
        }
    };
    let native_browser_restore_failed = matches!(
        native_browser_shutdown,
        codex_plus_core::native_browser::NativeBrowserShutdown::RestoreFailed
    );
    if native_browser_restore_failed {
        let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
            "native_browser.cleanup_not_restored",
            json!({"state": "blocked"}),
        );
    }
    if let Err(error) = prepare_fixed_helper_port_for_restart(settings.as_ref()) {
        return failed(
            &format!("重启 Codex 失败：{error:#}"),
            json!({"debugPort": request.debug_port, "helperPort": request.helper_port}),
        );
    }
    let home = codex_plus_core::relay_config::default_codex_home_dir();
    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
        "manager.restart_requested",
        json!({
            "debug_port": request.debug_port,
            "helper_port": request.helper_port,
            "app_path": request.app_path.trim(),
            "sync_active_relay": request.sync_active_relay
        }),
    );
    let launch_started_at_ms = current_timestamp_ms();
    if let Err(error) = save_requested_launch_status(
        &request,
        "starting",
        "Codex++ launcher is starting",
        launch_started_at_ms,
    ) {
        return failed(
            &format!("记录重启状态失败，未执行重启：{error}"),
            json!({
                "debugPort": request.debug_port,
                "helperPort": request.helper_port,
                "syncActiveRelay": request.sync_active_relay
            }),
        );
    }
    let mut restart_message = "Codex 已请求重启，启动任务正在后台运行。".to_string();
    match restart_codex_plus_after_stop(&request, &home, settings.as_ref(), |request| {
        spawn_after_provider_guard_release(provider_guard, request, start_embedded_launcher)
    }) {
        Ok(warnings) => {
            for warning in warnings {
                restart_message.push_str("\n\n");
                restart_message.push_str(&warning);
            }
            let (debug_port, helper_port, started_at_ms) =
                accepted_launch_identity(&request, launch_started_at_ms);
            CommandResult {
                status: "accepted".to_string(),
                message: restart_message,
                payload: json!({
                    "debugPort": debug_port,
                    "helperPort": helper_port,
                    "syncActiveRelay": request.sync_active_relay,
                    "launchStartedAtMs": started_at_ms,
                    "nativeBrowserRestoreFailed": native_browser_restore_failed,
                    "forcedStoppedLauncherCount": 0
                }),
            }
        }
        Err(error) => {
            let message = format!("重启 Codex 失败：{error}");
            let _ =
                save_requested_launch_status(&request, "failed", &message, launch_started_at_ms);
            failed(
                &message,
                json!({
                    "debugPort": request.debug_port,
                    "helperPort": request.helper_port,
                    "syncActiveRelay": request.sync_active_relay,
                    "launchStartedAtMs": launch_started_at_ms,
                    "nativeBrowserRestoreFailed": native_browser_restore_failed
                }),
            )
        }
    }
}

fn stop_codex_plus_for_restart(
    stop_codex: impl FnOnce() -> anyhow::Result<()>,
    stop_runtime: impl FnOnce() -> anyhow::Result<()>,
    wait_native: impl FnOnce() -> anyhow::Result<codex_plus_core::native_browser::NativeBrowserShutdown>,
) -> Result<codex_plus_core::native_browser::NativeBrowserShutdown, RestartStopError> {
    // 后台服务持有浏览器恢复任务。停止服务须等待它清理，不能结束主进程。
    stop_codex().map_err(RestartStopError::Codex)?;
    stop_runtime().map_err(RestartStopError::Runtime)?;
    wait_native().map_err(RestartStopError::NativeBrowser)
}

#[derive(Debug)]
enum RestartStopError {
    Codex(anyhow::Error),
    NativeBrowser(anyhow::Error),
    Runtime(anyhow::Error),
}

fn restart_stop_failure_message(error: &RestartStopError) -> String {
    match error {
        RestartStopError::Codex(error) => {
            format!("Codex 进程尚未确认退出，未清理原生浏览器或启动新实例：{error}")
        }
        RestartStopError::NativeBrowser(error) => {
            let summary = if error
                .downcast_ref::<codex_plus_core::native_browser::NativeBrowserCleanupStillRunning>()
                .is_some()
            {
                "仍在恢复"
            } else {
                "恢复失败"
            };
            format!("Codex 已请求停止，但原生浏览器文件{summary}，未启动新实例：{error}")
        }
        RestartStopError::Runtime(error) => {
            format!("Codex 已请求停止，但后台服务尚未清理完成，未启动新实例：{error}")
        }
    }
}

fn prepare_fixed_helper_port_for_restart(settings: Option<&BackendSettings>) -> anyhow::Result<()> {
    let loaded;
    let settings = match settings {
        Some(settings) => settings,
        None => match SettingsStore::default().load() {
            Ok(value) => {
                loaded = value;
                &loaded
            }
            // 读不到设置时仍交给 launcher 自己等。这里失败不应把一次普通重启拦死。
            Err(_) => return Ok(()),
        },
    };
    if codex_plus_core::launcher::required_fixed_helper_port(settings).is_none() {
        return Ok(());
    }
    // 与 launcher 启动时同一套迁移：端口落在 Windows 保留区间（10013）时先换端口，
    // 否则下面会对着永远绑不上的旧端口等满超时，重启必然失败（#1163）。
    let port = codex_plus_core::protocol_proxy::ensure_protocol_proxy_port_available();
    codex_plus_core::launcher::wait_for_fixed_helper_port(
        port,
        codex_plus_core::launcher::protocol_proxy_bind_retry_timeout_ms(),
        codex_plus_core::launcher::helper_bind_retry_interval_ms(),
        probe_loopback_port,
        |interval_ms| std::thread::sleep(std::time::Duration::from_millis(interval_ms)),
    )
}

fn probe_loopback_port(port: u16) -> std::io::Result<()> {
    let _listener = std::net::TcpListener::bind(("127.0.0.1", port))?;
    Ok(())
}

fn spawn_after_provider_guard_release(
    guard: codex_plus_data::ProviderSyncLifecycleGuard,
    request: &LaunchRequest,
    spawn: impl FnOnce(&LaunchRequest) -> anyhow::Result<()>,
) -> anyhow::Result<()> {
    guard
        .release()
        .map_err(|error| anyhow::anyhow!("释放历史同步锁失败，未启动新实例：{error}"))?;
    spawn(request)
}

fn restart_codex_plus_after_stop<F>(
    request: &LaunchRequest,
    home: &Path,
    settings: Option<&BackendSettings>,
    spawn: F,
) -> anyhow::Result<Vec<String>>
where
    F: FnOnce(&LaunchRequest) -> anyhow::Result<()>,
{
    let mut warnings = Vec::new();
    let snapshot = if let Some(settings) = settings {
        let snapshot = RelayLiveSnapshot::capture(home)?;
        if let Err(error) = sync_active_relay_to_home(settings, home) {
            if let Err(restore_error) = snapshot.restore(home) {
                anyhow::bail!("同步当前供应商失败：{error}；回滚 live 配置也失败：{restore_error}");
            }
            return Err(error);
        }
        if let Some(warning) =
            codex_plus_core::aggregate_catalog::subagent_conflict_warning(home, settings)
        {
            warnings.push(warning);
        }
        Some(snapshot)
    } else {
        None
    };

    if let Err(error) = spawn(request) {
        if let Some(snapshot) = snapshot {
            if let Err(restore_error) = snapshot.restore(home) {
                anyhow::bail!("启动 Codex 失败：{error}；回滚 live 配置也失败：{restore_error}");
            }
        }
        return Err(error);
    }
    Ok(warnings)
}

#[derive(Debug)]
struct RelayLiveSnapshot {
    config: Option<Vec<u8>>,
    auth: Option<Vec<u8>>,
}

impl RelayLiveSnapshot {
    fn capture(home: &Path) -> anyhow::Result<Self> {
        Ok(Self {
            config: read_optional_file_bytes(&home.join("config.toml"))?,
            auth: read_optional_file_bytes(&home.join("auth.json"))?,
        })
    }

    fn restore(&self, home: &Path) -> anyhow::Result<()> {
        std::fs::create_dir_all(home)?;
        restore_optional_file_bytes(&home.join("config.toml"), self.config.as_deref())?;
        restore_optional_file_bytes(&home.join("auth.json"), self.auth.as_deref())?;
        Ok(())
    }
}

fn read_optional_file_bytes(path: &Path) -> anyhow::Result<Option<Vec<u8>>> {
    match std::fs::read(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn restore_optional_file_bytes(path: &Path, contents: Option<&[u8]>) -> anyhow::Result<()> {
    match contents {
        Some(contents) => codex_plus_core::settings::atomic_write(path, contents)?,
        None => match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        },
    }
    Ok(())
}

fn sync_active_relay_to_home(
    settings: &BackendSettings,
    home: &Path,
) -> anyhow::Result<codex_plus_core::relay_config::RelayApplyResult> {
    if !settings.relay_profiles_enabled {
        anyhow::bail!("供应商配置总开关已关闭，未同步 live 配置");
    }
    let relay = settings.active_relay_profile();
    if relay.relay_mode == codex_plus_core::settings::RelayMode::Aggregate {
        if settings.active_aggregate_relay_profile().is_none() {
            anyhow::bail!("当前聚合供应商配置不完整");
        }
        let aggregate = settings
            .active_aggregate_relay_profile()
            .ok_or_else(|| anyhow::anyhow!("当前聚合供应商配置不完整"))?;
        if aggregate.model_aggregation_enabled {
            return codex_plus_core::relay_config::apply_relay_profile_to_home_with_switch_rules(
                home,
                &relay,
                &relay_combined_common_config(settings),
            );
        }
        return codex_plus_core::relay_config::apply_relay_config_to_home_with_session_provider(
            home,
            &codex_plus_core::protocol_proxy::local_responses_proxy_base_url(
                codex_plus_core::protocol_proxy::protocol_proxy_port(),
            ),
            "codex-plus-aggregate",
            codex_plus_core::settings::RelayProtocol::Responses,
            codex_plus_core::protocol_proxy::protocol_proxy_port(),
            aggregate.session_provider,
        );
    }
    if relay.relay_mode == codex_plus_core::settings::RelayMode::Official
        && !relay.official_mix_api_key
    {
        let auth_contents =
            (!relay.auth_contents.trim().is_empty()).then_some(relay.auth_contents.as_str());
        return codex_plus_core::relay_config::clear_relay_config_to_home_with_auth(
            home,
            auth_contents,
        );
    }
    if relay_has_complete_files(&relay) {
        return codex_plus_core::relay_config::apply_relay_profile_to_home_with_switch_rules(
            home,
            &relay,
            &relay_combined_common_config(settings),
        );
    }

    let mut base_url = relay.base_url.trim().to_string();
    let mut protocol = relay.protocol;
    if relay.has_model_routes() {
        base_url = codex_plus_core::protocol_proxy::local_responses_proxy_base_url(
            codex_plus_core::protocol_proxy::protocol_proxy_port(),
        );
        protocol = codex_plus_core::settings::RelayProtocol::Responses;
    }
    if relay.relay_mode == codex_plus_core::settings::RelayMode::PureApi {
        return codex_plus_core::relay_config::apply_pure_api_config_to_home_with_session_provider(
            home,
            &base_url,
            &relay.api_key,
            protocol,
            codex_plus_core::protocol_proxy::protocol_proxy_port(),
            codex_plus_core::relay_config::relay_session_provider_from_config(
                &relay.config_contents,
            ),
        );
    }

    let auth = codex_plus_core::relay_config::chatgpt_auth_status_from_home(home);
    if !auth.authenticated {
        anyhow::bail!("未检测到 ChatGPT 登录状态，已停止同步 live 配置");
    }
    codex_plus_core::relay_config::apply_relay_config_to_home_with_session_provider(
        home,
        &base_url,
        &relay.api_key,
        protocol,
        codex_plus_core::protocol_proxy::protocol_proxy_port(),
        codex_plus_core::relay_config::relay_session_provider_from_config(&relay.config_contents),
    )
}

fn normalize_launch_request(mut request: LaunchRequest) -> LaunchRequest {
    // launcher 收到显式 --app-path 时不会回退自动探测（避免静默启动错误目录），
    // 所以这里先把明显无效的路径摘掉，让它走探测而不是永久失败（#1972）。
    let requested_app_path = request.app_path.trim().to_string();
    if !requested_app_path.is_empty()
        && codex_plus_core::app_paths::normalize_codex_app_path(Path::new(&requested_app_path))
            .is_none()
    {
        let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
            "manager.launch_app_path_rejected",
            json!({ "app_path": requested_app_path }),
        );
        request.app_path = String::new();
    }
    request
}

fn spawn_codex_plus_launch(request: LaunchRequest, accepted_message: &str) -> CommandResult<Value> {
    let request = normalize_launch_request(request);
    let debug_port = request.debug_port;
    let helper_port = request.helper_port;
    let launch_started_at_ms = current_timestamp_ms();
    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
        "manager.launch_requested",
        json!({
            "debug_port": debug_port,
            "helper_port": helper_port,
            "app_path": request.app_path.trim()
        }),
    );
    if let Err(error) = save_requested_launch_status(
        &request,
        "starting",
        "Codex++ launcher is starting",
        launch_started_at_ms,
    ) {
        return failed(
            &format!("记录启动状态失败，未执行启动：{error}"),
            json!({
                "debugPort": debug_port,
                "helperPort": helper_port
            }),
        );
    }
    match start_embedded_launcher(&request) {
        Ok(()) => {
            let (debug_port, helper_port, started_at_ms) =
                accepted_launch_identity(&request, launch_started_at_ms);
            CommandResult {
                status: "accepted".to_string(),
                message: accepted_message.to_string(),
                payload: json!({
                    "debugPort": debug_port,
                    "helperPort": helper_port,
                    "launchStartedAtMs": started_at_ms
                }),
            }
        }
        Err(error) => {
            let message = format!("启动 Codex 失败：{error}");
            let _ =
                save_requested_launch_status(&request, "failed", &message, launch_started_at_ms);
            failed(
                &message,
                json!({
                    "debugPort": debug_port,
                    "helperPort": helper_port,
                    "launchStartedAtMs": launch_started_at_ms
                }),
            )
        }
    }
}

fn accepted_launch_identity(request: &LaunchRequest, requested_at: u64) -> (u16, u16, u64) {
    let latest = StatusStore::default().load_latest().ok().flatten();
    launch_identity_from_status(request, requested_at, latest.as_ref())
}

fn launch_identity_from_status(
    request: &LaunchRequest,
    requested_at: u64,
    latest: Option<&LaunchStatus>,
) -> (u16, u16, u64) {
    // 重复启动会激活当前 session，其身份不能被新请求覆盖；端口也可能已自动换位。
    if let Some(latest) =
        latest.filter(|status| matches!(status.status.as_str(), "running" | "running_degraded"))
    {
        (
            latest.debug_port.unwrap_or(request.debug_port),
            latest.helper_port.unwrap_or(request.helper_port),
            latest.started_at_ms,
        )
    } else {
        (request.debug_port, request.helper_port, requested_at)
    }
}

fn save_requested_launch_status(
    request: &LaunchRequest,
    status: &str,
    message: &str,
    started_at_ms: u64,
) -> anyhow::Result<()> {
    StatusStore::default().save_latest(&requested_launch_status(
        request,
        status,
        message,
        started_at_ms,
    ))
}

fn requested_launch_status(
    request: &LaunchRequest,
    status: &str,
    message: &str,
    started_at_ms: u64,
) -> LaunchStatus {
    LaunchStatus {
        status: status.to_string(),
        message: message.to_string(),
        started_at_ms,
        debug_port: Some(request.debug_port),
        helper_port: Some(request.helper_port),
        codex_app: (!request.app_path.trim().is_empty())
            .then(|| request.app_path.trim().to_string()),
        aumid: None,
        phase: None,
        progress: None,
    }
}

/// 停止阶段的状态：带 `phase`/`progress`，让界面在阻塞的十几秒里有明确中间态
/// （issue #2403：此前只有 `starting`，看不出是在处理还是卡死）。
fn requested_launch_status_with_phase(
    request: &LaunchRequest,
    status: &str,
    message: &str,
    started_at_ms: u64,
    phase: &str,
    progress: u8,
) -> LaunchStatus {
    LaunchStatus {
        phase: Some(phase.to_string()),
        progress: Some(progress.min(100)),
        ..requested_launch_status(request, status, message, started_at_ms)
    }
}

fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn start_embedded_launcher(request: &LaunchRequest) -> anyhow::Result<()> {
    anyhow::ensure!(!crate::app_is_exiting(), "Codex++ 正在退出，未启动 Codex");
    codex_plus_launcher::start(codex_plus_launcher::LaunchOptions {
        app_dir: (!request.app_path.trim().is_empty())
            .then(|| PathBuf::from(request.app_path.trim())),
        debug_port: request.debug_port,
        helper_port: request.helper_port,
        status_store: StatusStore::default(),
        ..Default::default()
    })
}

/// 重新打开管理界面时恢复已有 Codex 的 Helper、代理和注入，不启动官方应用。
pub fn resume_existing_codex_background(app: tauri::AppHandle, start_if_missing: bool) {
    tauri::async_runtime::spawn_blocking(move || {
        if crate::app_is_exiting() {
            return;
        }
        let settings = SettingsStore::default().load().unwrap_or_default();
        let latest = StatusStore::default().load_latest().unwrap_or(None);
        let options = codex_plus_launcher::LaunchOptions {
            app_dir: codex_plus_core::app_paths::resolve_codex_app_dir_with_saved(
                latest
                    .as_ref()
                    .and_then(|status| status.codex_app.as_deref())
                    .map(Path::new),
                Some(settings.codex_app_path.as_str()),
            ),
            debug_port: latest
                .as_ref()
                .and_then(|status| status.debug_port)
                .unwrap_or_else(default_debug_port),
            helper_port: latest
                .as_ref()
                .and_then(|status| status.helper_port)
                .unwrap_or_else(default_helper_port),
            status_store: StatusStore::default(),
            ..Default::default()
        };
        match codex_plus_launcher::resume_if_running(options.clone()) {
            Ok(true) => {}
            Ok(false) if start_if_missing => {
                if let Err(error) = codex_plus_launcher::start(options) {
                    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                        "manager.autostart_codex_failed",
                        json!({ "message": error.to_string() }),
                    );
                } else {
                    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                        "manager.autostart_codex_started",
                        json!({}),
                    );
                }
            }
            Ok(false) => {}
            Err(error) => {
                let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                    "manager.resume_existing_failed",
                    json!({ "message": error.to_string() }),
                );
            }
        }
        let _ = tauri::Emitter::emit(&app, "runtime-health-changed", ());
    });
}

#[tauri::command]
pub fn query_builtin_model_metadata(slug: String) -> CommandResult<Value> {
    match codex_plus_core::model_suffix::builtin_model_metadata(slug.as_str()) {
        Some(metadata) => ok(
            "内置元数据已匹配。",
            json!({
                "matched": true,
                "source": metadata.source,
                "entry": metadata.entry,
            }),
        ),
        None => {
            // 回退值从 bundled 静态资产首条实时取，不写死——
            // sync_official_models.py 调整首条后这里自动跟随。
            let (fallback_slug, fallback_window) =
                codex_plus_core::model_suffix::fallback_template_info()
                    .unwrap_or_else(|| ("gpt-5.5".to_string(), 272_000));
            ok(
                "未命中内置元数据，生成时回退官方模板。",
                json!({
                    "matched": false,
                    "fallback": {
                        "slug": fallback_slug,
                        "context_window": fallback_window,
                    },
                }),
            )
        }
    }
}

#[tauri::command]
pub fn builtin_model_metadata_index() -> CommandResult<Value> {
    let index = codex_plus_core::model_suffix::builtin_model_metadata_index();
    let count = index.len();
    ok(
        "内置元数据索引已读取。",
        json!({ "entries": index, "count": count }),
    )
}

#[derive(serde::Serialize)]
pub struct NativeBrowserDiagnostics {
    compatibility: codex_plus_core::native_browser::BrowserStatus,
    connection: codex_plus_core::native_browser_connection::ConnectionStatus,
}

#[tauri::command]
pub async fn native_browser_status() -> NativeBrowserDiagnostics {
    let compatibility =
        tauri::async_runtime::spawn_blocking(codex_plus_core::native_browser::read_status)
            .await
            .unwrap_or_else(|_| codex_plus_core::native_browser::BrowserStatus {
                state: "unavailable".into(),
                detail: String::new(),
            });
    let connection = codex_plus_core::native_browser_connection::check_connection().await;
    NativeBrowserDiagnostics {
        compatibility,
        connection,
    }
}

#[tauri::command]
pub fn load_settings() -> CommandResult<SettingsPayload> {
    let Ok(_guard) = relay_switch_mutex().lock() else {
        return failed(
            "供应商切换锁已损坏，请重启管理器后再试。",
            fallback_settings_payload(),
        );
    };
    let store = SettingsStore::default();
    let home = codex_plus_core::relay_config::default_codex_home_dir();
    if let Err(error) = codex_plus_core::aggregate_catalog::recover_pending_catalog_refresh(&store, &home) {
        return failed(&format!("模型目录存在待恢复操作：{error}"), fallback_settings_payload());
    }
    match codex_plus_core::provider_import::initialize_local_config_provider(&store, &home) {
        Ok(_) => {
            let settings = match store.load() {
                Ok(settings) => settings,
                Err(error) => return failed(&format!("重新读取设置失败：{error}"), fallback_settings_payload()),
            };
            ok(
            "设置已加载。",
            SettingsPayload {
                revision: settings.settings_revision.clone(),
                settings,
                settings_path: codex_plus_core::paths::default_settings_path()
                    .to_string_lossy()
                    .to_string(),
            },
        )
        },
        Err(error) => failed(
            &format!("读取本机默认供应商失败：{error}"),
            fallback_settings_payload(),
        ),
    }
}

#[tauri::command]
pub fn save_settings(mut settings: BackendSettings, expected_revision: Option<String>) -> CommandResult<SettingsPayload> {
    if let Some(revision) = expected_revision { settings.settings_revision = revision; }
    let settings = normalize_settings_before_save(settings);
    // 保存诊断：供应商模型列表被改小/改大时能直接看出「提交上来的到底是什么」。
    // 用户反馈过「删掉一行保存后又变回三行」，只有把每次保存的行数记下来才能区分
    // 「界面没提交改动」和「提交了又被别处覆盖」。
    log_manager_event(
        "manager.save_settings",
        json!({
            "activeRelayId": settings.active_relay_id,
            "relayProfiles": settings.relay_profiles.iter().map(|profile| json!({
                "id": profile.id,
                "modelCount": profile.model_list.lines().filter(|line| !line.trim().is_empty()).count(),
                "models": profile.model_list.lines().filter(|line| !line.trim().is_empty()).collect::<Vec<_>>(),
            })).collect::<Vec<_>>(),
        }),
    );
    let Ok(_guard) = relay_switch_mutex().lock() else {
        return failed(
            "供应商切换锁已损坏，请重启管理器后再试。",
            SettingsPayload {
                revision: settings.settings_revision.clone(),
                settings,
                settings_path: codex_plus_core::paths::default_settings_path()
                    .to_string_lossy()
                    .to_string(),
            },
        );
    };
    let store = SettingsStore::default();
    match codex_plus_core::aggregate_catalog::save_with_active_catalog_refresh(&store, &codex_plus_core::relay_config::default_codex_home_dir(), &settings) {
        Ok(_) => {
            // 自动接管是常驻行为，保存后立刻生效，不必重启管理器。
            crate::auto_takeover::apply_enabled(settings.codex_app_auto_takeover);
            settings_payload("设置已保存。", "设置保存后重新读取失败")
        }
        Err(error) => {
            failed(
                &format!("保存设置失败：{error}"),
                fallback_settings_payload(),
            )
        }
    }
}

#[tauri::command]
pub fn load_ccs_providers() -> CommandResult<CcsProvidersPayload> {
    let settings = SettingsStore::default().load().unwrap_or_default();
    match codex_plus_core::ccs_import::resolve_codex_provider_source(&settings.ccs_db_path) {
        Ok(source) => ok(
            &format!(
                "已读取 cc-switch Codex 供应商配置：{} 个。",
                source.providers.len()
            ),
            CcsProvidersPayload {
                db_path: source.db_path.to_string_lossy().to_string(),
                configured_db_path: source.configured_db_path,
                fallback_reason: source.fallback_reason,
                providers: source.providers,
            },
        ),
        Err(error) => failed(
            &format!("读取 cc-switch 供应商配置失败：{error}"),
            CcsProvidersPayload {
                db_path: codex_plus_core::ccs_import::default_ccs_db_path()
                    .to_string_lossy()
                    .to_string(),
                configured_db_path: settings.ccs_db_path,
                fallback_reason: None,
                providers: Vec::new(),
            },
        ),
    }
}

#[tauri::command]
pub fn import_ccs_providers(bindings: Option<std::collections::BTreeMap<String, String>>) -> CommandResult<SettingsPayload> {
    let store = SettingsStore::default();
    let mut settings = match store.load() {
        Ok(settings) => settings,
        Err(error) => return failed(&format!("读取设置失败：{error}"), fallback_settings_payload()),
    };
    let source = match codex_plus_core::ccs_import::resolve_codex_provider_source(&settings.ccs_db_path) {
        Ok(source) => source,
        Err(error) => return failed(&format!("读取 cc-switch 供应商配置失败：{error}"), fallback_settings_payload()),
    };
    let (imported, linked) = match codex_plus_core::ccs_import::import_providers_with_origins(&mut settings, &source, &bindings.unwrap_or_default()) {
        Ok(counts) => counts,
        Err(error) => return failed(&format!("导入 cc-switch 失败：{error}"), fallback_settings_payload()),
    };
    if imported == 0 && linked == 0 { return settings_payload("供应商均已导入，保留已有配置。", "设置读取失败"); }
    match store.save(&settings) {
        Ok(()) => settings_payload(&format!("已导入 {imported} 个供应商，关联 {linked} 个已有供应商；已有配置未覆盖。"), "导入后读取设置失败"),
        Err(error) => failed(&format!("保存 cc-switch 供应商失败：{error}"), fallback_settings_payload()),
    }
}

#[tauri::command]
pub fn load_pending_provider_import() -> CommandResult<PendingProviderImportPayload> {
    match codex_plus_core::provider_import::load_pending_provider_import() {
        Ok(pending) => ok(
            "待确认供应商导入已读取。",
            PendingProviderImportPayload { pending },
        ),
        Err(error) => failed(
            &format!("读取待确认供应商导入失败：{error}"),
            PendingProviderImportPayload { pending: None },
        ),
    }
}

#[tauri::command]
pub fn confirm_pending_provider_import() -> CommandResult<SettingsPayload> {
    match codex_plus_core::provider_import::confirm_pending_provider_import() {
        Ok(Some(result)) => {
            let message = if result.imported {
                format!("已导入供应商配置：{}。", result.profile_name)
            } else {
                format!("供应商配置已存在：{}。", result.profile_name)
            };
            settings_payload(&message, "供应商导入后重新读取设置失败")
        }
        Ok(None) => settings_payload("没有待确认的供应商导入。", "设置读取失败"),
        Err(error) => failed(
            &format!("导入供应商配置失败：{error}"),
            settings_payload_value().unwrap_or_else(|(_, payload)| payload),
        ),
    }
}

#[tauri::command]
pub fn dismiss_pending_provider_import() -> CommandResult<PendingProviderImportPayload> {
    match codex_plus_core::provider_import::clear_pending_provider_import() {
        Ok(()) => ok(
            "已取消供应商导入。",
            PendingProviderImportPayload { pending: None },
        ),
        Err(error) => failed(
            &format!("取消供应商导入失败：{error}"),
            PendingProviderImportPayload { pending: None },
        ),
    }
}

#[tauri::command]
pub async fn list_local_sessions(
    request: Option<ListLocalSessionsRequest>,
) -> CommandResult<LocalSessionsPayload> {
    let offset = request.as_ref().map_or(0, |request| request.offset);
    let limit = request
        .as_ref()
        .map_or(DEFAULT_LOCAL_SESSIONS_PAGE_SIZE, |request| request.limit)
        .clamp(1, MAX_LOCAL_SESSIONS_PAGE_SIZE);
    match tauri::async_runtime::spawn_blocking(move || list_local_sessions_blocking(request)).await
    {
        Ok(result) => result,
        Err(error) => failed(
            &format!("会话查询后台任务失败：{error}"),
            LocalSessionsPayload {
                db_path: String::new(),
                db_paths: Vec::new(),
                sessions: Vec::new(),
                offset,
                limit,
                has_more: false,
                total_count: 0,
            },
        ),
    }
}

#[tauri::command]
pub async fn list_project_sessions(
    request: ListProjectSessionsRequest,
) -> CommandResult<LocalSessionsPayload> {
    match tauri::async_runtime::spawn_blocking(move || list_project_sessions_blocking(request.cwd)).await {
        Ok(result) => result,
        Err(error) => failed(
            &format!("项目会话查询后台任务失败：{error}"),
            LocalSessionsPayload {
                db_path: String::new(),
                db_paths: Vec::new(),
                sessions: Vec::new(),
                offset: 0,
                limit: 1,
                has_more: false,
                total_count: 0,
            },
        ),
    }
}

fn normalized_project_path(path: &str) -> String {
    // 与前端 sessionGroups 一致：只统一分隔符和末尾斜杠，保留大小写及路径中的空格。
    path.replace('\\', "/")
        .trim_end_matches('/')
        .to_string()
}

fn list_project_sessions_blocking(cwd: String) -> CommandResult<LocalSessionsPayload> {
    let home = codex_plus_core::codex_sqlite::default_codex_home_dir();
    let db_paths = codex_plus_core::codex_sqlite::codex_session_db_paths_from_home(&home);
    static PROJECT_PAGER: std::sync::OnceLock<std::sync::Mutex<codex_plus_data::LocalSessionPager>> =
        std::sync::OnceLock::new();
    let page = match PROJECT_PAGER.get_or_init(Default::default).lock() {
        Ok(mut pager) => pager.list_page(&db_paths, 0, usize::MAX),
        Err(_) => codex_plus_data::LocalSessionPage {
            errors: vec!["项目会话查询缓存不可用，请重启管理窗口。".to_string()],
            ..Default::default()
        },
    };
    let target = normalized_project_path(&cwd);
    let sessions = page
        .sessions
        .into_iter()
        .filter(|session| normalized_project_path(&session.cwd) == target)
        .collect::<Vec<_>>();
    let payload = LocalSessionsPayload {
        db_path: db_paths
            .first()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default(),
        db_paths: db_paths
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
        limit: sessions.len().max(1),
        total_count: sessions.len(),
        sessions,
        offset: 0,
        has_more: false,
    };
    if page.errors.is_empty() {
        ok(&format!("已读取项目全部 {} 个会话。", payload.total_count), payload)
    } else {
        failed(
            &format!("读取项目会话时出现部分错误：{}", page.errors.join("; ")),
            payload,
        )
    }
}

fn list_local_sessions_blocking(
    request: Option<ListLocalSessionsRequest>,
) -> CommandResult<LocalSessionsPayload> {
    let request = request.unwrap_or(ListLocalSessionsRequest {
        offset: 0,
        limit: DEFAULT_LOCAL_SESSIONS_PAGE_SIZE,
    });
    let offset = request.offset;
    let limit = request.limit.clamp(1, MAX_LOCAL_SESSIONS_PAGE_SIZE);
    let home = codex_plus_core::codex_sqlite::default_codex_home_dir();
    let db_paths = codex_plus_core::codex_sqlite::codex_session_db_paths_from_home(&home);
    static PAGER: std::sync::OnceLock<std::sync::Mutex<codex_plus_data::LocalSessionPager>> =
        std::sync::OnceLock::new();
    let pager = PAGER.get_or_init(Default::default);
    let page = match pager.lock() {
        Ok(mut pager) => pager.list_page(&db_paths, offset, limit),
        Err(_) => codex_plus_data::LocalSessionPage {
            errors: vec!["会话查询缓存不可用，请重启管理窗口。".to_string()],
            ..Default::default()
        },
    };
    let payload = LocalSessionsPayload {
        db_path: db_paths
            .first()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default(),
        db_paths: db_paths
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
        sessions: page.sessions,
        offset,
        limit,
        has_more: page.has_more,
        total_count: page.total_count,
    };
    let page_number = (offset / limit).saturating_add(1);
    if page.errors.is_empty() {
        ok(
            &format!(
                "已读取第 {page_number} 页，共 {} 个本地会话。",
                payload.sessions.len()
            ),
            payload,
        )
    } else {
        failed(
            &format!("读取部分本地会话失败：{}", page.errors.join("; ")),
            payload,
        )
    }
}

#[tauri::command]
pub fn delete_local_session(request: DeleteLocalSessionRequest) -> CommandResult<DeleteResult> {
    let session_id = request.session_id.trim();
    if session_id.is_empty() {
        return failed(
            "会话 ID 不能为空。",
            DeleteResult {
                status: codex_plus_core::models::DeleteStatus::Failed,
                session_id: String::new(),
                message: "会话 ID 不能为空。".to_string(),
                undo_token: None,
                backup_path: None,
            },
        );
    }
    let session = SessionRef {
        session_id: session_id.to_string(),
        title: request.title,
        host_id: Some("local".into()),
    };
    let home = codex_plus_core::codex_sqlite::default_codex_home_dir();
    let mut candidate_paths = Vec::new();
    if let Some(path) = request.db_path.as_deref() {
        let path = PathBuf::from(path);
        if !candidate_paths.iter().any(|candidate| candidate == &path) {
            candidate_paths.push(path);
        }
    }
    for path in codex_plus_core::codex_sqlite::codex_session_db_paths_from_home(&home) {
        if !candidate_paths.iter().any(|candidate| candidate == &path) {
            candidate_paths.push(path);
        }
    }
    log_manager_event(
        "manager.delete_local_session.start",
        json!({
            "session_id": session_id,
            "title": session.title,
            "requested_db_path": request.db_path,
            "candidate_paths": candidate_paths
                .iter()
                .map(|path| path.to_string_lossy().to_string())
                .collect::<Vec<_>>(),
        }),
    );
    let result = codex_plus_data::delete_local_from_paths(
        candidate_paths.clone(),
        codex_plus_data::BackupStore::new(
            codex_plus_core::paths::default_app_state_dir().join("backups"),
        ),
        &session,
        Some(&home),
    );
    log_manager_event(
        "manager.delete_local_session.finish",
        json!({
            "session_id": session_id,
            "final_status": format!("{:?}", result.status),
            "final_message": result.message,
            "candidate_paths": candidate_paths
                .iter()
                .map(|path| path.to_string_lossy().to_string())
                .collect::<Vec<_>>(),
        }),
    );
    let status = if matches!(
        result.status,
        codex_plus_core::models::DeleteStatus::LocalDeleted
    ) {
        "ok"
    } else {
        "failed"
    };
    CommandResult {
        status: status.to_string(),
        message: result.message.clone(),
        payload: result,
    }
}

#[tauri::command]
pub async fn archive_local_sessions(
    request: ArchiveLocalSessionsRequest,
) -> CommandResult<Value> {
    match tauri::async_runtime::spawn_blocking(move || archive_local_sessions_blocking(request)).await {
        Ok(result) => result,
        Err(error) => failed(&format!("批量归档后台任务失败：{error}"), json!({})),
    }
}

fn archive_local_sessions_blocking(request: ArchiveLocalSessionsRequest) -> CommandResult<Value> {
    if request.sessions.is_empty() {
        return failed("没有选择要归档的会话。", json!({ "succeeded": 0, "failed": 0 }));
    }
    let home = codex_plus_core::codex_sqlite::default_codex_home_dir();
    let allowed_paths = codex_plus_core::codex_sqlite::codex_session_db_paths_from_home(&home)
        .into_iter()
        .filter_map(|path| std::fs::canonicalize(path).ok())
        .collect::<std::collections::HashSet<_>>();
    let mut succeeded = 0usize;
    let mut failures = Vec::new();
    for session in request.sessions {
        let path = PathBuf::from(&session.db_path);
        let canonical = match std::fs::canonicalize(&path) {
            Ok(path) => path,
            Err(error) => {
                failures.push(format!("{}：数据库不可用：{error}", session.id));
                continue;
            }
        };
        if !allowed_paths.contains(&canonical) {
            failures.push(format!("{}：数据库不属于当前 Codex 会话库", session.id));
            continue;
        }
        match archive_one_local_session(&canonical, &session.id, request.archived) {
            Ok(()) => succeeded += 1,
            Err(error) => failures.push(format!("{}：{error}", session.id)),
        }
    }
    let failed_count = failures.len();
    let status = if failed_count == 0 { "ok" } else if succeeded > 0 { "ok" } else { "failed" };
    let message = if failed_count == 0 {
        format!("已{} {} 个会话。", if request.archived { "归档" } else { "取消归档" }, succeeded)
    } else {
        format!("已{} {} 个，失败 {} 个：{}", if request.archived { "归档" } else { "取消归档" }, succeeded, failed_count, failures.iter().take(3).cloned().collect::<Vec<_>>().join("；"))
    };
    CommandResult {
        status: status.to_string(),
        message,
        payload: json!({ "succeeded": succeeded, "failed": failed_count, "errors": failures }),
    }
}

fn archive_one_local_session(path: &Path, session_id: &str, archived: bool) -> anyhow::Result<()> {
    let mut connection = rusqlite::Connection::open(path)?;
    let columns = connection
        .prepare("PRAGMA table_info(threads)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<std::collections::HashSet<_>>>()?;
    anyhow::ensure!(columns.contains("archived"), "当前数据库不支持归档字段");
    let has_archived_at = columns.contains("archived_at");
    let transaction = connection.transaction()?;
    let changed = if has_archived_at {
        transaction.execute(
            "UPDATE threads SET archived = ?1, archived_at = ?2 WHERE id = ?3",
            // Codex 的 threads.archived_at 与 created_at/updated_at 一样是秒（带 _ms 后缀的列才是毫秒）；
            // 写毫秒会被解析成远未来的时间。
            rusqlite::params![archived as i64, if archived { Some((current_timestamp_ms() / 1000) as i64) } else { None }, session_id],
        )?
    } else {
        transaction.execute(
            "UPDATE threads SET archived = ?1 WHERE id = ?2",
            rusqlite::params![archived as i64, session_id],
        )?
    };
    anyhow::ensure!(changed > 0, "未找到会话记录");
    transaction.commit()?;
    Ok(())
}

/// 归一化「Codex 应用路径」。**无效路径一律丢弃，不落库。**
///
/// 之前的写法是 normalize 成功才覆盖、失败就原样保留，于是误选的路径会被存进
/// settings.json。而 launcher 拿到显式 --app-path 且无效时不回退自动探测，
/// 结果就是启动永久失败、只能手改配置文件才能恢复（#1972：用户误选了 Codex++
/// 自己的 codex-plus-plus.exe，因为文件选择器只按 exe 扩展名过滤）。
///
/// 清空之后 resolve_codex_app_dir_with_saved 会走自动探测，至少还能起来。
fn normalized_codex_app_path_for_save(raw: &str) -> String {
    if raw.trim().is_empty() {
        return String::new();
    }
    codex_plus_core::app_paths::normalize_codex_app_path(Path::new(raw))
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn normalize_settings_before_save(mut settings: BackendSettings) -> BackendSettings {
    settings.codex_app_path = normalized_codex_app_path_for_save(&settings.codex_app_path);
    settings.relay_common_config_contents =
        codex_plus_core::relay_config::sanitize_common_config_contents(
            &settings.relay_common_config_contents,
        );
    let (common_without_context, extracted_context) =
        split_relay_context_config_sections(&settings.relay_common_config_contents);
    settings.relay_common_config_contents = common_without_context;
    settings.relay_context_config_contents =
        relay_join_config_sections(&[&settings.relay_context_config_contents, &extracted_context]);
    settings.relay_context_config_contents =
        codex_plus_core::relay_config::sanitize_common_config_contents(
            &settings.relay_context_config_contents,
        );
    for profile in &mut settings.relay_profiles {
        let mut normalized = profile.clone();
        if let Err(error) =
            codex_plus_core::relay_config::normalize_relay_profile_for_storage(&mut normalized)
        {
            log_manager_event(
                "manager.normalize_relay_profile_for_storage.failed",
                json!({
                    "profileId": profile.id,
                    "profileName": profile.name,
                    "error": error.to_string()
                }),
            );
        } else {
            *profile = normalized;
        }
    }
    let common_config = relay_combined_common_config(&settings);
    if !common_config.trim().is_empty() {
        for profile in &mut settings.relay_profiles {
            if !profile.use_common_config || profile.config_contents.trim().is_empty() {
                continue;
            }
            let goals_override = relay_config_goals_value(&profile.config_contents);
            match codex_plus_core::relay_config::strip_common_config_from_config(
                &profile.config_contents,
                &common_config,
            ) {
                Ok(stripped) => {
                    profile.config_contents =
                        strip_common_config_text_fallback(&stripped, &common_config);
                }
                Err(_) => {
                    profile.config_contents =
                        strip_common_config_text_fallback(&profile.config_contents, &common_config);
                }
            }
            if let Some(enabled) = goals_override {
                profile.config_contents =
                    relay_config_set_goals_override(&profile.config_contents, enabled);
            }
        }
    }
    settings.provider_sync_saved_providers =
        normalize_provider_sync_provider_list(settings.provider_sync_saved_providers);
    settings.provider_sync_manual_providers =
        normalize_provider_sync_provider_list(settings.provider_sync_manual_providers);
    settings.provider_sync_last_selected_provider = settings
        .provider_sync_last_selected_provider
        .trim()
        .to_string();
    settings
}

fn relay_config_goals_value(config: &str) -> Option<bool> {
    let doc = config.parse::<toml_edit::DocumentMut>().ok()?;
    doc.get("features")?
        .as_table_like()?
        .get("goals")?
        .as_bool()
}

fn relay_config_set_goals_override(config: &str, enabled: bool) -> String {
    let Ok(mut doc) = config.parse::<toml_edit::DocumentMut>() else {
        return config.to_string();
    };
    if !doc.as_table().contains_key("features")
        || doc
            .get("features")
            .and_then(toml_edit::Item::as_table_like)
            .is_none()
    {
        doc["features"] = toml_edit::table();
    }
    doc["features"]["goals"] = toml_edit::value(enabled);
    codex_plus_core::relay_config::normalize_config_text(&doc.to_string())
}

fn normalize_provider_sync_provider_list(values: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() || trimmed.chars().any(char::is_control) {
            continue;
        }
        if seen.insert(trimmed.to_string()) {
            result.push(trimmed.to_string());
        }
    }
    result.sort();
    result
}

fn relay_combined_common_config(settings: &BackendSettings) -> String {
    relay_join_config_sections(&[
        &settings.relay_common_config_contents,
        &settings.relay_context_config_contents,
    ])
}

fn relay_join_config_sections(sections: &[&str]) -> String {
    let sections = sections
        .iter()
        .map(|section| section.trim())
        .filter(|section| !section.is_empty())
        .collect::<Vec<_>>();
    if sections.is_empty() {
        String::new()
    } else {
        codex_plus_core::relay_config::normalize_config_text(&format!(
            "{}\n",
            sections.join("\n\n")
        ))
    }
}

fn split_relay_context_config_sections(config: &str) -> (String, String) {
    let mut common = Vec::new();
    let mut context = Vec::new();
    let mut in_context_table = false;

    for line in config.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_context_table = trimmed.starts_with("[mcp_servers.")
                || trimmed.starts_with("[skills.")
                || trimmed.starts_with("[plugins.");
        }
        if in_context_table {
            context.push(line);
        } else {
            common.push(line);
        }
    }

    (
        relay_join_config_sections(&[&common.join("\n")]),
        relay_join_config_sections(&[&context.join("\n")]),
    )
}

fn strip_common_config_text_fallback(config_contents: &str, common_config: &str) -> String {
    let common = common_config_anchors(common_config);
    if common.root_keys.is_empty() && common.table_headers.is_empty() {
        return ensure_text_newline(config_contents.trim_end());
    }

    let mut kept = Vec::new();
    let mut skipping_table = false;
    let mut in_root_section = true;
    let mut removed_root_keys = std::collections::HashSet::new();
    let source_root_keys = toml_root_keys_before_first_table(config_contents);

    for line in config_contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_root_section = false;
            let header = trimmed.to_string();
            skipping_table = common.table_headers.contains(&header);
            if skipping_table {
                continue;
            }
        }

        if skipping_table {
            continue;
        }

        if in_root_section && let Some(key) = toml_key_from_line(trimmed) {
            if common.root_keys.contains(key) {
                let is_duplicate_common_key = removed_root_keys.contains(key)
                    || source_root_keys.contains(key)
                    || common.table_headers.contains("[features]")
                    || common
                        .table_headers
                        .contains("[marketplaces.openai-bundled]")
                    || common
                        .table_headers
                        .contains("[plugins.\"superpowers@openai-curated\"]");
                if is_duplicate_common_key {
                    removed_root_keys.insert(key.to_string());
                    continue;
                }
            }
        }

        kept.push(line);
    }

    ensure_text_newline(kept.join("\n").trim_end())
}

fn toml_root_keys_before_first_table(config_contents: &str) -> std::collections::HashSet<String> {
    let mut keys = std::collections::HashSet::new();
    for line in config_contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            break;
        }
        if let Some(key) = toml_key_from_line(trimmed) {
            keys.insert(key.to_string());
        }
    }
    keys
}

struct CommonConfigAnchors {
    root_keys: std::collections::HashSet<String>,
    table_headers: std::collections::HashSet<String>,
}

fn common_config_anchors(common_config: &str) -> CommonConfigAnchors {
    let mut root_keys = std::collections::HashSet::new();
    let mut table_headers = std::collections::HashSet::new();
    let mut in_table = false;

    for line in common_config.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_table = true;
            table_headers.insert(trimmed.to_string());
            continue;
        }
        if !in_table {
            if let Some(key) = toml_key_from_line(trimmed) {
                root_keys.insert(key.to_string());
            }
        }
    }

    CommonConfigAnchors {
        root_keys,
        table_headers,
    }
}

fn toml_key_from_line(line: &str) -> Option<&str> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return None;
    }
    let (key, _) = trimmed.split_once('=')?;
    let key = key.trim();
    if key.is_empty() { None } else { Some(key) }
}

fn ensure_text_newline(value: &str) -> String {
    if value.trim().is_empty() {
        String::new()
    } else {
        format!("{}\n", value.trim_end())
    }
}

#[tauri::command]
pub async fn load_provider_sync_targets() -> CommandResult<Value> {
    let settings = SettingsStore::default().load().unwrap_or_default();
    let result =
        tauri::async_runtime::spawn_blocking(|| codex_plus_data::load_provider_sync_targets(None))
            .await
            .map_err(|error| anyhow::anyhow!("provider target discovery task failed: {error}"));
    match result {
        Ok(mut targets) => {
            let manual = settings
                .provider_sync_manual_providers
                .iter()
                .chain(settings.provider_sync_saved_providers.iter())
                .filter_map(|value| {
                    let trimmed = value.trim();
                    if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed.to_string())
                    }
                })
                .collect::<Vec<_>>();
            merge_manual_provider_sync_targets(&mut targets, &manual, &settings, None);
            ok(
                "Provider 同步目标已加载。",
                serde_json::to_value(targets).unwrap_or_else(|_| json!({})),
            )
        }
        Err(error) => failed(&format!("Provider 同步目标加载失败：{error}"), json!({})),
    }
}

fn merge_manual_provider_sync_targets(
    targets: &mut codex_plus_data::ProviderSyncTargetList,
    manual: &[String],
    settings: &BackendSettings,
    codex_home: Option<&Path>,
) {
    for id in manual {
        if let Some(existing) = targets.targets.iter_mut().find(|target| target.id == *id) {
            if !existing
                .sources
                .contains(&codex_plus_data::ProviderSyncTargetSource::Manual)
            {
                existing
                    .sources
                    .push(codex_plus_data::ProviderSyncTargetSource::Manual);
                existing.sources.sort();
            }
            existing.is_manual = settings.provider_sync_manual_providers.contains(id);
            existing.is_saved = settings.provider_sync_saved_providers.contains(id);
        } else {
            let (is_resolvable, unavailable_reason) =
                match codex_plus_data::validate_provider_sync_target(codex_home, Some(id)) {
                    Ok(_) => (true, None),
                    Err(reason) => (false, Some(reason)),
                };
            targets
                .targets
                .push(codex_plus_data::ProviderSyncTargetOption {
                    id: id.clone(),
                    sources: vec![codex_plus_data::ProviderSyncTargetSource::Manual],
                    is_current_provider: *id == targets.current_provider,
                    is_manual: settings.provider_sync_manual_providers.contains(id),
                    is_saved: settings.provider_sync_saved_providers.contains(id),
                    is_resolvable,
                    unavailable_reason,
                });
        }
    }
    targets.targets.sort_by(|left, right| {
        right
            .is_current_provider
            .cmp(&left.is_current_provider)
            .then_with(|| left.id.cmp(&right.id))
    });
}

#[tauri::command]
pub async fn repair_session_index() -> CommandResult<Value> {
    let result =
        tauri::async_runtime::spawn_blocking(|| codex_plus_data::repair_session_index(None))
            .await
            .map_err(|error| anyhow::anyhow!("session index repair task failed: {error}"))
            .and_then(|result| result);
    match result {
        Ok(report) => ok(
            &format!("会话索引检查完成，恢复 {} 条消息。", report.repaired_items),
            json!(report),
        ),
        Err(error) => failed(&format!("修复会话索引失败：{error}"), json!({})),
    }
}

#[tauri::command]
pub async fn load_session_index_repair_report() -> CommandResult<Value> {
    let result = tauri::async_runtime::spawn_blocking(|| {
        codex_plus_data::load_session_index_repair_report(None)
    })
    .await
    .map_err(|error| anyhow::anyhow!("session index report task failed: {error}"))
    .and_then(|result| result);
    match result {
        Ok(report) => ok("已读取会话索引修复报告。", json!({ "report": report })),
        Err(error) => failed(&format!("读取会话索引修复报告失败：{error}"), json!({})),
    }
}

#[tauri::command]
pub async fn preview_session_index_cleanup() -> CommandResult<Value> {
    let result = tauri::async_runtime::spawn_blocking(|| {
        codex_plus_data::preview_session_index_cleanup(None)
    })
    .await
    .map_err(|error| anyhow::anyhow!("session index cleanup preview task failed: {error}"))
    .and_then(|result| result);
    match result {
        Ok(preview) => ok(
            &format!(
                "发现 {} 条仅存在于任务索引中的候选记录。",
                preview.candidates.len()
            ),
            json!({
                "snapshotSha256": preview.snapshot_sha256,
                "candidates": preview.candidates,
            }),
        ),
        Err(error) => failed(&format!("预览失效任务索引失败：{error}"), json!({})),
    }
}

#[tauri::command]
pub async fn apply_session_index_cleanup(
    snapshot_sha256: String,
    thread_ids: Vec<String>,
) -> CommandResult<Value> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        codex_plus_data::apply_session_index_cleanup(None, &snapshot_sha256, &thread_ids)
    })
    .await
    .map_err(|error| anyhow::anyhow!("session index cleanup task failed: {error}"));
    match result {
        Ok(Ok(cleanup)) => ok(
            &format!(
                "已清理 {} 条失效任务索引；原索引已完整备份。",
                cleanup.pruned_entries
            ),
            json!({
                "prunedEntries": cleanup.pruned_entries,
                "backupDir": cleanup.backup_dir,
            }),
        ),
        Ok(Err(error)) => {
            let backup_hint = error
                .backup_dir
                .as_ref()
                .map(|path| format!(" 备份目录：{}。", path.to_string_lossy()))
                .unwrap_or_default();
            failed(
                &format!("清理失效任务索引失败：{}{backup_hint}", error.message),
                json!({ "backupDir": error.backup_dir }),
            )
        }
        Err(error) => failed(&format!("清理失效任务索引失败：{error}"), json!({})),
    }
}

const PROVIDER_SYNC_PROGRESS_EVENT: &str = "provider-sync-progress";

/// issue #240：执行前先给「会动到什么、备份在哪」的只读预览。
///
/// 用户报「修复历史会话后会话从列表消失」，所以真实执行前要先看影响范围。
/// 这条命令不写盘：不开锁、不备份、不改 sqlite，只统计。
#[tauri::command]
pub async fn preview_provider_sync() -> CommandResult<Value> {
    let result = tauri::async_runtime::spawn_blocking(|| {
        codex_plus_data::provider_sync::preview_provider_sync(None)
    })
    .await
    .map_err(|error| anyhow::anyhow!("provider sync preview task failed: {error}"))
    .and_then(|result| result);
    match result {
        Ok(preview) => {
            let audit = &preview.audit;
            let message = if audit.catalog_only_sessions > 0 {
                format!(
                    "预览：审计发现 {} 条仅存在于会话目录的记录，其中 {} 条仍有当前 rollout、{} 条只能从历史备份恢复、{} 条没有恢复来源。执行时的备份目录：{}",
                    audit.catalog_only_sessions,
                    audit.catalog_only_with_current_rollout,
                    audit.catalog_only_with_backup_database,
                    audit.catalog_only_without_recovery_source,
                    preview.backup_root.to_string_lossy(),
                )
            } else {
                format!(
                    "预览：未发现仅存在于会话目录的记录。执行时的备份目录：{}",
                    preview.backup_root.to_string_lossy(),
                )
            };
            ok(
                &message,
                json!({
                    "targetProvider": preview.target_provider,
                    "repairAudit": preview.audit,
                    "backupRoot": preview.backup_root,
                }),
            )
        }
        Err(error) => failed(&format!("预览历史会话修复失败：{error}"), json!({})),
    }
}

#[tauri::command]
pub fn load_provider_sync_recovery() -> CommandResult<Value> {
    let home = codex_plus_core::relay_config::default_codex_home_dir();
    match codex_plus_data::pending_recovery_journal(&home) {
        Some(path) => {
            let recoverable = path.file_name().and_then(|name| name.to_str()) == Some("recovery-journal.json");
            ok(if recoverable { "发现未完成的历史会话修复，请检查并恢复。" }
                else { "恢复目录不可读取，请检查目录权限或路径；新的修复已停止。" }, json!({
                "syncStatus": "partial_failure", "recoveryJournalPath": path,
                "backupDir": if recoverable { path.parent() } else { None },
                "recoveryAvailable": recoverable,
            }))
        },
        None => ok("没有待恢复的历史会话修复。", json!({"syncStatus":"none"})),
    }
}

#[tauri::command]
pub async fn recover_provider_sync(backup_dir: String) -> CommandResult<Value> {
    let home = codex_plus_core::relay_config::default_codex_home_dir();
    match tauri::async_runtime::spawn_blocking(move || codex_plus_data::recover_provider_sync_from_backup(&home, Path::new(&backup_dir))).await {
        Ok(Ok(report)) => {
            let payload = json!({
                "syncStatus": if report.completed { "recovered" } else { "partial_failure" },
                "recoveryJournalPath": report.recovery_journal_path,
                "backupDir": report.recovery_journal_path.parent(),
                "recoveryErrors": report.recovery_errors,
                "databaseOutcomes": report.database_outcomes.iter().map(|item| json!({
                    "database": item.database, "attemptedRows": item.attempted_rows,
                    "restoredRows": item.restored_rows, "remainingRows": item.remaining_rows,
                })).collect::<Vec<_>>(),
                "changedSessionFiles": report.remaining_rollout_files,
                "sqliteRowsUpdated": report.database_outcomes.iter().map(|item| item.remaining_rows).sum::<usize>(),
            });
            if report.completed { ok("未完成修复已恢复。", payload) }
            else { failed("部分改动存在冲突，已保留后来写入的数据，请查看恢复记录。", payload) }
        },
        Ok(Err(error)) => failed(&format!("恢复失败：{error}"), json!({})),
        Err(error) => failed(&format!("恢复任务失败：{error}"), json!({})),
    }
}

#[tauri::command]
pub async fn sync_providers_now(
    window: tauri::WebviewWindow,
    target_provider: Option<String>,
) -> CommandResult<Value> {
    let target_provider = target_provider
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let target_for_validation = target_provider.clone();
    match tauri::async_runtime::spawn_blocking(move || {
        codex_plus_data::validate_provider_sync_target(None, target_for_validation.as_deref())
    })
    .await
    {
        // Keep None as "use current" so the sync reads the live selection again.
        Ok(Ok(_)) => {}
        Ok(Err(message)) => return provider_sync_preflight_failure(&message),
        Err(error) => {
            return provider_sync_preflight_failure(&format!(
                "provider target validation task failed: {error}"
            ));
        }
    };
    let target_for_settings = target_provider.clone();
    let home = codex_plus_core::relay_config::default_codex_home_dir();
    let progress_window = window.clone();
    let before_home = home.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        // issue #1341：快照要读整份 app state 文件，属阻塞 IO，必须留在阻塞线程里，
        // 否则同步一跑起来就把 async 运行时的那条工作线程占住，界面卡死。
        prepare_codex_app_state_before_provider_switch(
            &before_home,
            "manager.sync_providers_now.before",
        );
        codex_plus_data::run_provider_sync_with_target_and_progress(
            None,
            target_provider.as_deref(),
            |progress| {
                let _ = progress_window.emit_to(
                    progress_window.label(),
                    PROVIDER_SYNC_PROGRESS_EVENT,
                    progress,
                );
            },
        )
    })
    .await
    .map_err(|error| anyhow::anyhow!("provider sync task failed: {error}"));
    match result {
        Ok(sync) => {
            if is_success_sync_status(&sync.status) {
                persist_provider_sync_selection(
                    target_for_settings
                        .as_deref()
                        .unwrap_or(&sync.target_provider),
                );
                finish_codex_app_state_after_provider_switch(
                    &home,
                    "manager.sync_providers_now.after",
                );
            }
            let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                "manager.provider_sync.completed",
                json!({
                    "status": sync.status.clone(),
                    "changedSessionFiles": sync.changed_session_files,
                    "sqliteRowsUpdated": sync.sqlite_rows_updated,
                    "sqliteCatalogRowsInserted": sync.sqlite_catalog_rows_inserted,
                    "sqliteCatalogRowsRemoved": sync.sqlite_catalog_rows_removed,
                    "skippedLockedRolloutFiles": sync.skipped_locked_rollout_files.len(),
                }),
            );
            provider_sync_command_result(sync)
        }
        Err(error) => {
            let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                "manager.provider_sync.failed",
                json!({ "message": error.to_string() }),
            );
            failed(&format!("供应商同步失败：{error}"), json!({}))
        }
    }
}

fn provider_sync_preflight_failure(message: &str) -> CommandResult<Value> {
    failed(
        &format!("供应商同步未执行：{message}"),
        json!({
            "syncStatus": "skipped",
            "targetProvider": "",
            "syncMessage": message,
        }),
    )
}

fn is_success_sync_status(status: &codex_plus_data::ProviderSyncStatus) -> bool {
    matches!(status, codex_plus_data::ProviderSyncStatus::Synced)
}

fn provider_sync_command_result(sync: codex_plus_data::ProviderSyncResult) -> CommandResult<Value> {
    let succeeded = is_success_sync_status(&sync.status);
    let success_message = format!(
        "供应商已同步一次：{} 个会话文件，{} 行索引，跳过 {} 个占用文件。{}",
        sync.changed_session_files,
        sync.sqlite_rows_updated,
        sync.skipped_locked_rollout_files.len(),
        if sync.repair_audit.catalog_only_sessions > 0 {
            format!(
                " 审计发现 {} 条仅存在于会话目录的记录，其中 {} 条没有可用恢复来源。",
                sync.repair_audit.catalog_only_sessions,
                sync.repair_audit.catalog_only_without_recovery_source,
            )
        } else {
            String::new()
        }
    );
    // issue #240：改动了记录就把备份位置一并告诉用户，出事时能自己找回。
    let success_message = match sync.backup_dir.as_ref() {
        Some(path) if sync.changed_session_files > 0 || sync.sqlite_catalog_rows_inserted > 0 => {
            format!("{success_message} 备份目录：{}", path.to_string_lossy())
        }
        _ => success_message,
    };
    let failure_message = if matches!(sync.status, codex_plus_data::ProviderSyncStatus::PartialFailure) {
        format!("历史会话修复部分失败，仍有改动需处理：{}", sync.message)
    } else if matches!(sync.status, codex_plus_data::ProviderSyncStatus::Failed) {
        format!("历史会话修复失败：{}", sync.message)
    } else { format!("历史会话修复未执行：{}", sync.message) };
    let payload = json!({
        "operationId": sync.backup_dir.as_ref().and_then(|path| path.file_name()).map(|name| name.to_string_lossy()),
        "syncStatus": sync.status,
        "targetProvider": sync.target_provider,
        "changedSessionFiles": sync.changed_session_files,
        "skippedLockedRolloutFiles": sync.skipped_locked_rollout_files,
        "sqliteRowsUpdated": sync.sqlite_rows_updated,
        "sqliteProviderRowsUpdated": sync.sqlite_provider_rows_updated,
        "sqliteUserEventRowsUpdated": sync.sqlite_user_event_rows_updated,
        "sqliteCwdRowsUpdated": sync.sqlite_cwd_rows_updated,
        "sqliteCatalogRowsInserted": sync.sqlite_catalog_rows_inserted,
        "sqliteCatalogRowsRemoved": sync.sqlite_catalog_rows_removed,
        "updatedWorkspaceRoots": sync.updated_workspace_roots,
        "encryptedContentWarning": sync.encrypted_content_warning,
        "repairAudit": sync.repair_audit,
        "backupDir": sync.backup_dir,
        "syncMessage": sync.message,
        "recoveryJournalPath": sync.recovery_journal_path,
        "recoveryAvailable": sync.recovery_journal_path.as_ref().is_some_and(|path| path.file_name().and_then(|name| name.to_str()) == Some("recovery-journal.json")),
        "recoveryErrors": sync.recovery_errors,
        "databaseOutcomes": sync.database_outcomes.iter().map(|item| json!({
            "database": item.database, "attemptedRows": item.attempted_rows,
            "restoredRows": item.restored_rows, "remainingRows": item.remaining_rows,
        })).collect::<Vec<_>>(),
    });
    if succeeded {
        ok(&success_message, payload)
    } else {
        failed(&failure_message, payload)
    }
}

fn persist_provider_sync_selection(provider: &str) {
    let trimmed = provider.trim();
    if trimmed.is_empty() {
        return;
    }
    let store = SettingsStore::default();
    let mut settings = store.load().unwrap_or_default();
    settings.provider_sync_last_selected_provider = trimmed.to_string();
    if !settings
        .provider_sync_saved_providers
        .iter()
        .any(|item| item == trimmed)
    {
        settings
            .provider_sync_saved_providers
            .push(trimmed.to_string());
    }
    settings.provider_sync_saved_providers =
        normalize_provider_sync_provider_list(settings.provider_sync_saved_providers);
    let _ = store.save(&settings);
}

/// 拉取所有启用仓库的 skill 清单，合并本地安装/启用状态后返回。
///
/// 单个仓库失败（限流、网络、仓库删了）不影响其它仓库，错误单独收集回前端。
#[tauri::command]
pub async fn refresh_skill_catalog() -> CommandResult<SkillsPayload> {
    let manager = default_skills_manager();
    let repos = manager.list_repos();
    let mut remote = Vec::new();
    let mut repo_errors = Vec::new();

    for repo in repos.iter().filter(|repo| repo.enabled) {
        let cached = cached_repo_skills(&repo.key());
        match codex_plus_core::skills::resolve_repo_skills(repo.clone(), &cached).await {
            Ok((resolved, skills)) => {
                if resolved.key() != repo.key() {
                    let _ = manager.save_repo(resolved.clone(), Some(&repo.key()));
                    forget_repo_skills(&repo.key());
                }
                store_repo_skills(&resolved.key(), &skills);
                remote.extend(skills);
            }
            Err(error) => {
                repo_errors.push(format!("{}/{}：{error:#}", repo.owner, repo.name));
                // 拉不动就先用上一次的结果撑着，别让已知的 skill 从列表里消失
                remote.extend(cached.into_values());
            }
        }
    }

    let message = if repo_errors.is_empty() {
        "Skills 列表已刷新。".to_string()
    } else {
        format!("Skills 列表已刷新，{} 个仓库拉取失败。", repo_errors.len())
    };
    let payload = skills_payload(&manager, &remote, repo_errors);
    if payload.repo_errors.is_empty() {
        ok(&message, payload)
    } else {
        failed(&message, payload)
    }
}

/// 只读本地状态，不联网。切到 Skills 页时先用它把已装的列出来。
#[tauri::command]
pub fn list_installed_skills() -> CommandResult<SkillsPayload> {
    let manager = default_skills_manager();
    let payload = current_skills_payload(&manager);
    ok("已加载本地 Skills。", payload)
}

/// 导入 cc-switch 已安装的 Skills。cc-switch 的 Skill 文件位于
/// `%USERPROFILE%/.cc-switch/skills/<id>/SKILL.md`，不在其 SQLite 数据库中。
#[tauri::command]
pub fn import_ccs_skills() -> CommandResult<SkillsPayload> {
    let manager = default_skills_manager();
    let root = codex_plus_core::ccs_import::default_ccs_skills_dir();
    let Ok(dir) = std::fs::read_dir(&root) else {
        return failed(
            &format!("未找到 cc-switch Skills 目录：{}", root.display()),
            current_skills_payload(&manager),
        );
    };
    let mut imported = 0usize;
    let mut errors = Vec::new();
    for entry in dir.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(id) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        match manager.import_from_directory(&id, &path) {
            Ok(_) => imported += 1,
            Err(error) => errors.push(format!("{id}：{error}")),
        }
    }
    let payload = current_skills_payload(&manager);
    if errors.is_empty() {
        ok(&format!("已从 cc-switch 导入 {imported} 个 Skill。"), payload)
    } else {
        failed(
            &format!("已从 cc-switch 导入 {imported} 个 Skill，{} 个失败：{}", errors.len(), errors.join("；")),
            payload,
        )
    }
}

#[tauri::command]
pub async fn install_skill(repo_key: String, id: String) -> CommandResult<SkillsPayload> {
    install_or_update_skill(&repo_key, &id, "Skill 已安装。", "安装 Skill 失败").await
}

#[tauri::command]
pub async fn update_skill(repo_key: String, id: String) -> CommandResult<SkillsPayload> {
    install_or_update_skill(&repo_key, &id, "Skill 已更新。", "更新 Skill 失败").await
}

async fn install_or_update_skill(
    repo_key: &str,
    id: &str,
    success_message: &str,
    failure_prefix: &str,
) -> CommandResult<SkillsPayload> {
    let manager = default_skills_manager();
    let Some(repo) = codex_plus_core::skills::parse_repo_key(repo_key) else {
        return failed(
            &format!("{failure_prefix}：仓库标识无法解析（{repo_key}）。"),
            current_skills_payload(&manager),
        );
    };

    // 装之前重新拉一次树，拿到当前的 repo_path 和哈希，避免用陈旧缓存装错版本。
    let cached = cached_repo_skills(repo_key);
    let skills = match codex_plus_core::skills::fetch_repo_skills(&repo, &cached).await {
        Ok(skills) => {
            store_repo_skills(repo_key, &skills);
            skills
        }
        Err(error) => {
            return failed(
                &format!("{failure_prefix}：{error}"),
                current_skills_payload(&manager),
            );
        }
    };
    let installed = manager.load_state().installed.get(id).cloned();
    if installed.as_ref().is_some_and(|item| item.repo_key != repo_key || item.repo_path.is_empty()) {
        return failed(
            &format!("{failure_prefix}：旧安装记录缺少来源路径或来源不同，请先备份卸载原项后重新安装。"),
            current_skills_payload(&manager),
        );
    }
    let Some(mut skill) = skills.iter().find(|skill| match &installed {
        Some(item) => skill.repo_path == item.repo_path,
        None => skill.id == id,
    }).cloned() else {
        return failed(
            &format!("{failure_prefix}：仓库里没有找到 {id}。"),
            current_skills_payload(&manager),
        );
    };
    if installed.is_some() { skill.id = id.to_string(); }

    let zip = match codex_plus_core::skills::download_repo_zip(&repo).await {
        Ok(bytes) => bytes,
        Err(error) => {
            return failed(
                &format!("{failure_prefix}：{error}"),
                current_skills_payload(&manager),
            );
        }
    };
    match manager.install_from_zip(&skill, &zip) {
        Ok(_) => ok(success_message, current_skills_payload(&manager)),
        Err(error) => failed(
            &format!("{failure_prefix}：{error}"),
            current_skills_payload(&manager),
        ),
    }
}

#[tauri::command]
pub fn set_skill_enabled(id: String, enabled: bool) -> CommandResult<SkillsPayload> {
    let manager = default_skills_manager();
    match manager.set_enabled(id.trim(), enabled) {
        Ok(()) => ok(
            if enabled {
                "Skill 已启用，下次对话生效。"
            } else {
                "Skill 已停用。"
            },
            current_skills_payload(&manager),
        ),
        Err(error) => failed(
            &format!("Skill 启停失败：{error}"),
            current_skills_payload(&manager),
        ),
    }
}

#[tauri::command]
pub fn uninstall_skill(id: String) -> CommandResult<SkillsPayload> {
    let manager = default_skills_manager();
    match manager.uninstall(id.trim()) {
        Ok(_) => ok(
            "Skill 已卸载，源目录已备份，可随时恢复。",
            current_skills_payload(&manager),
        ),
        Err(error) => failed(
            &format!("卸载 Skill 失败：{error}"),
            current_skills_payload(&manager),
        ),
    }
}

#[tauri::command]
pub fn restore_skill_backup(backup_id: String) -> CommandResult<SkillsPayload> {
    let manager = default_skills_manager();
    match manager.restore_backup(backup_id.trim()) {
        Ok(_) => ok("Skill 已从备份恢复。", current_skills_payload(&manager)),
        Err(error) => failed(
            &format!("从备份恢复失败：{error}"),
            current_skills_payload(&manager),
        ),
    }
}

#[tauri::command]
pub fn delete_skill_backup(backup_id: String) -> CommandResult<SkillsPayload> {
    let manager = default_skills_manager();
    match manager.delete_backup(backup_id.trim()) {
        Ok(_) => ok("备份已删除。", current_skills_payload(&manager)),
        Err(error) => failed(
            &format!("删除备份失败：{error}"),
            current_skills_payload(&manager),
        ),
    }
}

#[tauri::command]
pub async fn upsert_skill_repo(repo: codex_plus_core::skills::SkillRepo, previous_key: Option<String>) -> CommandResult<SkillsPayload> {
    let manager = default_skills_manager();
    match manager.update_repo_enabled_if_unchanged(&repo, previous_key.as_deref()) {
        Ok(true) => return ok("仓库启用状态已保存。", current_skills_payload(&manager)),
        Ok(false) => {},
        Err(error) => return failed(&format!("保存仓库状态失败：{error}"), current_skills_payload(&manager)),
    }
    let repo_key = repo.key();
    let cached = cached_repo_skills(&repo_key);
    let (repo, skills) = match codex_plus_core::skills::resolve_repo_skills(repo, &cached).await {
        Ok(result) => result,
        Err(error) => {
            return failed(
                &format!("仓库验证失败，未保存：{error:#}"),
                current_skills_payload(&manager),
            );
        }
    };
    let resolved_key = repo.key();
    let old_key = previous_key.as_deref().or_else(|| {
        manager.list_repos().iter().any(|r| r.key() == repo_key).then_some(repo_key.as_str())
    });
    match manager.save_repo(repo, old_key) {
        Ok(_) => {
            if let Some(old_key) = old_key {
                if old_key != resolved_key { forget_repo_skills(old_key); }
            }
            store_repo_skills(&resolved_key, &skills);
            let count = skills.len();
            ok(&format!("仓库已验证并保存，发现 {count} 个 Skill。"), current_skills_payload(&manager))
        }
        Err(error) => failed(
            &format!("保存仓库源失败：{error}"),
            current_skills_payload(&manager),
        ),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRepositoryPayload {
    repo: codex_plus_core::skills::SkillRepo,
    skills: Vec<codex_plus_core::skills::SkillEntry>,
    skill_count: usize,
}

#[tauri::command]
pub async fn inspect_skill_repo(repo: codex_plus_core::skills::SkillRepo) -> CommandResult<SkillRepositoryPayload> {
    let manager = default_skills_manager();
    let cached = cached_repo_skills(&repo.key());
    match codex_plus_core::skills::resolve_repo_skills(repo.clone(), &cached).await {
        Ok((resolved, skills)) => {
            let count = skills.len();
            // 预览未保存仓库不会修改仓库设置。
            if manager.list_repos().iter().any(|r| r.key() == resolved.key()) {
                store_repo_skills(&resolved.key(), &skills);
            }
            ok(&format!("已解析仓库，发现 {count} 个 Skill。"), SkillRepositoryPayload {
                repo: resolved, skills: manager.merge_entries(&skills).into_iter()
                    .filter(|s| skills.iter().any(|r| r.id == s.id && r.repo_key == s.repo_key)).collect(),
                skill_count: count,
            })
        }
        Err(error) => failed(&format!("解析仓库失败：{error:#}"), SkillRepositoryPayload {
            repo, skills: Vec::new(), skill_count: 0,
        }),
    }
}

#[tauri::command]
pub fn delete_skill_repo(key: String) -> CommandResult<SkillsPayload> {
    let manager = default_skills_manager();
    match manager.delete_repo(key.trim()) {
        Ok(_) => {
            forget_repo_skills(key.trim());
            ok("仓库源已删除。", current_skills_payload(&manager))
        }
        Err(error) => failed(
            &format!("删除仓库源失败：{error}"),
            current_skills_payload(&manager),
        ),
    }
}

fn skills_payload(
    manager: &codex_plus_core::skills::SkillsManager,
    remote: &[codex_plus_core::skills::RemoteSkill],
    repo_errors: Vec<String>,
) -> SkillsPayload {
    let repos = manager.list_repos();
    let all_remote = all_cached_repo_skills();
    let repository_skills = manager.merge_entries(&all_remote).into_iter()
        .filter(|skill| all_remote.iter().any(|r| r.id == skill.id && r.repo_key == skill.repo_key))
        .collect();
    let repo_counts = repo_skill_cache().lock().ok().map(|cache| {
        repos.iter().filter_map(|repo| cache.get(&repo.key())
            .map(|skills| (repo.key(), skills.len()))).collect()
    }).unwrap_or_default();
    let remote: Vec<_> = remote.iter().filter(|skill| {
        repos.iter().any(|repo| repo.enabled && repo.key() == skill.repo_key)
    }).cloned().collect();
    SkillsPayload {
        skills: if remote.is_empty() {
            manager.local_inventory()
        } else {
            manager.merge_entries(&remote)
        },
        repos,
        repository_skills,
        repo_counts,
        backups: manager.list_backups(),
        repo_errors,
        skills_dir: manager.source_dir().to_string_lossy().to_string(),
        codex_skills_dir: manager.linked_dir().to_string_lossy().to_string(),
    }
}

fn current_skills_payload(manager: &codex_plus_core::skills::SkillsManager) -> SkillsPayload {
    skills_payload(manager, &all_cached_repo_skills(), Vec::new())
}

fn default_skills_manager() -> codex_plus_core::skills::SkillsManager {
    codex_plus_core::skills::SkillsManager::new(
        codex_plus_core::paths::default_skills_source_dir(),
        codex_plus_core::paths::default_skill_backups_dir(),
        codex_plus_core::paths::default_skills_state_path(),
        codex_plus_core::codex_home::default_codex_home_dir(),
    )
}

/// 上一次成功拉取的远端清单，按仓库 key 存。
///
/// 两个用途：拉取时传给 `fetch_repo_skills` 跳过没变的 SKILL.md 请求；
/// 以及在只读命令里还原出完整视图，不必每次都联网。进程内缓存，重启即失效。
type RepoSkillCache = std::collections::HashMap<
    String,
    std::collections::BTreeMap<String, codex_plus_core::skills::RemoteSkill>,
>;

fn repo_skill_cache() -> &'static std::sync::Mutex<RepoSkillCache> {
    static CACHE: std::sync::OnceLock<std::sync::Mutex<RepoSkillCache>> =
        std::sync::OnceLock::new();
    CACHE.get_or_init(|| {
        let cache = std::fs::read(codex_plus_core::paths::default_app_state_dir().join("skill-catalog.json"))
            .ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default();
        std::sync::Mutex::new(cache)
    })
}

fn cached_repo_skills(
    repo_key: &str,
) -> std::collections::BTreeMap<String, codex_plus_core::skills::RemoteSkill> {
    repo_skill_cache()
        .lock()
        .ok()
        .and_then(|cache| cache.get(repo_key).cloned())
        .unwrap_or_default()
}

fn all_cached_repo_skills() -> Vec<codex_plus_core::skills::RemoteSkill> {
    repo_skill_cache()
        .lock()
        .ok()
        .map(|cache| {
            cache
                .values()
                .flat_map(|skills| skills.values().cloned())
                .collect()
        })
        .unwrap_or_default()
}

fn store_repo_skills(repo_key: &str, skills: &[codex_plus_core::skills::RemoteSkill]) {
    if let Ok(mut cache) = repo_skill_cache().lock() {
        cache.insert(
            repo_key.to_string(),
            skills
                .iter()
                .map(|skill| (skill.id.clone(), skill.clone()))
                .collect(),
        );
        persist_repo_skill_cache(&cache);
    }
}

fn forget_repo_skills(repo_key: &str) {
    if let Ok(mut cache) = repo_skill_cache().lock() {
        cache.remove(repo_key);
        persist_repo_skill_cache(&cache);
    }
}

fn persist_repo_skill_cache(cache: &RepoSkillCache) {
    if let Ok(bytes) = serde_json::to_vec(cache) {
        let path = codex_plus_core::paths::default_app_state_dir().join("skill-catalog.json");
        let _ = codex_plus_core::settings::atomic_write(&path, &bytes);
    }
}

#[tauri::command]
pub fn open_external_url(url: String) -> CommandResult<Value> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return failed("只允许打开 http 或 https 链接。", json!({}));
    }
    match open_url(trimmed) {
        Ok(()) => ok("已在系统浏览器打开链接。", json!({ "url": trimmed })),
        Err(error) => failed(&format!("打开链接失败：{error}"), json!({ "url": trimmed })),
    }
}

#[tauri::command]
pub async fn repair_shortcuts() -> InstallActionResult {
    tauri::async_runtime::spawn_blocking(install::repair_shortcuts)
        .await
        .unwrap_or_else(|error| install_background_failure("修复快捷方式", error))
}

#[tauri::command]
pub fn load_watcher_state() -> CommandResult<WatcherPayload> {
    ok("开机启动状态已加载。", watcher_payload())
}

/// 界面上的「开机打开 Codex++」开关：开启 = 注册并启用，关闭 = 注销并禁用。
#[tauri::command]
pub fn set_watcher_enabled(enabled: bool) -> CommandResult<WatcherPayload> {
    let launcher_path =
        codex_plus_core::install::companion_binary_path(codex_plus_core::install::SILENT_BINARY);
    match codex_plus_core::watcher::set_watcher_enabled(enabled, &launcher_path, default_debug_port())
    {
        Ok(()) if enabled => ok("开机启动已开启。", watcher_payload()),
        Ok(()) => ok("开机启动已关闭。", watcher_payload()),
        Err(error) if enabled => failed(&format!("开启开机启动失败：{error}"), watcher_payload()),
        Err(error) => failed(&format!("关闭开机启动失败：{error}"), watcher_payload()),
    }
}

#[tauri::command]
pub fn set_watcher_start_minimized(minimized: bool) -> CommandResult<WatcherPayload> {
    match codex_plus_core::watcher::set_watcher_start_minimized(minimized) {
        Ok(()) if minimized => ok("开机启动时将自动最小化。", watcher_payload()),
        Ok(()) => ok("已取消开机启动自动最小化。", watcher_payload()),
        Err(error) => failed(
            &format!("设置开机启动自动最小化失败：{error}"),
            watcher_payload(),
        ),
    }
}

#[tauri::command]
pub fn set_watcher_start_codex(start_codex: bool) -> CommandResult<WatcherPayload> {
    match codex_plus_core::watcher::set_watcher_start_codex(start_codex) {
        Ok(()) if start_codex => ok("登录时将自动启动 Codex。", watcher_payload()),
        Ok(()) => ok("已取消登录时自动启动 Codex。", watcher_payload()),
        Err(error) => failed(
            &format!("设置登录时自动启动 Codex 失败：{error}"),
            watcher_payload(),
        ),
    }
}

#[tauri::command]
pub fn set_watcher_start_codex_on_open(enabled: bool) -> CommandResult<WatcherPayload> {
    match codex_plus_core::watcher::set_watcher_start_codex_on_open(enabled) {
        Ok(()) if enabled => ok("打开 Codex++ 时将自动启动 Codex。", watcher_payload()),
        Ok(()) => ok("已取消打开 Codex++ 时自动启动 Codex。", watcher_payload()),
        Err(error) => failed(
            &format!("设置打开 Codex++ 时自动启动失败：{error}"),
            watcher_payload(),
        ),
    }
}

#[tauri::command]
pub fn load_relay_proxy(profile_id: String) -> CommandResult<Value> {
    let profile_id = profile_id.trim().to_string();
    ok(
        "供应商代理已读取。",
        json!({
            "profileId": profile_id,
            "proxyUrl": codex_plus_core::relay_proxy::proxy_for_profile(&profile_id).unwrap_or_default(),
            "configured": codex_plus_core::relay_proxy::configured_proxy_for_profile(&profile_id).is_some()
        }),
    )
}

#[tauri::command]
pub fn set_relay_proxy(profile_id: String, proxy_url: String) -> CommandResult<Value> {
    match codex_plus_core::relay_proxy::set_proxy_for_profile(&profile_id, &proxy_url) {
        Ok(()) => ok(
            if proxy_url.trim().is_empty() {
                "供应商独立代理已清除。请保存并重新应用该供应商，然后重启 Codex 使会话请求生效。"
            } else {
                "供应商独立代理已保存。请保存并重新应用该供应商，然后重启 Codex 使会话请求生效。"
            },
            json!({
                "profileId": profile_id.trim(),
                "proxyUrl": proxy_url.trim(),
                "configured": codex_plus_core::relay_proxy::configured_proxy_for_profile(&profile_id).is_some()
            }),
        ),
        Err(error) => failed(&format!("保存供应商代理失败：{error}"), json!({})),
    }
}

#[tauri::command]
pub fn load_relay_feature(profile_id: String) -> CommandResult<Value> {
    let profile_id = profile_id.trim().to_string();
    ok(
        "供应商功能开关已读取。",
        json!({
            "profileId": profile_id,
            "stabilizePromptPrefix": codex_plus_core::relay_features::stabilize_prompt_prefix(&profile_id)
        }),
    )
}

#[tauri::command]
pub fn set_relay_feature(profile_id: String, stabilize_prompt_prefix: bool) -> CommandResult<Value> {
    match codex_plus_core::relay_features::set_stabilize_prompt_prefix(
        &profile_id,
        stabilize_prompt_prefix,
    ) {
        Ok(()) => ok(
            if stabilize_prompt_prefix {
                "供应商前缀稳定层已开启。"
            } else {
                "供应商前缀稳定层已关闭。"
            },
            json!({
                "profileId": profile_id.trim(),
                "stabilizePromptPrefix": stabilize_prompt_prefix
            }),
        ),
        Err(error) => failed(&format!("保存供应商功能开关失败：{error}"), json!({})),
    }
}

#[tauri::command]
pub fn relay_status() -> CommandResult<RelayPayload> {
    let status = codex_plus_core::relay_config::default_relay_status();
    let message = if status.authenticated {
        "已检测到 ChatGPT 登录状态。"
    } else {
        "未检测到 ChatGPT 登录状态，请先在 Codex/ChatGPT 中正常登录。"
    };
    ok(message, relay_payload(status, None))
}

#[tauri::command]
pub fn read_relay_files() -> CommandResult<RelayFilesPayload> {
    let home = codex_plus_core::relay_config::default_codex_home_dir();
    match relay_files_payload_from_home(&home) {
        Ok(payload) => ok("配置文件内容已读取。", payload),
        Err(error) => failed(
            &format!("读取配置文件失败：{error}"),
            RelayFilesPayload {
                config_path: home.join("config.toml").to_string_lossy().to_string(),
                auth_path: home.join("auth.json").to_string_lossy().to_string(),
                config_contents: String::new(),
                auth_contents: String::new(),
            },
        ),
    }
}

#[tauri::command]
pub fn check_env_conflicts() -> CommandResult<EnvConflictsPayload> {
    let conflicts = codex_plus_core::env_conflicts::detect_env_conflicts_for_home(
        &codex_plus_core::relay_config::default_codex_home_dir(),
    );
    let message = if conflicts.is_empty() {
        "未检测到会覆盖 Codex 供应商配置的 OPENAI 环境变量。"
    } else {
        "检测到可能覆盖 Codex 供应商配置的 OPENAI 环境变量。"
    };
    ok(message, EnvConflictsPayload { conflicts })
}

#[tauri::command]
pub fn remove_env_conflicts(
    request: RemoveEnvConflictsRequest,
) -> CommandResult<RemoveEnvConflictsPayload> {
    let backup_dir = codex_plus_core::paths::default_app_state_dir().join("backups");
    match codex_plus_core::env_conflicts::remove_env_conflicts(&request.names, backup_dir) {
        Ok(result) => {
            let remaining = codex_plus_core::env_conflicts::detect_env_conflicts_for_home(
                &codex_plus_core::relay_config::default_codex_home_dir(),
            );
            ok(
                "环境变量已按确认项删除；重新启动 Codex 后生效。",
                RemoveEnvConflictsPayload {
                    removed: result.removed,
                    backup_path: result.backup_path,
                    remaining,
                },
            )
        }
        Err(error) => failed(
            &format!("删除环境变量失败：{error}"),
            RemoveEnvConflictsPayload {
                removed: Vec::new(),
                backup_path: None,
                remaining: codex_plus_core::env_conflicts::detect_env_conflicts_for_home(
                    &codex_plus_core::relay_config::default_codex_home_dir(),
                ),
            },
        ),
    }
}

#[tauri::command]
pub fn save_relay_file(request: SaveRelayFileRequest) -> CommandResult<RelayFilesPayload> {
    let home = codex_plus_core::relay_config::default_codex_home_dir();
    let Ok(_guard) = relay_switch_mutex().lock() else {
        return failed(
            "供应商切换锁已损坏，请重启管理器后再试。",
            relay_files_payload_from_home(&home).unwrap_or_else(|_| RelayFilesPayload {
                config_path: home.join("config.toml").to_string_lossy().to_string(),
                auth_path: home.join("auth.json").to_string_lossy().to_string(),
                config_contents: String::new(),
                auth_contents: String::new(),
            }),
        );
    };
    let active_profile = SettingsStore::default()
        .load()
        .unwrap_or_default()
        .active_relay_profile();
    let contents =
        match prepare_relay_file_contents(&request.kind, &request.contents, &active_profile) {
            Ok(contents) => contents,
            Err(error) => {
                return failed(
                    &format!("保存配置文件失败：{error}"),
                    relay_files_payload_from_home(&home).unwrap_or_else(|_| RelayFilesPayload {
                        config_path: home.join("config.toml").to_string_lossy().to_string(),
                        auth_path: home.join("auth.json").to_string_lossy().to_string(),
                        config_contents: String::new(),
                        auth_contents: String::new(),
                    }),
                );
            }
        };
    match save_relay_file_in_home(&home, &request.kind, &contents)
        .and_then(|_| relay_files_payload_from_home(&home))
    {
        Ok(payload) => ok("配置文件已保存。", payload),
        Err(error) => failed(
            &format!("保存配置文件失败：{error}"),
            relay_files_payload_from_home(&home).unwrap_or_else(|_| RelayFilesPayload {
                config_path: home.join("config.toml").to_string_lossy().to_string(),
                auth_path: home.join("auth.json").to_string_lossy().to_string(),
                config_contents: String::new(),
                auth_contents: String::new(),
            }),
        ),
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayProfileSwitchRequest {
    pub settings: BackendSettings,
    #[serde(default)]
    pub previous_active_relay_id: String,
}

#[tauri::command]
pub fn switch_relay_profile(
    request: RelayProfileSwitchRequest,
) -> CommandResult<RelaySwitchPayload> {
    let Ok(_guard) = relay_switch_mutex().lock() else {
        let status = codex_plus_core::relay_config::default_relay_status();
        return failed(
            "供应商切换锁已损坏，请重启管理器后再试。",
            relay_switch_payload(
                SettingsStore::default().load().unwrap_or_default(),
                status,
                None,
            ),
        );
    };
    let home = codex_plus_core::relay_config::default_codex_home_dir();
    let store = SettingsStore::default();
    let previous_active_relay_id = request.previous_active_relay_id;
    let settings = normalize_settings_before_save(request.settings);
    log_manager_event(
        "manager.switch_relay_profile.start",
        json!({
            "previousActiveRelayId": previous_active_relay_id,
            "targetRelayId": settings.active_relay_id
        }),
    );
    match codex_plus_core::relay_switch::switch_relay_profile_in_home(
        &store,
        &home,
        settings,
        &previous_active_relay_id,
    ) {
        Ok(result) => {
            let status = codex_plus_core::relay_config::relay_status_from_home(&home);
            log_manager_event(
                "manager.switch_relay_profile.ok",
                json!({
                    "targetRelayId": result.settings.active_relay_id,
                    "configured": status.configured,
                    "backupPath": result.backup_path.as_ref()
                }),
            );
            ok(
                "供应商已切换。",
                relay_switch_payload(result.settings, status, result.backup_path),
            )
        }
        Err(error) => {
            let status = codex_plus_core::relay_config::relay_status_from_home(&home);
            let settings = store.load().unwrap_or_default();
            log_manager_event(
                "manager.switch_relay_profile.failed",
                json!({
                    "previousActiveRelayId": previous_active_relay_id,
                    "activeRelayId": settings.active_relay_id,
                    "error": error.to_string()
                }),
            );
            failed(
                &format!("供应商切换失败：{error}"),
                relay_switch_payload(settings, status, None),
            )
        }
    }
}

#[tauri::command]
pub fn write_diagnostic_event(event: String, detail: Value) -> CommandResult<Value> {
    let event = sanitize_manager_event(&event);
    match codex_plus_core::diagnostic_log::append_diagnostic_log(&event, detail) {
        Ok(()) => ok("诊断日志已写入。", json!({})),
        Err(error) => failed(&format!("写入诊断日志失败：{error}"), json!({})),
    }
}

/// 预检 live config.toml 能否被回填流程解析（issue #618）。
///
/// core 侧的 `backfill_relay_profile_from_home_with_common` 会先做重复表头/重复
/// 根键的语义归一化（`normalize_duplicate_toml_text`，公开入口是
/// `normalize_config_text`），再对归一化结果做整份 TOML 解析。所以这里必须走同一
/// 条归一化路径，否则会对「只是有重复表头」的文件误报语法错误。
///
/// 返回 `Some(错误描述)` 表示回填注定失败：要么读文件失败，要么归一化后仍不是合法
/// TOML。返回 `None` 表示可以继续回填。文件不存在等同于空文件，属可回填。
fn live_config_backfill_blocking_error(home: &Path) -> Option<String> {
    let config_path = home.join("config.toml");
    let contents = match fs::read_to_string(&config_path) {
        Ok(contents) => contents,
        // 不存在按空文件处理，与 core 的 read_optional_text 一致。
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return None,
        Err(error) => return Some(format!("读取 {} 失败：{error}", config_path.display())),
    };
    // 与 core 的 parse_toml_document 一样先剥掉 BOM。
    let contents = contents.trim_start_matches('\u{feff}');
    if contents.trim().is_empty() {
        return None;
    }
    let normalized = codex_plus_core::relay_config::normalize_config_text(contents);
    match normalized.parse::<toml_edit::DocumentMut>() {
        Ok(_) => None,
        Err(error) => Some(format!("{error}")),
    }
}

#[tauri::command]
pub fn backfill_relay_profile_from_live(
    request: BackfillRelayProfileRequest,
) -> CommandResult<SettingsBackfillPayload> {
    let home = codex_plus_core::relay_config::default_codex_home_dir();
    let mut settings = request.settings;
    let requested_profile_id = request.profile_id.clone();
    log_manager_event(
        "manager.backfill_relay_profile_from_live.start",
        json!({
            "profileId": requested_profile_id,
            "activeRelayId": settings.active_relay_id
        }),
    );
    let Some(profile_index) = settings
        .relay_profiles
        .iter()
        .position(|profile| profile.id == request.profile_id)
    else {
        log_manager_event(
            "manager.backfill_relay_profile_from_live.missing_profile",
            json!({
                "profileId": requested_profile_id
            }),
        );
        return failed(
            "当前供应商已不在配置列表中，已停止切换以避免覆盖用户改动。",
            SettingsBackfillPayload { settings },
        );
    };

    // live 的 config.toml 只要有一处手写语法错误，core 的整份 TOML 解析就会失败
    // （relay_config.rs 的 parse_toml_document），回填因此无法进行。但「回填」只是
    // 切换前的一次快照采集，不是切换到新供应商的必要条件；让整条切换流程失败会
    // 把用户卡死在中转态（issue #618）。这里比照同文件 2089 / 2350 两处既有写法，
    // 在解析失败时降级：保留原 settings 不动、只提示用户先修 config.toml 语法。
    if let Some(error) = live_config_backfill_blocking_error(&home) {
        log_manager_event(
            "manager.backfill_relay_profile_from_live.degraded",
            json!({
                "profileId": requested_profile_id,
                "error": error
            }),
        );
        return degraded(
            &format!("config.toml 有语法错误，已跳过回填并保留原有配置（切换照常进行）：{error}"),
            SettingsBackfillPayload { settings },
        );
    }

    if !request.adopt_provider_identity {
        match codex_plus_core::relay_config::live_config_matches_other_profile_in_home(
            &home,
            &settings,
            &request.profile_id,
        ) {
            Ok(true) => {
                return ok(
                    "实时配置属于其它已保存供应商，已保留原快照。",
                    SettingsBackfillPayload { settings },
                );
            }
            Ok(false) => {}
            Err(error) => {
                return failed(
                    &format!("读取实时配置归属失败，已保留原配置：{error}"),
                    SettingsBackfillPayload { settings },
                );
            }
        }
    }

    // 回填会就地改写 profile 与公共配置。先在副本上跑，成功才提交，避免中途
    // 失败时留下「改了一半」的 profile 被后续切换流程用上。
    let mut next_profile = settings.relay_profiles[profile_index].clone();
    let mut next_context = settings.relay_context_config_contents.clone();
    match codex_plus_core::relay_config::backfill_relay_profile_from_home_with_common_and_policy(
        &home,
        &mut next_profile,
        &mut next_context,
        if request.adopt_provider_identity {
            codex_plus_core::relay_config::RelayBackfillPolicy::AdoptLiveIdentity
        } else {
            codex_plus_core::relay_config::RelayBackfillPolicy::PreserveIdentity
        },
    ) {
        Ok(()) => {
            let changed = next_profile != settings.relay_profiles[profile_index]
                || next_context != settings.relay_context_config_contents;
            settings.relay_profiles[profile_index] = next_profile;
            settings.relay_context_config_contents = next_context;
            log_manager_event(
                "manager.backfill_relay_profile_from_live.ok",
                json!({
                    "profileId": requested_profile_id
                }),
            );
            ok(
                if !changed {
                    "实时配置没有需要回填的内容，已保留当前供应商快照。"
                } else if request.adopt_provider_identity {
                    "已采纳当前 URL 与认证，并重置旧自定义请求头。"
                } else {
                    "当前供应商配置已从 live 文件回填。"
                },
                SettingsBackfillPayload { settings },
            )
        }
        Err(error) => {
            log_manager_event(
                "manager.backfill_relay_profile_from_live.failed",
                json!({
                    "profileId": requested_profile_id,
                    "error": error.to_string()
                }),
            );
            failed(
                &format!("回填当前供应商配置失败：{error}"),
                SettingsBackfillPayload { settings },
            )
        }
    }
}

#[tauri::command]
pub fn list_context_entries(
    request: ContextSettingsRequest,
) -> CommandResult<ContextEntriesPayload> {
    match codex_plus_core::relay_config::list_context_entries_from_common_config(
        &request.settings.relay_context_config_contents,
    ) {
        Ok(entries) => ok(
            "MCP&插件列表已读取。",
            ContextEntriesPayload {
                settings: request.settings,
                entries,
            },
        ),
        Err(error) => failed(
            &format!("读取MCP&插件列表失败：{error}"),
            ContextEntriesPayload {
                settings: request.settings,
                entries: empty_context_entries(),
            },
        ),
    }
}

#[tauri::command]
pub fn read_live_context_entries() -> CommandResult<LiveContextEntriesPayload> {
    let home = codex_plus_core::relay_config::default_codex_home_dir();
    let config_path = home.join("config.toml");
    let config = read_optional_text_file(&config_path).unwrap_or_default();
    match codex_plus_core::relay_config::list_context_entries_from_common_config(&config) {
        Ok(entries) => ok(
            "live MCP&插件已读取。",
            LiveContextEntriesPayload { entries },
        ),
        Err(error) => failed(
            &format!("读取 live MCP&插件失败：{error}"),
            LiveContextEntriesPayload {
                entries: empty_context_entries(),
            },
        ),
    }
}

#[tauri::command]
pub fn upsert_context_entry(request: ContextEntryRequest) -> CommandResult<ContextEntriesPayload> {
    let mut settings = request.settings;
    match codex_plus_core::relay_config::upsert_context_entry_in_common_config(
        &settings.relay_context_config_contents,
        &request.kind,
        &request.id,
        &request.toml_body,
    ) {
        Ok(common) => {
            settings.relay_context_config_contents = common;
            list_context_entries(ContextSettingsRequest { settings })
        }
        Err(error) => failed(
            &format!("保存MCP&插件失败：{error}"),
            ContextEntriesPayload {
                settings,
                entries: empty_context_entries(),
            },
        ),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpFormPayload {
    pub form: codex_plus_core::mcp_config::McpServerForm,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTomlPayload {
    pub toml_body: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpImportRequest {
    pub settings: BackendSettings,
    pub json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpImportPreviewPayload {
    pub entries: Vec<codex_plus_core::mcp_config::McpJsonEntry>,
    pub warnings: Vec<String>,
}

/// 把 TOML 表体拆成表单字段。纯转换，不碰 settings——
/// 打开编辑器时解析一次即可，不必每次按键都往返后端。
#[tauri::command]
pub fn parse_mcp_entry(toml_body: String) -> CommandResult<McpFormPayload> {
    match codex_plus_core::mcp_config::parse_mcp_toml_body(&toml_body) {
        Ok(form) => ok("已解析 MCP 配置。", McpFormPayload { form }),
        Err(error) => failed(
            &format!("解析 MCP 配置失败：{error}"),
            McpFormPayload {
                form: Default::default(),
            },
        ),
    }
}

/// 按需检查已知入口，后台执行且有时限；不启动 MCP、不写配置。
#[tauri::command]
pub async fn inspect_mcp_startup(
    form: codex_plus_core::mcp_config::McpServerForm,
) -> CommandResult<codex_plus_core::mcp_config::McpCommandInspection> {
    match codex_plus_core::mcp_config::inspect_current_mcp_startup(form).await {
        Ok(result) => {
            let message = result.message.clone();
            ok(&message, result)
        }
        Err(error) => failed(&error.to_string(), Default::default()),
    }
}

/// 表单字段拼回 TOML 表体。同样是纯转换。
#[tauri::command]
pub fn build_mcp_entry(
    form: codex_plus_core::mcp_config::McpServerForm,
) -> CommandResult<McpTomlPayload> {
    match codex_plus_core::mcp_config::build_mcp_toml_body(&form) {
        Ok(toml_body) => ok("已生成 MCP 配置。", McpTomlPayload { toml_body }),
        Err(error) => failed(
            &format!("生成 MCP 配置失败：{error}"),
            McpTomlPayload {
                toml_body: String::new(),
            },
        ),
    }
}

/// 只解析不写入，让用户先看清会导入哪几条、有哪些字段被改写。
#[tauri::command]
pub fn preview_mcp_servers_json(json: String) -> CommandResult<McpImportPreviewPayload> {
    match codex_plus_core::mcp_config::parse_mcp_servers_json(&json) {
        Ok(import) => {
            let message = if import.warnings.is_empty() {
                format!("解析出 {} 个 MCP 服务器。", import.entries.len())
            } else {
                format!(
                    "解析出 {} 个 MCP 服务器，{} 处需要注意。",
                    import.entries.len(),
                    import.warnings.len()
                )
            };
            ok(
                &message,
                McpImportPreviewPayload {
                    entries: import.entries,
                    warnings: import.warnings,
                },
            )
        }
        Err(error) => failed(
            &format!("解析 JSON 失败：{error}"),
            McpImportPreviewPayload {
                entries: Vec::new(),
                warnings: Vec::new(),
            },
        ),
    }
}

/// 批量写入。一次性更新 settings，避免 N 条 MCP 就往返 N 次。
#[tauri::command]
pub fn import_mcp_servers_json(request: McpImportRequest) -> CommandResult<ContextEntriesPayload> {
    let mut settings = request.settings;
    let import = match codex_plus_core::mcp_config::parse_mcp_servers_json(&request.json) {
        Ok(import) => import,
        Err(error) => {
            return failed(
                &format!("解析 JSON 失败：{error}"),
                ContextEntriesPayload {
                    settings,
                    entries: empty_context_entries(),
                },
            );
        }
    };

    let total = import.entries.len();
    let mut common = settings.relay_context_config_contents.clone();
    for entry in &import.entries {
        match codex_plus_core::relay_config::upsert_context_entry_in_common_config(
            &common,
            "mcp",
            &entry.id,
            &entry.toml_body,
        ) {
            Ok(updated) => common = updated,
            Err(error) => {
                return failed(
                    &format!("导入 {} 失败：{error}", entry.id),
                    ContextEntriesPayload {
                        settings,
                        entries: empty_context_entries(),
                    },
                );
            }
        }
    }

    settings.relay_context_config_contents = common;
    let mut result = list_context_entries(ContextSettingsRequest { settings });
    result.message = if import.warnings.is_empty() {
        format!("已导入 {total} 个 MCP 服务器。")
    } else {
        format!(
            "已导入 {total} 个 MCP 服务器：{}",
            import.warnings.join("；")
        )
    };
    result
}

#[tauri::command]
pub fn sync_live_context_entries(
    request: ContextSettingsRequest,
) -> CommandResult<LiveContextEntriesPayload> {
    let home = codex_plus_core::relay_config::default_codex_home_dir();
    let config_path = home.join("config.toml");
    let current_config = match read_optional_text_file(&config_path) {
        Ok(config) => config,
        Err(error) => {
            return failed(
                &format!("读取 live config.toml 失败：{error}"),
                LiveContextEntriesPayload {
                    entries: empty_context_entries(),
                },
            );
        }
    };
    let updated_config = match codex_plus_core::relay_config::sync_live_config_context_entries(
        &current_config,
        &request.settings.relay_context_config_contents,
    ) {
        Ok(config) => config,
        Err(error) => {
            return failed(
                &format!("同步 live MCP&插件失败：{error}"),
                LiveContextEntriesPayload {
                    entries: empty_context_entries(),
                },
            );
        }
    };
    if let Some(parent) = config_path.parent() {
        if let Err(error) = std::fs::create_dir_all(parent) {
            return failed(
                &format!("创建 Codex 配置目录失败：{error}"),
                LiveContextEntriesPayload {
                    entries: empty_context_entries(),
                },
            );
        }
    }
    // 必须原子替换：`fs::write` 先截断再写，Codex 若在这一瞬间读 config.toml
    // 会拿到空文件或半截内容，对话中报「无法加载 config.toml」（#2621）。
    if let Err(error) =
        codex_plus_core::settings::atomic_write(&config_path, updated_config.as_bytes())
    {
        return failed(
            &format!("写入 live config.toml 失败：{error}"),
            LiveContextEntriesPayload {
                entries: empty_context_entries(),
            },
        );
    }
    match codex_plus_core::relay_config::list_context_entries_from_common_config(&updated_config) {
        Ok(entries) => ok(
            "live MCP&插件已同步。",
            LiveContextEntriesPayload { entries },
        ),
        Err(error) => failed(
            &format!("读取同步后的 live MCP&插件失败：{error}"),
            LiveContextEntriesPayload {
                entries: empty_context_entries(),
            },
        ),
    }
}

#[tauri::command]
pub fn delete_context_entry(request: ContextDeleteRequest) -> CommandResult<ContextEntriesPayload> {
    let mut settings = request.settings;
    match codex_plus_core::relay_config::delete_context_entry_from_common_config(
        &settings.relay_context_config_contents,
        &request.kind,
        &request.id,
    ) {
        Ok(common) => {
            settings.relay_context_config_contents = common;
            list_context_entries(ContextSettingsRequest { settings })
        }
        Err(error) => failed(
            &format!("删除MCP&插件失败：{error}"),
            ContextEntriesPayload {
                settings,
                entries: empty_context_entries(),
            },
        ),
    }
}

#[tauri::command]
pub fn extract_relay_common_config(
    request: ExtractRelayCommonConfigRequest,
) -> CommandResult<ExtractRelayCommonConfigPayload> {
    match codex_plus_core::relay_config::extract_common_config_from_config(&request.config_contents)
        .and_then(|common_config_contents| {
            let profile_config_contents =
                codex_plus_core::relay_config::strip_common_config_from_config(
                    &request.config_contents,
                    &common_config_contents,
                )?;
            Ok(ExtractRelayCommonConfigPayload {
                common_config_contents,
                profile_config_contents,
            })
        }) {
        Ok(payload) => ok("通用配置已按兼容切换规则提取。", payload),
        Err(error) => failed(
            &format!("提取通用配置失败：{error}"),
            ExtractRelayCommonConfigPayload {
                common_config_contents: String::new(),
                profile_config_contents: request.config_contents,
            },
        ),
    }
}

#[tauri::command]
pub async fn test_relay_profile(profile: RelayProfile) -> CommandResult<RelayProfileTestPayload> {
    let profile_name = if profile.name.trim().is_empty() {
        "未命名供应商"
    } else {
        profile.name.trim()
    };
    let test_model: String = if !profile.test_model.trim().is_empty() {
        // 1. 使用者在該供應商明確填的測試模型
        profile.test_model.trim().to_string()
    } else {
        // 2. 該供應商自己 config.toml 裡的 model（避免串味）
        let from_profile = codex_plus_core::relay_config::relay_profile_model(&profile);
        if from_profile.trim().is_empty() {
            // 3. 未配置时使用内置测试模型。
            codex_plus_core::settings::default_relay_test_model()
        } else {
            from_profile
        }
    };
    match codex_plus_core::relay_config::test_relay_profile(&profile, &test_model).await {
        Ok(result) => {
            let status = if !result.protocol_valid { "failed" }
                else if result.completion_status != "completed" { "warning" } else { "ok" };
            let preview = result.response_preview.trim();
            let detail = if preview.is_empty() {
                "响应内容为空".to_string()
            } else {
                format!("响应：{preview}")
            };
            CommandResult {
                status: status.to_string(),
                message: format!(
                    "已向「{profile_name}」用模型「{test_model}」发送 hi，HTTP {}。{detail}",
                    result.http_status
                ),
                payload: RelayProfileTestPayload {
                    http_status: result.http_status,
                    endpoint: result.endpoint,
                    response_preview: result.response_preview,
                    protocol_valid: result.protocol_valid,
                    completion_status: result.completion_status,
                },
            }
        }
        Err(error) => failed(
            &format!("测试「{profile_name}」失败：{error}"),
            RelayProfileTestPayload {
                http_status: 0,
                endpoint: String::new(),
                response_preview: String::new(),
                protocol_valid: false,
                completion_status: "failed".into(),
            },
        ),
    }
}

#[tauri::command]
pub async fn test_stepwise_settings(
    settings: BackendSettings,
) -> CommandResult<StepwiseTestPayload> {
    let configured_protocol = codex_plus_core::settings::normalize_stepwise_protocol(
        &settings.codex_app_stepwise_protocol,
    );
    match codex_plus_core::stepwise::test_connection(&settings).await {
        Ok(result) => {
            let error = result
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let item_count = result
                .get("items")
                .and_then(Value::as_array)
                .map(Vec::len)
                .unwrap_or_default();
            let protocol = result
                .get("protocol")
                .and_then(Value::as_str)
                .unwrap_or(&configured_protocol)
                .to_string();
            if error.is_empty() {
                ok(
                    &format!(
                        "下一步建议连接正常（{}），测试返回 {item_count} 条建议。",
                        stepwise_protocol_label(&protocol)
                    ),
                    StepwiseTestPayload { item_count, error },
                )
            } else {
                failed(
                    &format!("下一步建议测试失败：{error}"),
                    StepwiseTestPayload { item_count, error },
                )
            }
        }
        Err(error) => failed(
            &format!("下一步建议测试失败：{error}"),
            StepwiseTestPayload {
                item_count: 0,
                error: error.to_string(),
            },
        ),
    }
}

fn stepwise_protocol_label(protocol: &str) -> &str {
    match protocol {
        "chat_completions" => "Chat Completions",
        "responses" => "Responses",
        "anthropic_messages" => "Anthropic Messages",
        "auto" => "自动兼容",
        _ => protocol,
    }
}

#[tauri::command]
pub async fn fetch_relay_profile_models(
    profile: RelayProfile,
) -> CommandResult<RelayProfileModelsPayload> {
    let profile_name = if profile.name.trim().is_empty() {
        "未命名供应商"
    } else {
        profile.name.trim()
    };
    match codex_plus_core::model_catalog::fetch_relay_profile_model_ids(&profile).await {
        Ok((models, endpoint)) => ok(
            &format!("已从「{profile_name}」获取 {} 个模型。", models.len()),
            RelayProfileModelsPayload { models, endpoint },
        ),
        Err(error) => failed(
            &format!("从「{profile_name}」获取模型失败：{error}"),
            RelayProfileModelsPayload {
                models: Vec::new(),
                endpoint: String::new(),
            },
        ),
    }
}

#[tauri::command]
pub async fn fetch_sub2api_billing(profile: RelayProfile) -> CommandResult<Sub2ApiBillingPayload> {
    let profile_name = if profile.name.trim().is_empty() {
        "未命名供应商"
    } else {
        profile.name.trim()
    };
    match codex_plus_core::sub2api::fetch_sub2api_billing_info(&profile).await {
        Ok(info) => ok(
            &format!(
                "已从「{profile_name}」获取倍率：{}x。",
                format_multiplier(info.effective_rate_multiplier)
            ),
            Sub2ApiBillingPayload {
                endpoint: info.endpoint,
                group_rate_multiplier: info.group_rate_multiplier,
                user_rate_multiplier: info.user_rate_multiplier,
                resolved_rate_multiplier: info.resolved_rate_multiplier,
                peak_rate_enabled: info.peak_rate_enabled,
                peak_rate_multiplier: info.peak_rate_multiplier,
                applied_peak_multiplier: info.applied_peak_multiplier,
                effective_rate_multiplier: info.effective_rate_multiplier,
                observed_at: info.observed_at,
            },
        ),
        Err(error) => failed(
            &format!("从「{profile_name}」获取 sub2api 倍率失败：{error}"),
            Sub2ApiBillingPayload {
                endpoint: codex_plus_core::sub2api::sub2api_billing_endpoint(
                    if profile.upstream_base_url.trim().is_empty() {
                        profile.base_url.trim()
                    } else {
                        profile.upstream_base_url.trim()
                    },
                ),
                group_rate_multiplier: 0.0,
                user_rate_multiplier: None,
                resolved_rate_multiplier: 0.0,
                peak_rate_enabled: false,
                peak_rate_multiplier: None,
                applied_peak_multiplier: None,
                effective_rate_multiplier: 0.0,
                observed_at: String::new(),
            },
        ),
    }
}

fn format_multiplier(value: f64) -> String {
    let mut text = format!("{value:.4}");
    while text.contains('.') && text.ends_with('0') {
        text.pop();
    }
    if text.ends_with('.') {
        text.pop();
    }
    text
}

#[tauri::command]
pub async fn diagnose_relay_profile(profile: RelayProfile) -> CommandResult<ProviderDoctorPayload> {
    let profile_name = if profile.name.trim().is_empty() {
        "未命名供应商".to_string()
    } else {
        profile.name.trim().to_string()
    };
    let test_model = if !profile.test_model.trim().is_empty() {
        profile.test_model.trim().to_string()
    } else {
        let from_profile = codex_plus_core::relay_config::relay_profile_model(&profile);
        if from_profile.trim().is_empty() {
            codex_plus_core::settings::default_relay_test_model()
        } else {
            from_profile
        }
    };
    let mut checks = Vec::new();

    if profile.relay_mode == codex_plus_core::settings::RelayMode::Official
        && !profile.official_mix_api_key
    {
        checks.push(ProviderDoctorCheck {
            id: "config".to_string(),
            title: "配置完整性".to_string(),
            status: "ok".to_string(),
            detail: "官方登录供应商不需要 Base URL / API Key。".to_string(),
        });
        let payload = ProviderDoctorPayload {
            profile_name,
            model: test_model,
            summary: "官方登录供应商无需 API 诊断。".to_string(),
            recommendation: "如果 Codex 官方账号可用，直接使用官方登录模式即可。".to_string(),
            checks,
        };
        return ok("Provider Doctor：官方登录供应商无需 API 诊断。", payload);
    }

    if codex_plus_core::relay_config::relay_profile_base_url(&profile)
        .trim()
        .is_empty()
        || (!profile.uses_no_auth()
            && codex_plus_core::relay_config::relay_profile_api_key(&profile)
                .trim()
                .is_empty())
    {
        checks.push(ProviderDoctorCheck {
            id: "config".to_string(),
            title: "配置完整性".to_string(),
            status: "failed".to_string(),
            detail: "Base URL 为空，或需要认证但 API Key 为空。".to_string(),
        });
        let payload = ProviderDoctorPayload {
            profile_name,
            model: test_model,
            summary: "配置不完整，无法发起上游诊断。".to_string(),
            recommendation:
                "先填写 Base URL，并填写 API Key 或为可信上游开启无需认证；如果是官方账号，请切换到官方登录模式。"
                    .to_string(),
            checks,
        };
        return failed("Provider Doctor：配置不完整。", payload);
    }

    checks.push(ProviderDoctorCheck {
        id: "config".to_string(),
        title: "配置完整性".to_string(),
        status: "ok".to_string(),
        detail: format!(
            "{} / {}",
            codex_plus_core::relay_config::relay_profile_base_url(&profile),
            match profile.protocol {
                codex_plus_core::settings::RelayProtocol::Responses => "Responses API",
                codex_plus_core::settings::RelayProtocol::ChatCompletions => "Chat Completions",
                codex_plus_core::settings::RelayProtocol::AnthropicMessages => {
                    "Anthropic Messages"
                }
            }
        ),
    });

    match codex_plus_core::model_catalog::fetch_relay_profile_model_ids(&profile).await {
        Ok((models, endpoint)) => {
            let contains_model = !test_model.trim().is_empty()
                && models.iter().any(|model| model == test_model.trim());
            let status = if models.is_empty() {
                "failed"
            } else if contains_model || test_model.trim().is_empty() {
                "ok"
            } else {
                "warning"
            };
            let detail = if models.is_empty() {
                format!("{endpoint} 返回 0 个模型。")
            } else if contains_model || test_model.trim().is_empty() {
                format!("{endpoint} 返回 {} 个模型。", models.len())
            } else {
                format!(
                    "{endpoint} 返回 {} 个模型，但未看到测试模型「{}」。",
                    models.len(),
                    test_model
                )
            };
            checks.push(ProviderDoctorCheck {
                id: "models".to_string(),
                title: "模型列表".to_string(),
                status: status.to_string(),
                detail,
            });
        }
        Err(error) => checks.push(ProviderDoctorCheck {
            id: "models".to_string(),
            title: "模型列表".to_string(),
            status: "failed".to_string(),
            detail: error.to_string(),
        }),
    }

    match codex_plus_core::relay_config::test_relay_profile(&profile, &test_model).await {
        Ok(result) => {
            let status = if !result.protocol_valid { "failed" }
                else if result.completion_status != "completed" { "warning" } else { "ok" };
            let preview = result.response_preview.trim();
            checks.push(ProviderDoctorCheck {
                id: "request".to_string(),
                title: "真实请求".to_string(),
                status: status.to_string(),
                detail: if preview.is_empty() {
                    format!(
                        "{} 返回 HTTP {}，响应内容为空。",
                        result.endpoint, result.http_status
                    )
                } else {
                    format!(
                        "{} 返回 HTTP {}：{}",
                        result.endpoint, result.http_status, preview
                    )
                },
            });
        }
        Err(error) => checks.push(ProviderDoctorCheck {
            id: "request".to_string(),
            title: "真实请求".to_string(),
            status: "failed".to_string(),
            detail: error.to_string(),
        }),
    }

    let failed_count = checks
        .iter()
        .filter(|check| check.status == "failed")
        .count();
    let warning_count = checks
        .iter()
        .filter(|check| check.status == "warning")
        .count();
    let status = if failed_count > 0 {
        "failed"
    } else if warning_count > 0 {
        "ok"
    } else {
        "ok"
    };
    let summary = if failed_count > 0 {
        format!("发现 {failed_count} 项失败，Codex 可能无法使用该供应商。")
    } else if warning_count > 0 {
        format!("基础连接可用，但有 {warning_count} 项需要确认。")
    } else {
        "供应商基础诊断通过。".to_string()
    };
    let recommendation = provider_doctor_recommendation(&checks);
    let message = format!("Provider Doctor：{summary}");
    CommandResult {
        status: status.to_string(),
        message,
        payload: ProviderDoctorPayload {
            profile_name,
            model: test_model,
            summary,
            recommendation,
            checks,
        },
    }
}

fn provider_doctor_recommendation(checks: &[ProviderDoctorCheck]) -> String {
    if checks
        .iter()
        .any(|check| check.id == "config" && check.status == "failed")
    {
        return "先补齐 Base URL 和 API Key；如果使用官方账号，请切换到官方登录模式。".to_string();
    }
    if checks
        .iter()
        .any(|check| check.id == "models" && check.status == "failed")
    {
        return "优先检查 Base URL 是否包含正确的 /v1 前缀，以及供应商是否支持 /v1/models。"
            .to_string();
    }
    if checks
        .iter()
        .any(|check| check.id == "request" && check.status == "failed")
    {
        return "优先检查测试模型名称、上游协议选择和 Key 权限；如果 Chat Completions 可用，请切到对应协议。".to_string();
    }
    if checks.iter().any(|check| check.status == "warning") {
        return "连接可用，但测试模型没有出现在模型列表里；建议改用上游返回的模型名。".to_string();
    }
    "可以作为 Codex 供应商使用；如果真实对话仍失败，请查看协议代理日志里的上游响应。".to_string()
}

#[tauri::command]
pub fn apply_relay_injection() -> CommandResult<RelayPayload> {
    let home = codex_plus_core::relay_config::default_codex_home_dir();
    let Ok(_guard) = relay_switch_mutex().lock() else {
        let status = codex_plus_core::relay_config::relay_status_from_home(&home);
        return failed(
            "供应商切换锁已损坏，请重启管理器后再试。",
            relay_payload(status, None),
        );
    };
    let settings = SettingsStore::default().load().unwrap_or_default();
    if !settings.relay_profiles_enabled {
        let status = codex_plus_core::relay_config::relay_status_from_home(&home);
        return failed(
            "供应商配置总开关已关闭，未写入 config.toml / auth.json。",
            relay_payload(status, None),
        );
    }
    prepare_codex_app_state_before_provider_switch(&home, "manager.apply_relay_injection.before");
    let relay = settings.active_relay_profile();
    log_relay_apply_request("manager.apply_relay_injection", &settings, &relay);
    if let Some(aggregate) = settings.active_aggregate_relay_profile() {
        let response = apply_aggregate_relay_injection_to_home(&home, aggregate.session_provider);
        if response.status == "ok" {
            finish_codex_app_state_after_provider_switch(
                &home,
                "manager.apply_relay_injection.aggregate",
            );
        }
        return response;
    }
    if relay_has_complete_files(&relay) {
        return match codex_plus_core::relay_config::apply_relay_profile_to_home_with_switch_rules(
            &home,
            &relay,
            &relay_combined_common_config(&settings),
        ) {
            Ok(result) => {
                finish_codex_app_state_after_provider_switch(
                    &home,
                    "manager.apply_relay_injection.profile",
                );
                let status = codex_plus_core::relay_config::relay_status_from_home(&home);
                log_relay_apply_result(
                    "manager.apply_relay_injection.ok",
                    &relay,
                    &status,
                    result.backup_path.as_ref(),
                    None,
                );
                ok(
                    "已按兼容切换规则切换供应商。",
                    relay_payload(status, result.backup_path),
                )
            }
            Err(error) => {
                let status = codex_plus_core::relay_config::relay_status_from_home(&home);
                log_relay_apply_result(
                    "manager.apply_relay_injection.failed",
                    &relay,
                    &status,
                    None,
                    Some(error.to_string()),
                );
                failed(
                    &format!("切换完整中转配置失败：{error}"),
                    relay_payload(status, None),
                )
            }
        };
    }

    let auth = codex_plus_core::relay_config::chatgpt_auth_status_from_home(&home);
    if !auth.authenticated {
        let status = codex_plus_core::relay_config::relay_status_from_home(&home);
        log_relay_apply_result(
            "manager.apply_relay_injection.failed",
            &relay,
            &status,
            None,
            Some("未检测到 ChatGPT 登录状态".to_string()),
        );
        return failed(
            "未检测到 ChatGPT 登录状态，已停止写入中转配置。",
            relay_payload(status, None),
        );
    }

    match codex_plus_core::relay_config::apply_relay_config_to_home_with_session_provider(
        &home,
        &relay.base_url,
        &relay.api_key,
        relay.protocol,
        codex_plus_core::protocol_proxy::protocol_proxy_port(),
        codex_plus_core::relay_config::relay_session_provider_from_config(&relay.config_contents),
    ) {
        Ok(result) => {
            finish_codex_app_state_after_provider_switch(
                &home,
                "manager.apply_relay_injection.generated",
            );
            let status = codex_plus_core::relay_config::relay_status_from_home(&home);
            log_relay_apply_result(
                "manager.apply_relay_injection.ok",
                &relay,
                &status,
                result.backup_path.as_ref(),
                None,
            );
            ok(
                "中转配置已写入，密钥未在界面明文显示。",
                relay_payload(status, result.backup_path),
            )
        }
        Err(error) => {
            let status = codex_plus_core::relay_config::relay_status_from_home(&home);
            log_relay_apply_result(
                "manager.apply_relay_injection.failed",
                &relay,
                &status,
                None,
                Some(error.to_string()),
            );
            failed(
                &format!("写入中转配置失败：{error}"),
                relay_payload(status, None),
            )
        }
    }
}

fn apply_aggregate_relay_injection_to_home(
    home: &Path,
    session_provider: RelaySessionProvider,
) -> CommandResult<RelayPayload> {
    // 模型聚合需要和普通供应商切换共用 catalog 写盘链路；旧的直接代理
    // 写入路径保留给未开启模型聚合的旧配置和无 settings 测试调用。
    if let Ok(settings) = SettingsStore::default().load() {
        let profile = settings.active_relay_profile();
        if profile.relay_mode == RelayMode::Aggregate
            && settings
                .active_aggregate_relay_profile()
                .is_some_and(|aggregate| aggregate.model_aggregation_enabled)
        {
            let common_config = relay_combined_common_config(&settings);
            match codex_plus_core::relay_config::apply_relay_profile_to_home_with_switch_rules(
                home,
                &profile,
                &common_config,
            ) {
                Ok(result) => {
                    let status = codex_plus_core::relay_config::relay_status_from_home(home);
                    let mut message =
                        "聚合供应商配置和模型目录已写入，选中的模型会固定发送到对应成员。"
                            .to_string();
                    if let Some(warning) =
                        codex_plus_core::aggregate_catalog::subagent_conflict_warning(
                            home, &settings,
                        )
                    {
                        message.push_str("\n\n");
                        message.push_str(&warning);
                    }
                    return ok(&message, relay_payload(status, result.backup_path));
                }
                Err(error) => {
                    let status = codex_plus_core::relay_config::relay_status_from_home(home);
                    return failed(
                        &format!("写入聚合供应商配置失败：{error}"),
                        relay_payload(status, None),
                    );
                }
            }
        }
    }
    match codex_plus_core::relay_config::apply_relay_config_to_home_with_session_provider(
        home,
        &codex_plus_core::protocol_proxy::local_responses_proxy_base_url(
            codex_plus_core::protocol_proxy::protocol_proxy_port(),
        ),
        "codex-plus-aggregate",
        codex_plus_core::settings::RelayProtocol::Responses,
        codex_plus_core::protocol_proxy::protocol_proxy_port(),
        session_provider,
    ) {
        Ok(result) => {
            let status = codex_plus_core::relay_config::relay_status_from_home(home);
            ok(
                "聚合供应商配置已写入，真实请求会由本地代理按策略轮转。",
                relay_payload(status, result.backup_path),
            )
        }
        Err(error) => {
            let status = codex_plus_core::relay_config::relay_status_from_home(home);
            failed(
                &format!("写入聚合供应商配置失败：{error}"),
                relay_payload(status, None),
            )
        }
    }
}

#[tauri::command]
pub fn apply_pure_api_injection() -> CommandResult<RelayPayload> {
    let home = codex_plus_core::relay_config::default_codex_home_dir();
    let Ok(_guard) = relay_switch_mutex().lock() else {
        let status = codex_plus_core::relay_config::relay_status_from_home(&home);
        return failed(
            "供应商切换锁已损坏，请重启管理器后再试。",
            relay_payload(status, None),
        );
    };
    let settings = SettingsStore::default().load().unwrap_or_default();
    if !settings.relay_profiles_enabled {
        let status = codex_plus_core::relay_config::relay_status_from_home(&home);
        return failed(
            "供应商配置总开关已关闭，未写入 config.toml / auth.json。",
            relay_payload(status, None),
        );
    }
    prepare_codex_app_state_before_provider_switch(
        &home,
        "manager.apply_pure_api_injection.before",
    );
    let relay = settings.active_relay_profile();
    log_relay_apply_request("manager.apply_pure_api_injection", &settings, &relay);
    if relay_has_complete_files(&relay) {
        return match codex_plus_core::relay_config::apply_relay_profile_to_home_with_switch_rules(
            &home,
            &relay,
            &relay_combined_common_config(&settings),
        ) {
            Ok(result) => {
                finish_codex_app_state_after_provider_switch(
                    &home,
                    "manager.apply_pure_api_injection.profile",
                );
                let status = codex_plus_core::relay_config::relay_status_from_home(&home);
                log_relay_apply_result(
                    "manager.apply_pure_api_injection.ok",
                    &relay,
                    &status,
                    result.backup_path.as_ref(),
                    None,
                );
                if !status.configured {
                    return failed(
                        "纯 API 配置写入后未检测到完整 custom provider，请检查 config.toml 和供应商 API Key。",
                        relay_payload(status, result.backup_path),
                    );
                }
                ok(
                    "已按兼容切换规则切换供应商。",
                    relay_payload(status, result.backup_path),
                )
            }
            Err(error) => {
                let status = codex_plus_core::relay_config::relay_status_from_home(&home);
                log_relay_apply_result(
                    "manager.apply_pure_api_injection.failed",
                    &relay,
                    &status,
                    None,
                    Some(error.to_string()),
                );
                failed(
                    &format!("切换纯 API 配置失败：{error}"),
                    relay_payload(status, None),
                )
            }
        };
    }

    match codex_plus_core::relay_config::apply_pure_api_config_to_home_with_session_provider(
        &home,
        &relay.base_url,
        &relay.api_key,
        relay.protocol,
        codex_plus_core::protocol_proxy::protocol_proxy_port(),
        codex_plus_core::relay_config::relay_session_provider_from_config(&relay.config_contents),
    ) {
        Ok(result) => {
            finish_codex_app_state_after_provider_switch(
                &home,
                "manager.apply_pure_api_injection.generated",
            );
            let status = codex_plus_core::relay_config::relay_status_from_home(&home);
            log_relay_apply_result(
                "manager.apply_pure_api_injection.ok",
                &relay,
                &status,
                result.backup_path.as_ref(),
                None,
            );
            if !status.configured {
                return failed(
                    "纯 API 配置写入后未检测到完整 custom provider，请检查 config.toml 和供应商 API Key。",
                    relay_payload(status, result.backup_path),
                );
            }
            ok(
                "纯 API 模式已写入：config.toml 已写入 custom provider，auth.json 已切换为当前供应商。",
                relay_payload(status, result.backup_path),
            )
        }
        Err(error) => {
            let status = codex_plus_core::relay_config::relay_status_from_home(&home);
            log_relay_apply_result(
                "manager.apply_pure_api_injection.failed",
                &relay,
                &status,
                None,
                Some(error.to_string()),
            );
            failed(
                &format!("写入纯 API 模式失败：{error}"),
                relay_payload(status, None),
            )
        }
    }
}

#[tauri::command]
pub fn clear_relay_injection() -> CommandResult<RelayPayload> {
    let home = codex_plus_core::relay_config::default_codex_home_dir();
    let Ok(_guard) = relay_switch_mutex().lock() else {
        let status = codex_plus_core::relay_config::relay_status_from_home(&home);
        return failed(
            "供应商切换锁已损坏，请重启管理器后再试。",
            relay_payload(status, None),
        );
    };
    let settings = SettingsStore::default().load().unwrap_or_default();
    let relay = settings.active_relay_profile();
    log_manager_event("manager.clear_relay_injection.start", json!({}));
    prepare_codex_app_state_before_provider_switch(&home, "manager.clear_relay_injection.before");
    let auth_contents = (relay.relay_mode == codex_plus_core::settings::RelayMode::Official
        && !relay.official_mix_api_key
        && !relay.auth_contents.trim().is_empty())
    .then_some(relay.auth_contents.as_str());
    match codex_plus_core::relay_config::clear_relay_config_to_home_with_auth(&home, auth_contents)
    {
        Ok(result) => {
            finish_codex_app_state_after_provider_switch(
                &home,
                "manager.clear_relay_injection.after",
            );
            let status = codex_plus_core::relay_config::relay_status_from_home(&home);
            log_manager_event(
                "manager.clear_relay_injection.ok",
                json!({
                    "configured": status.configured,
                    "backupPath": result.backup_path.as_ref()
                }),
            );
            ok(
                "已清除 custom 中转 API 模式，并切换到官方 ChatGPT 登录模式。",
                relay_payload(status, result.backup_path),
            )
        }
        Err(error) => {
            let status = codex_plus_core::relay_config::relay_status_from_home(&home);
            log_manager_event(
                "manager.clear_relay_injection.failed",
                json!({
                    "configured": status.configured,
                    "error": error.to_string()
                }),
            );
            failed(
                &format!("清除中转配置失败：{error}"),
                relay_payload(status, None),
            )
        }
    }
}

fn prepare_codex_app_state_before_provider_switch(home: &Path, source: &str) {
    codex_plus_core::codex_app_state::capture_app_state_snapshot_nonfatal(home, source);
}

fn finish_codex_app_state_after_provider_switch(home: &Path, source: &str) {
    codex_plus_core::codex_app_state::sync_app_state_after_provider_switch_nonfatal(home, source);
}

fn relay_has_complete_files(relay: &codex_plus_core::settings::RelayProfile) -> bool {
    if relay.relay_mode == codex_plus_core::settings::RelayMode::Official
        && relay.official_mix_api_key
    {
        return !relay.config_contents.trim().is_empty();
    }
    !relay.config_contents.trim().is_empty() && !relay.auth_contents.trim().is_empty()
}

fn log_relay_apply_request(
    event: &str,
    settings: &BackendSettings,
    relay: &codex_plus_core::settings::RelayProfile,
) {
    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
        event,
        json!({
            "activeRelayId": settings.active_relay_id,
            "relayId": relay.id,
            "relayName": relay.name,
            "relayMode": relay.relay_mode,
            "protocol": relay.protocol,
            "baseUrl": relay.base_url,
            "hasConfigContents": !relay.config_contents.trim().is_empty(),
            "hasAuthContents": !relay.auth_contents.trim().is_empty(),
            "configContainsProxy": relay.config_contents.contains("127.0.0.1:57321")
        }),
    );
}

fn log_relay_apply_result(
    event: &str,
    relay: &codex_plus_core::settings::RelayProfile,
    status: &codex_plus_core::relay_config::RelayStatus,
    backup_path: Option<&String>,
    error: Option<String>,
) {
    log_manager_event(
        event,
        json!({
            "relayId": relay.id,
            "relayName": relay.name,
            "relayMode": relay.relay_mode,
            "protocol": relay.protocol,
            "configured": status.configured,
            "requiresOpenaiAuth": status.requires_openai_auth,
            "hasBearerToken": status.has_bearer_token,
            "backupPath": backup_path,
            "error": error
        }),
    );
}

fn log_manager_event(event: &str, detail: Value) {
    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(event, detail);
}

fn sanitize_manager_event(event: &str) -> String {
    let suffix = event
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '.') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    let suffix = suffix.trim_matches(['.', '_', '-']).trim();
    if suffix.is_empty() {
        "manager.ui.event".to_string()
    } else if suffix.starts_with("manager.") {
        suffix.to_string()
    } else {
        format!("manager.ui.{suffix}")
    }
}

fn relay_payload(
    status: codex_plus_core::relay_config::RelayStatus,
    backup_path: Option<String>,
) -> RelayPayload {
    RelayPayload {
        authenticated: status.authenticated,
        auth_source: status.auth_source,
        account_label: status.account_label,
        config_path: status.config_path,
        configured: status.configured,
        requires_openai_auth: status.requires_openai_auth,
        has_bearer_token: status.has_bearer_token,
        backup_path,
    }
}

fn relay_switch_payload(
    settings: BackendSettings,
    status: codex_plus_core::relay_config::RelayStatus,
    backup_path: Option<String>,
) -> RelaySwitchPayload {
    RelaySwitchPayload {
        settings,
        relay: relay_payload(status, backup_path),
        settings_path: codex_plus_core::paths::default_settings_path()
            .to_string_lossy()
            .to_string(),
    }
}

fn relay_switch_mutex() -> &'static Mutex<()> {
    static RELAY_SWITCH_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    RELAY_SWITCH_LOCK.get_or_init(|| Mutex::new(()))
}

fn empty_context_entries() -> codex_plus_core::relay_config::CodexContextEntries {
    codex_plus_core::relay_config::CodexContextEntries {
        mcp_servers: Vec::new(),
        skills: Vec::new(),
        plugins: Vec::new(),
    }
}

fn relay_files_payload_from_home(home: &std::path::Path) -> anyhow::Result<RelayFilesPayload> {
    let config_path = home.join("config.toml");
    let auth_path = home.join("auth.json");
    Ok(RelayFilesPayload {
        config_path: config_path.to_string_lossy().to_string(),
        auth_path: auth_path.to_string_lossy().to_string(),
        config_contents: read_optional_text_file(&config_path)?,
        auth_contents: read_optional_text_file(&auth_path)?,
    })
}

fn save_relay_file_in_home(
    home: &std::path::Path,
    kind: &str,
    contents: &str,
) -> anyhow::Result<()> {
    let path = match kind {
        "config" => home.join("config.toml"),
        "auth" => home.join("auth.json"),
        other => anyhow::bail!("未知配置文件类型：{other}"),
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // 与供应商切换同一写法：原子替换，避免运行中的 Codex 读到半截文件（#2621）。
    codex_plus_core::settings::atomic_write(&path, contents.as_bytes())?;
    Ok(())
}

fn prepare_relay_file_contents(
    kind: &str,
    contents: &str,
    profile: &RelayProfile,
) -> anyhow::Result<String> {
    if kind == "config" {
        return codex_plus_core::relay_config::apply_deepseek_responses_compatibility(
            profile, contents,
        );
    }
    Ok(contents.to_string())
}

fn read_optional_text_file(path: &std::path::Path) -> anyhow::Result<String> {
    match std::fs::read_to_string(path) {
        Ok(contents) => Ok(contents),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(error.into()),
    }
}

fn open_url(url: &str) -> anyhow::Result<()> {
    #[cfg(windows)]
    {
        codex_plus_core::windows_open_url(url)
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|error| anyhow::anyhow!("启动系统浏览器失败：{error}"))
    }
}

fn settings_payload(message: &str, failure_context: &str) -> CommandResult<SettingsPayload> {
    match settings_payload_value() {
        Ok(payload) => ok(message, payload),
        Err((error, payload)) => failed(&format!("{failure_context}：{error}"), payload),
    }
}

fn settings_payload_value() -> Result<SettingsPayload, (anyhow::Error, SettingsPayload)> {
    let store = SettingsStore::default();
    let settings_path = codex_plus_core::paths::default_settings_path()
        .to_string_lossy()
        .to_string();
    match store.load() {
        Ok(settings) => Ok(SettingsPayload {
            revision: settings.settings_revision.clone(),
            settings,
            settings_path,
        }),
        Err(error) => Err((
            error,
            SettingsPayload {
                revision: String::new(),
                settings: BackendSettings::default(),
                settings_path,
            },
        )),
    }
}

fn fallback_settings_payload() -> SettingsPayload {
    SettingsPayload {
        revision: SettingsStore::default().revision().unwrap_or_default(),
        settings: SettingsStore::default().load().unwrap_or_default(),
        settings_path: codex_plus_core::paths::default_settings_path()
            .to_string_lossy()
            .to_string(),
    }
}

fn load_overview_payload() -> (
    Option<PathBuf>,
    install::EntryPointState,
    Option<LaunchStatus>,
    crate::runtime_health::RuntimeHealth,
) {
    let settings = SettingsStore::default().load().unwrap_or_default();
    let latest = StatusStore::default().load_latest().unwrap_or(None);
    let runtime_health = crate::runtime_health::inspect(&settings, latest.as_ref());
    (
        codex_plus_core::app_paths::resolve_codex_app_dir_with_saved(
            None,
            Some(settings.codex_app_path.as_str()),
        ),
        install::inspect_entrypoints(),
        latest,
        runtime_health,
    )
}

fn install_background_failure(action: &str, error: impl std::fmt::Display) -> InstallActionResult {
    let state = install::inspect_entrypoints();
    InstallActionResult {
        status: "failed".to_string(),
        message: format!("{action}后台任务失败：{error}"),
        silent_shortcut: state.silent_shortcut,
        management_shortcut: state.management_shortcut,
    }
}

fn watcher_payload() -> WatcherPayload {
    let flag = codex_plus_core::watcher::default_watcher_disabled_flag();
    WatcherPayload {
        enabled: codex_plus_core::watcher::watcher_is_installed() && !flag.exists(),
        disabled_flag: flag.to_string_lossy().to_string(),
        start_minimized: codex_plus_core::watcher::watcher_start_minimized(),
        start_codex: codex_plus_core::watcher::watcher_start_codex(),
        start_codex_on_open: codex_plus_core::watcher::watcher_start_codex_on_open(),
    }
}

fn path_state(path: Option<PathBuf>) -> PathState {
    match path {
        Some(path) => PathState {
            status: "found".to_string(),
            path: Some(path.to_string_lossy().to_string()),
        },
        None => PathState {
            status: "missing".to_string(),
            path: None,
        },
    }
}

fn shortcut_state(shortcut: install::ShortcutState) -> PathState {
    PathState {
        status: if shortcut.installed {
            "installed".to_string()
        } else {
            "missing".to_string()
        },
        path: shortcut.path,
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestVlmRequest {
    pub api_key: String,
    pub model: String,
    pub base_url: String,
    pub image_data_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestVlmResult {
    pub vlm_status: String,
    pub http_code: Option<u16>,
    pub duration_ms: u64,
    pub error: Option<String>,
    pub description: Option<String>,
    pub model: String,
    pub raw_request: Option<String>,
    pub raw_response: Option<String>,
}

/// 用表单当前 VLM 配置 + 用户上传图片（data URL）测试 VLM 可用性。
/// 用表单当前值（未保存亦可）；失败也返回结构化 payload 供前端渲染诊断。
#[tauri::command]
pub async fn test_vlm(request: TestVlmRequest) -> CommandResult<TestVlmResult> {
    // 加固 spec §4.1 第二道门：前端校验可被绕过（IPC 直调），类型与大小在
    // 信任边界重新校验；非法输入不发起网络请求。
    if let Err(reason) = codex_plus_core::vision::validate_image_data_url(&request.image_data_url) {
        return failed(
            "VLM 测试失败：invalid_image",
            TestVlmResult {
                vlm_status: "invalid_image".to_string(),
                http_code: None,
                duration_ms: 0,
                error: Some(reason),
                description: None,
                model: request.model,
                raw_request: None,
                raw_response: None,
            },
        );
    }
    let config = codex_plus_core::vision::VlmConfig {
        api_key: request.api_key,
        model: request.model.clone(),
        base_url: request.base_url,
    };
    let client = match codex_plus_core::http_client::vlm_http_client() {
        Ok(c) => c,
        Err(e) => {
            return failed(
                &format!("VLM HTTP 客户端构建失败：{e}"),
                TestVlmResult {
                    vlm_status: "client_error".to_string(),
                    http_code: None,
                    duration_ms: 0,
                    // 加固 spec §4.2：client_error 路径同样过脱敏，全仓库一条规则
                    error: Some(codex_plus_core::vision::redact_secrets(
                        &e.to_string(),
                        &config.api_key,
                    )),
                    description: None,
                    model: request.model,
                    raw_request: None,
                    raw_response: None,
                },
            );
        }
    };
    let outcome =
        codex_plus_core::vision::test_vlm_once(&config, &request.image_data_url, &client).await;
    let result = TestVlmResult {
        vlm_status: outcome.status.clone(),
        http_code: outcome.http_code,
        duration_ms: outcome.duration_ms,
        error: outcome.error,
        description: outcome.text,
        model: request.model,
        raw_request: outcome.raw_request,
        raw_response: outcome.raw_response,
    };
    if outcome.status == "ok" {
        ok("VLM 测试成功。", result)
    } else {
        failed(&format!("VLM 测试失败：{}", outcome.status), result)
    }
}

fn ok<T: Serialize>(message: &str, payload: T) -> CommandResult<T> {
    CommandResult {
        status: "ok".to_string(),
        message: message.to_string(),
        payload,
    }
}

fn failed<T: Serialize>(message: &str, payload: T) -> CommandResult<T> {
    CommandResult {
        status: "failed".to_string(),
        message: message.to_string(),
        payload,
    }
}

/// 「功能降级但流程可继续」：与 `failed` 区分开，让调用方能继续走后面的步骤，
/// 同时仍然把原因提示给用户（issue #618 的回填跳过即属此列）。
fn degraded<T: Serialize>(message: &str, payload: T) -> CommandResult<T> {
    CommandResult {
        status: "degraded".to_string(),
        message: message.to_string(),
        payload,
    }
}

// Hold ownership across stop and config sync, then release before the successor starts.
fn ensure_provider_sync_is_idle_before_stop()
-> Result<codex_plus_data::ProviderSyncLifecycleGuard, String> {
    codex_plus_data::try_acquire_provider_sync_lifecycle_guard(None)
        .map_err(|error| format!("历史会话同步正在进行或锁不可用，未执行重启；请稍后重试：{error}"))
}

fn default_debug_port() -> u16 {
    9229
}

fn default_helper_port() -> u16 {
    57321
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skills_payload_hides_disabled_repository_catalog() {
        let temp = tempfile::tempdir().unwrap();
        let manager = codex_plus_core::skills::SkillsManager::new(
            temp.path().join("skills"), temp.path().join("backups"),
            temp.path().join("skills.json"), temp.path().join("home"),
        );
        let mut repo = codex_plus_core::skills::parse_repo_key("acme/kit@main").unwrap();
        let remote = vec![codex_plus_core::skills::RemoteSkill {
            id: "alpha".to_string(), name: "alpha".to_string(), description: String::new(),
            repo_key: repo.key(), repo_path: "alpha".to_string(), content_hash: "v1".to_string(),
        }];
        manager.upsert_repo(repo.clone()).unwrap();
        assert_eq!(skills_payload(&manager, &remote, Vec::new()).skills.len(), 1);
        repo.enabled = false;
        manager.upsert_repo(repo).unwrap();
        assert!(skills_payload(&manager, &remote, Vec::new()).skills.is_empty());
    }

    /// 进程级全局状态的测试锁。
    ///
    /// `CODEX_HOME` 与 `paths::set_settings_path_for_tests` 在线程间共享。
    /// 修改这些状态的测试必须先持锁，避免并行测试互相覆盖。
    static GLOBAL_STATE_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn lock_codex_home_for_test() -> std::sync::MutexGuard<'static, ()> {
        GLOBAL_STATE_TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    #[test]
    fn requested_launch_status_identifies_the_current_request() {
        let request = LaunchRequest {
            app_path: "C:/Program Files/Codex".to_string(),
            debug_port: 9333,
            helper_port: 57322,
            sync_active_relay: false,
        };

        let status = requested_launch_status(&request, "starting", "starting", 12345);

        assert_eq!(status.status, "starting");
        assert_eq!(status.message, "starting");
        assert_eq!(status.started_at_ms, 12345);
        assert_eq!(status.debug_port, Some(9333));
        assert_eq!(status.helper_port, Some(57322));
        assert_eq!(status.codex_app.as_deref(), Some("C:/Program Files/Codex"));
    }

    #[test]
    fn repeated_activation_returns_the_current_session_identity_and_actual_ports() {
        let request = launch_request(false);
        let current = LaunchStatus {
            status: "running".into(),
            started_at_ms: 123,
            debug_port: Some(9333),
            helper_port: Some(57322),
            ..LaunchStatus::default()
        };
        assert_eq!(
            launch_identity_from_status(&request, 456, Some(&current)),
            (9333, 57322, 123)
        );
        let starting = LaunchStatus {
            status: "starting".into(),
            ..current
        };
        assert_eq!(
            launch_identity_from_status(&request, 456, Some(&starting)),
            (request.debug_port, request.helper_port, 456)
        );
    }

    #[test]
    fn requested_launch_status_omits_an_unresolved_app_path() {
        let request = LaunchRequest {
            app_path: "  ".to_string(),
            debug_port: 9229,
            helper_port: 57321,
            sync_active_relay: false,
        };

        let status = requested_launch_status(&request, "starting", "starting", 1);

        assert_eq!(status.codex_app, None);
    }

    /// issue #2403：停止阶段要给出可判断的中间态（phase + progress），
    /// 否则十几秒的阻塞等待在界面上和「卡死」无法区分。
    #[test]
    fn stopping_status_carries_phase_and_progress() {
        let request = launch_request(false);

        let status = requested_launch_status_with_phase(
            &request,
            "stopping",
            "正在停止旧实例",
            12345,
            "restart_stopping",
            10,
        );

        assert_eq!(status.status, "stopping");
        assert_eq!(status.phase.as_deref(), Some("restart_stopping"));
        assert_eq!(status.progress, Some(10));
        // 中间态仍要带上请求标识，供「最近启动」判断是否属于本次重启。
        assert_eq!(status.started_at_ms, 12345);
        assert_eq!(status.debug_port, Some(request.debug_port));
        assert_eq!(status.helper_port, Some(request.helper_port));
    }

    /// 进度百分比必须收敛到 0~100，越界值不能写进状态文件。
    #[test]
    fn stopping_status_clamps_progress() {
        let request = launch_request(false);

        let status =
            requested_launch_status_with_phase(&request, "stopping", "msg", 1, "phase", 250);

        assert_eq!(status.progress, Some(100));
    }

    /// 普通启动状态不带阶段信息，保持既有行为（进度字段为 None）。
    #[test]
    fn plain_launch_status_has_no_phase() {
        let status = requested_launch_status(&launch_request(false), "starting", "starting", 1);

        assert_eq!(status.phase, None);
        assert_eq!(status.progress, None);
    }

    /// issue #618：live config.toml 有语法错误时必须被判成「可降级」，而不是让
    /// 整条供应商切换流程失败。缺失文件等同于空文件，同样不阻断。
    #[test]
    fn live_config_backfill_blocking_error_only_flags_unparseable_toml() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path();

        // 文件不存在（全新安装）→ 不阻断。
        assert_eq!(live_config_backfill_blocking_error(home), None);

        // 空文件 / 只有空白 → 不阻断。
        std::fs::write(home.join("config.toml"), "  \n").unwrap();
        assert_eq!(live_config_backfill_blocking_error(home), None);

        // 正常 TOML → 不阻断。
        std::fs::write(
            home.join("config.toml"),
            "model_provider = \"custom\"\n\n[model_providers.custom]\nbase_url = \"https://relay.example/v1\"\n",
        )
        .unwrap();
        assert_eq!(live_config_backfill_blocking_error(home), None);

        // 手写坏掉的 TOML（未闭合数组）→ 必须阻断并带上位置信息。
        std::fs::write(
            home.join("config.toml"),
            "model_provider = \"custom\"\nmodel_list = [\"a\", \n",
        )
        .unwrap();
        let error = live_config_backfill_blocking_error(home)
            .expect("unparseable live config must be reported as blocking");
        assert!(!error.is_empty(), "error detail must not be empty");
    }

    /// 重复表头/重复根键属于 core 归一层能修好的形态，预检不能误报成语法错误——
    /// 否则 #618 的降级路径会吃掉本来能成功的回填。
    #[test]
    fn live_config_backfill_blocking_error_tolerates_duplicate_tables_and_root_keys() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(
            temp.path().join("config.toml"),
            "\
model = \"a\"
model = \"b\"

[mcp_servers.node_repl]
command = \"node\"

[mcp_servers.node_repl]
cwd = \"/tmp\"
",
        )
        .unwrap();

        assert_eq!(live_config_backfill_blocking_error(temp.path()), None);
    }

    /// 预检必须与 core 的读取路径同样剥掉 BOM，否则带 BOM 的正常文件会被误判。
    #[test]
    fn live_config_backfill_blocking_error_ignores_utf8_bom() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(
            temp.path().join("config.toml"),
            "\u{feff}model_provider = \"openai\"\n",
        )
        .unwrap();

        assert_eq!(live_config_backfill_blocking_error(temp.path()), None);
    }

    #[test]
    fn provider_switch_state_helpers_restore_only_safe_state() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("codex-home");
        std::fs::create_dir(&home).unwrap();
        let state_path = home.join(".codex-global-state.json");
        std::fs::write(
            &state_path,
            json!({
                "electron-saved-workspace-roots": ["C:/work/app"],
                "thread-writable-roots": {"thread-1": ["C:/work/app"]},
                "electron-persisted-atom-state": {
                    "default-service-tier": "priority",
                    "electron:onboarding-workspace-autolaunch-applied": true,
                    "heartbeat-thread-permissions-by-id": {"thread-1": "do-not-copy"},
                    "prompt-history": ["do-not-copy"]
                },
                "provider-token-cache": "do-not-copy"
            })
            .to_string(),
        )
        .unwrap();

        prepare_codex_app_state_before_provider_switch(&home, "test.before");
        std::fs::write(
            &state_path,
            json!({"electron-saved-workspace-roots": ["D:/fresh/app"]}).to_string(),
        )
        .unwrap();
        finish_codex_app_state_after_provider_switch(&home, "test.after");

        let state: Value =
            serde_json::from_str(&std::fs::read_to_string(&state_path).unwrap()).unwrap();
        assert_eq!(
            state["electron-saved-workspace-roots"],
            json!(["D:\\fresh\\app", "C:\\work\\app"])
        );
        assert_eq!(
            state["thread-writable-roots"]["thread-1"],
            json!(["C:/work/app"])
        );
        assert_eq!(
            state["electron-persisted-atom-state"]["default-service-tier"],
            "priority"
        );
        assert_eq!(
            state["electron-persisted-atom-state"]["electron:onboarding-workspace-autolaunch-applied"],
            true
        );
        assert!(state.get("provider-token-cache").is_none());
        assert!(
            state["electron-persisted-atom-state"]
                .get("heartbeat-thread-permissions-by-id")
                .is_none()
        );
        assert!(
            state["electron-persisted-atom-state"]
                .get("prompt-history")
                .is_none()
        );
    }

    #[test]
    fn backend_version_returns_structured_payload() {
        let result = backend_version();

        assert_eq!(result.status, "ok");
        assert!(!result.payload.version.is_empty());
    }

    fn provider_sync_result_for_test(
        status: codex_plus_data::ProviderSyncStatus,
        message: &str,
    ) -> codex_plus_data::ProviderSyncResult {
        codex_plus_data::ProviderSyncResult {
            status,
            message: message.to_string(),
            target_provider: "custom".to_string(),
            backup_dir: None,
            changed_session_files: 0,
            skipped_locked_rollout_files: Vec::new(),
            sqlite_rows_updated: 0,
            sqlite_provider_rows_updated: 0,
            sqlite_user_event_rows_updated: 0,
            sqlite_cwd_rows_updated: 0,
            sqlite_catalog_rows_inserted: 0,
            sqlite_catalog_rows_removed: 0,
            updated_workspace_roots: 0,
            encrypted_content_warning: None,
            repair_audit: codex_plus_data::ProviderSyncAudit::default(),
            recovery_journal_path: None,
            recovery_errors: Vec::new(),
            database_outcomes: Vec::new(),
        }
    }

    #[test]
    fn partial_provider_sync_exposes_residual_counts_and_recovery_path() {
        let mut sync = provider_sync_result_for_test(codex_plus_data::ProviderSyncStatus::PartialFailure, "concurrent update preserved");
        sync.backup_dir = Some(PathBuf::from("/artificial/operation-1"));
        sync.recovery_journal_path = Some(PathBuf::from("/artificial/operation-1/recovery-journal.json"));
        sync.sqlite_rows_updated = 3;
        sync.recovery_errors = vec!["人工冲突".into()];
        let result = provider_sync_command_result(sync);
        assert_eq!(result.status, "failed");
        assert!(result.message.contains("部分失败"));
        assert_eq!(result.payload["sqliteRowsUpdated"], 3);
        assert_eq!(result.payload["operationId"], "operation-1");
        assert_eq!(result.payload["recoveryJournalPath"], "/artificial/operation-1/recovery-journal.json");
    }

    #[test]
    fn manager_stale_save_returns_latest_snapshot_without_overwriting_patch() {
        let _guard = lock_codex_home_for_test();
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("settings.json");
        let previous = codex_plus_core::paths::set_settings_path_for_tests(Some(path));
        let store = SettingsStore::default();
        store.save(&BackendSettings { enhancements_enabled: false, ..BackendSettings::default() }).unwrap();
        let stale = store.load().unwrap();
        let revision = stale.settings_revision.clone();
        store.update(json!({"providerSyncEnabled":true})).unwrap();
        let current_revision = store.revision().unwrap();
        let result = save_settings(stale, Some(revision));
        codex_plus_core::paths::set_settings_path_for_tests(previous);
        assert_eq!(result.status, "failed");
        assert!(result.message.contains("revision_conflict"));
        assert!(result.payload.settings.provider_sync_enabled);
        assert_eq!(result.payload.revision, current_revision);
    }

    #[test]
    fn provider_sync_success_reports_backup_directory_when_something_changed() {
        let mut sync = provider_sync_result_for_test(
            codex_plus_data::ProviderSyncStatus::Synced,
            "Provider sync complete",
        );
        sync.changed_session_files = 3;
        sync.backup_dir = Some(std::path::PathBuf::from("/tmp/backups/provider-sync/run-1"));

        let result = provider_sync_command_result(sync);

        assert_eq!(result.status, "ok");
        assert!(
            result.message.contains("/tmp/backups/provider-sync/run-1"),
            "有改动时应告知备份目录：{}",
            result.message
        );
    }

    /// 什么都没改的时候不该多出一行备份目录，避免噪音。
    #[test]
    fn provider_sync_success_omits_backup_hint_without_changes() {
        let sync = provider_sync_result_for_test(
            codex_plus_data::ProviderSyncStatus::Synced,
            "Provider sync already up to date",
        );

        let result = provider_sync_command_result(sync);

        assert_eq!(result.status, "ok");
        assert!(
            !result.message.contains("备份目录："),
            "无改动时不该提示备份目录：{}",
            result.message
        );
    }

    #[test]
    fn provider_sync_skipped_is_reported_as_command_failure() {
        let result = provider_sync_command_result(provider_sync_result_for_test(
            codex_plus_data::ProviderSyncStatus::Skipped,
            "Provider sync lock exists",
        ));

        assert_eq!(result.status, "failed");
        assert!(result.message.contains("Provider sync lock exists"));
        assert_eq!(result.payload["syncStatus"], "skipped");
    }

    #[test]
    fn provider_sync_preflight_failure_is_structured_as_skipped() {
        let result = provider_sync_preflight_failure("target is not resolvable");

        assert_eq!(result.status, "failed");
        assert_eq!(result.payload["syncStatus"], "skipped");
        assert_eq!(result.payload["targetProvider"], "");
        assert_eq!(result.payload["syncMessage"], "target is not resolvable");
    }

    #[test]
    fn manual_provider_sync_targets_keep_unresolvable_history_visible() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(
            temp.path().join("config.toml"),
            r#"model_provider = "relay-live"

[model_providers.relay-live]
base_url = "https://example.invalid/v1"
"#,
        )
        .unwrap();
        let mut settings = BackendSettings::default();
        settings.provider_sync_manual_providers =
            vec!["relay-live".to_string(), "relay-history".to_string()];
        let manual = settings.provider_sync_manual_providers.clone();
        let mut targets = codex_plus_data::ProviderSyncTargetList {
            current_provider: "relay-live".to_string(),
            targets: Vec::new(),
        };

        merge_manual_provider_sync_targets(&mut targets, &manual, &settings, Some(temp.path()));

        let live = targets
            .targets
            .iter()
            .find(|target| target.id == "relay-live")
            .unwrap();
        assert!(live.is_resolvable);
        assert!(live.unavailable_reason.is_none());
        let history = targets
            .targets
            .iter()
            .find(|target| target.id == "relay-history")
            .unwrap();
        assert!(!history.is_resolvable);
        assert!(history.unavailable_reason.is_some());
    }

    #[test]
    fn provider_sync_synced_is_reported_as_command_success() {
        let result = provider_sync_command_result(provider_sync_result_for_test(
            codex_plus_data::ProviderSyncStatus::Synced,
            "Provider sync complete",
        ));

        assert_eq!(result.status, "ok");
        assert_eq!(result.payload["syncStatus"], "synced");
    }

    #[test]
    fn restart_absent_app_uses_launch_but_explicit_sync_still_restarts() {
        assert_eq!(
            restart_disposition(false, false),
            RestartDisposition::LaunchOnly
        );
        for (sync, running) in [(true, false), (false, true), (true, true)] {
            assert_eq!(
                restart_disposition(sync, running),
                RestartDisposition::StopAndRestart
            );
        }
    }

    #[test]
    fn restart_and_launch_share_a_single_flight_guard() {
        let first = try_acquire_launch_guard().unwrap();
        assert!(try_acquire_launch_guard().is_err());
        drop(first);
        assert!(try_acquire_launch_guard().is_ok());
    }

    #[test]
    fn restart_provider_guard_is_held_until_spawn_and_released_first() {
        let temp = tempfile::tempdir().unwrap();
        let guard =
            codex_plus_data::try_acquire_provider_sync_lifecycle_guard(Some(temp.path())).unwrap();
        assert!(
            codex_plus_data::try_acquire_provider_sync_lifecycle_guard(Some(temp.path())).is_err()
        );
        let spawned = std::cell::Cell::new(false);
        spawn_after_provider_guard_release(guard, &launch_request(false), |_| {
            let next =
                codex_plus_data::try_acquire_provider_sync_lifecycle_guard(Some(temp.path()))?;
            next.release()?;
            spawned.set(true);
            Ok(())
        })
        .unwrap();
        assert!(spawned.get());
    }

    #[test]
    fn restart_provider_guard_release_failure_blocks_spawn() {
        let temp = tempfile::tempdir().unwrap();
        let guard =
            codex_plus_data::try_acquire_provider_sync_lifecycle_guard(Some(temp.path())).unwrap();
        fs::write(
            temp.path().join("tmp/provider-sync.lock/owner.json"),
            json!({"pid": std::process::id(), "startedAt":1, "lockId":"replacement"}).to_string(),
        )
        .unwrap();
        let spawned = std::cell::Cell::new(false);
        assert!(
            spawn_after_provider_guard_release(guard, &launch_request(false), |_| {
                spawned.set(true);
                Ok(())
            })
            .is_err()
        );
        assert!(!spawned.get());
    }

    #[test]
    fn overview_contains_expected_operational_fields() {
        let result = tauri::async_runtime::block_on(load_overview());

        assert_eq!(result.status, "ok");
        assert!(!result.payload.current_version.is_empty());
        assert!(
            result.payload.codex_version.is_none()
                || result
                    .payload
                    .codex_version
                    .as_deref()
                    .is_some_and(|version| !version.is_empty())
        );
        assert!(matches!(
            result.payload.codex_app.status.as_str(),
            "found" | "missing"
        ));
        assert!(matches!(
            result.payload.silent_shortcut.status.as_str(),
            "installed" | "missing"
        ));
    }

    #[test]
    fn watcher_state_returns_disabled_flag_path() {
        let result = load_watcher_state();

        assert_eq!(result.status, "ok");
        assert!(result.payload.disabled_flag.contains("watcher.disabled"));
    }

    #[test]
    fn tray_menu_only_has_show_and_quit_in_chinese() {
        let source =
            std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs")).unwrap();

        assert!(source.contains("Menu::with_items(app, &[&show_item, &quit_item])"));
        assert!(source.contains("\"显示主窗口\""));
        assert!(source.contains("\"退出程序\""));
        assert!(!source.contains("update_tray_labels"));
        assert!(!source.contains("tray_apply_dream_skin"));
        assert!(!source.contains("apply_dream_skin_from_tray"));
    }

    #[test]
    fn relay_payload_does_not_expose_token_text() {
        let payload = relay_payload(
            codex_plus_core::relay_config::RelayStatus {
                authenticated: true,
                auth_source: "registry.json".to_string(),
                account_label: Some("user@example.test".to_string()),
                config_path: "config.toml".to_string(),
                configured: true,
                requires_openai_auth: true,
                has_bearer_token: true,
            },
            None,
        );
        let text = serde_json::to_string(&payload).unwrap();

        assert!(!text.contains("sk-"));
        assert!(text.contains("hasBearerToken"));
    }

    #[test]
    fn provider_doctor_recommendation_prioritizes_actionable_failures() {
        let recommendation = provider_doctor_recommendation(&[
            ProviderDoctorCheck {
                id: "models".to_string(),
                title: "模型列表".to_string(),
                status: "failed".to_string(),
                detail: "上游不支持 /v1/models".to_string(),
            },
            ProviderDoctorCheck {
                id: "request".to_string(),
                title: "真实请求".to_string(),
                status: "failed".to_string(),
                detail: "HTTP 404".to_string(),
            },
        ]);

        assert!(recommendation.contains("/v1/models"));
    }

    #[test]
    fn provider_doctor_recommendation_reports_model_warning() {
        let recommendation = provider_doctor_recommendation(&[
            ProviderDoctorCheck {
                id: "config".to_string(),
                title: "配置完整性".to_string(),
                status: "ok".to_string(),
                detail: "https://example.test/v1 / Responses API".to_string(),
            },
            ProviderDoctorCheck {
                id: "models".to_string(),
                title: "模型列表".to_string(),
                status: "warning".to_string(),
                detail: "未看到测试模型".to_string(),
            },
            ProviderDoctorCheck {
                id: "request".to_string(),
                title: "真实请求".to_string(),
                status: "ok".to_string(),
                detail: "HTTP 200".to_string(),
            },
        ]);

        assert!(recommendation.contains("测试模型"));
    }

    #[test]
    fn aggregate_relay_injection_writes_local_proxy_without_chatgpt_auth() {
        let _guard = lock_codex_home_for_test();
        let temp = tempfile::tempdir().unwrap();
        // 只验证旧聚合链路，不读取运行中管理器的真实聚合设置和登录快照。
        // 本地主线的同名单测（e0cb49cd）与远端（eb241dbf）做的是同一件事，
        // 这里采用远端版本：额外写入一份默认 settings.json，隔离更彻底。
        let settings_path = temp.path().join("settings.json");
        std::fs::write(&settings_path, serde_json::to_vec(&BackendSettings::default()).unwrap()).unwrap();
        let previous = codex_plus_core::paths::set_settings_path_for_tests(Some(settings_path));

        let result = apply_aggregate_relay_injection_to_home(
            temp.path(),
            codex_plus_core::settings::RelaySessionProvider::Custom,
        );
        codex_plus_core::paths::set_settings_path_for_tests(previous);
        let config = std::fs::read_to_string(temp.path().join("config.toml")).unwrap();

        assert_eq!(result.status, "ok");
        assert!(result.payload.configured);
        assert!(!result.payload.authenticated);
        assert!(config.contains(r#"base_url = "http://127.0.0.1:57321/v1""#));
        assert!(config.contains(r#"experimental_bearer_token = "codex-plus-aggregate""#));
    }

    fn launch_request(sync_active_relay: bool) -> LaunchRequest {
        LaunchRequest {
            app_path: String::new(),
            debug_port: 9229,
            helper_port: 57321,
            sync_active_relay,
        }
    }

    fn routed_pure_api_settings() -> BackendSettings {
        BackendSettings {
            active_relay_id: "source".to_string(),
            relay_profiles: vec![RelayProfile {
                id: "source".to_string(),
                name: "Source".to_string(),
                base_url: "https://source.example/v1".to_string(),
                upstream_base_url: "https://source.example/v1".to_string(),
                api_key: "sk-source".to_string(),
                protocol: codex_plus_core::settings::RelayProtocol::Responses,
                relay_mode: codex_plus_core::settings::RelayMode::PureApi,
                config_contents: "model_provider = \"custom\"\n\n[model_providers.custom]\nname = \"custom\"\nwire_api = \"responses\"\nbase_url = \"https://source.example/v1\"\n"
                    .to_string(),
                auth_contents: "{\"OPENAI_API_KEY\":\"sk-source\"}\n".to_string(),
                model_routes: vec![codex_plus_core::settings::RelayModelRoute {
                    model: "gpt-5.6-luna".to_string(),
                    target_relay_id: "target".to_string(),
                    target_model: String::new(),
                }],
                ..RelayProfile::default()
            }],
            ..BackendSettings::default()
        }
    }

    #[test]
    fn launch_request_defaults_active_relay_sync_to_false() {
        let request: LaunchRequest = serde_json::from_value(json!({})).unwrap();
        let requested: LaunchRequest =
            serde_json::from_value(json!({ "syncActiveRelay": true })).unwrap();

        assert!(!request.sync_active_relay);
        assert!(requested.sync_active_relay);
    }

    #[test]
    fn active_routed_pure_api_sync_writes_local_proxy() {
        let temp = tempfile::tempdir().unwrap();

        sync_active_relay_to_home(&routed_pure_api_settings(), temp.path()).unwrap();

        let config = std::fs::read_to_string(temp.path().join("config.toml")).unwrap();
        assert!(config.contains(r#"base_url = "http://127.0.0.1:57321/v1""#));
        assert!(!config.contains(r#"base_url = "https://source.example/v1""#));
    }

    #[test]
    fn active_official_sync_clears_custom_provider_selection() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(
            temp.path().join("config.toml"),
            "model_provider = \"custom\"\n\n[model_providers.custom]\nbase_url = \"https://old.example/v1\"\n",
        )
        .unwrap();
        std::fs::write(
            temp.path().join("auth.json"),
            "{\"OPENAI_API_KEY\":\"sk-old\",\"auth_mode\":\"chatgpt\"}\n",
        )
        .unwrap();
        let settings = BackendSettings {
            active_relay_id: "official".to_string(),
            relay_profiles: vec![RelayProfile {
                id: "official".to_string(),
                relay_mode: codex_plus_core::settings::RelayMode::Official,
                official_mix_api_key: false,
                ..RelayProfile::default()
            }],
            ..BackendSettings::default()
        };

        sync_active_relay_to_home(&settings, temp.path()).unwrap();

        let config = std::fs::read_to_string(temp.path().join("config.toml")).unwrap();
        let parsed = config.parse::<toml_edit::DocumentMut>().unwrap();
        let auth = std::fs::read_to_string(temp.path().join("auth.json")).unwrap();
        assert!(parsed.get("model_provider").is_none());
        // 切回官方后残留的 base_url 会让请求继续发往中转站（issue #2216），
        // 所以整段中转站 provider 都要清掉，而不是只清掉「选择」。
        assert!(
            parsed
                .get("model_providers")
                .and_then(|providers| providers.get("custom"))
                .is_none(),
            "leftover relay provider must be removed: {config}"
        );
        assert!(!config.contains("old.example/v1"));
        assert!(!auth.contains("OPENAI_API_KEY"));
        assert!(auth.contains("auth_mode"));
    }

    #[test]
    fn active_aggregate_sync_writes_local_proxy() {
        let temp = tempfile::tempdir().unwrap();
        let settings = BackendSettings {
            active_relay_id: "aggregate".to_string(),
            active_aggregate_relay_id: "aggregate".to_string(),
            relay_profiles: vec![RelayProfile {
                id: "aggregate".to_string(),
                relay_mode: codex_plus_core::settings::RelayMode::Aggregate,
                ..RelayProfile::default()
            }],
            aggregate_relay_profiles: vec![codex_plus_core::settings::AggregateRelayProfile {
                id: "aggregate".to_string(),
                name: "Aggregate".to_string(),
                session_provider: codex_plus_core::settings::RelaySessionProvider::Custom,
                model_aggregation_enabled: false,
                strategy: codex_plus_core::settings::AggregateRelayStrategy::Failover,
                members: Vec::new(),
                routes: Vec::new(),
                default_relay_id: String::new(),
                sync_default_member_login: false,
            }],
            ..BackendSettings::default()
        };

        sync_active_relay_to_home(&settings, temp.path()).unwrap();

        let config = std::fs::read_to_string(temp.path().join("config.toml")).unwrap();
        assert!(config.contains(r#"base_url = "http://127.0.0.1:57321/v1""#));
        assert!(config.contains(r#"experimental_bearer_token = "codex-plus-aggregate""#));
    }

    #[test]
    /// 回归（issue #1604）：用户点「重启 Codex」走的就是这条同步路径。
    /// 现场遗留的 0 字节 auth.json 必须被修复成合法 JSON，否则仍然停在登录页。
    fn active_aggregate_sync_repairs_empty_auth_json() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join("auth.json"), "").unwrap();
        let settings = BackendSettings {
            active_relay_id: "aggregate".to_string(),
            active_aggregate_relay_id: "aggregate".to_string(),
            relay_profiles: vec![RelayProfile {
                id: "aggregate".to_string(),
                relay_mode: codex_plus_core::settings::RelayMode::Aggregate,
                ..RelayProfile::default()
            }],
            aggregate_relay_profiles: vec![codex_plus_core::settings::AggregateRelayProfile {
                id: "aggregate".to_string(),
                name: "Aggregate".to_string(),
                session_provider: codex_plus_core::settings::RelaySessionProvider::Custom,
                model_aggregation_enabled: false,
                strategy: codex_plus_core::settings::AggregateRelayStrategy::Failover,
                members: Vec::new(),
                routes: Vec::new(),
                default_relay_id: String::new(),
                sync_default_member_login: false,
            }],
            ..BackendSettings::default()
        };

        sync_active_relay_to_home(&settings, temp.path()).unwrap();

        let raw = std::fs::read_to_string(temp.path().join("auth.json")).unwrap();
        let auth: serde_json::Value =
            serde_json::from_str(&raw).expect("重启同步后 auth.json 必须是合法 JSON");
        assert_eq!(
            auth.get("OPENAI_API_KEY").and_then(|item| item.as_str()),
            Some("codex-plus-aggregate")
        );
    }

    /// 模型聚合 + `[features] multi_agent_v2` 时，重启同步要带回冲突提示，
    /// 否则跨供应商子代理会在加密任务上静默失败（issue：feature flag 优先于目录）。
    #[test]
    fn model_aggregation_restart_reports_multi_agent_v2_conflict() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(
            temp.path().join("config.toml"),
            "model = \"old\"\n[features]\nmulti_agent_v2 = true\n",
        )
        .unwrap();
        let settings = BackendSettings {
            active_relay_id: "aggregate".to_string(),
            active_aggregate_relay_id: "aggregate".to_string(),
            relay_profiles: vec![
                RelayProfile {
                    id: "deepseek".to_string(),
                    name: "DeepSeek".to_string(),
                    model: "deepseek-chat".to_string(),
                    base_url: "https://deepseek.example/v1".to_string(),
                    api_key: "sk-test-redacted".to_string(),
                    relay_mode: codex_plus_core::settings::RelayMode::PureApi,
                    ..RelayProfile::default()
                },
                RelayProfile {
                    id: "aggregate".to_string(),
                    relay_mode: codex_plus_core::settings::RelayMode::Aggregate,
                    ..RelayProfile::default()
                },
            ],
            aggregate_relay_profiles: vec![codex_plus_core::settings::AggregateRelayProfile {
                id: "aggregate".to_string(),
                name: "Aggregate".to_string(),
                session_provider: codex_plus_core::settings::RelaySessionProvider::Custom,
                model_aggregation_enabled: true,
                strategy: codex_plus_core::settings::AggregateRelayStrategy::Failover,
                members: vec![codex_plus_core::settings::AggregateRelayMember {
                    relay_id: "deepseek".to_string(),
                    weight: 1,
                }],
                routes: Vec::new(),
                default_relay_id: String::new(),
                sync_default_member_login: false,
            }],
            ..BackendSettings::default()
        };

        let warnings = restart_codex_plus_after_stop(
            &launch_request(true),
            temp.path(),
            Some(&settings),
            |_| Ok(()),
        )
        .unwrap();

        assert_eq!(warnings.len(), 1, "{warnings:?}");
        assert!(warnings[0].contains("multi_agent_v2"), "{warnings:?}");
    }

    #[test]
    fn failed_active_relay_sync_does_not_spawn_or_change_live_files() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join("config.toml"), "model = \"old\"\n").unwrap();
        std::fs::write(temp.path().join("auth.json"), "{\"old\":true}\n").unwrap();
        let settings = BackendSettings {
            active_relay_id: "broken".to_string(),
            relay_profiles: vec![RelayProfile {
                id: "broken".to_string(),
                base_url: String::new(),
                api_key: String::new(),
                relay_mode: codex_plus_core::settings::RelayMode::PureApi,
                ..RelayProfile::default()
            }],
            ..BackendSettings::default()
        };
        let spawned = std::cell::Cell::new(false);

        let result = restart_codex_plus_after_stop(
            &launch_request(true),
            temp.path(),
            Some(&settings),
            |_| {
                spawned.set(true);
                Ok(())
            },
        );

        assert!(result.is_err());
        assert!(!spawned.get());
        assert_eq!(
            std::fs::read_to_string(temp.path().join("config.toml")).unwrap(),
            "model = \"old\"\n"
        );
        assert_eq!(
            std::fs::read_to_string(temp.path().join("auth.json")).unwrap(),
            "{\"old\":true}\n"
        );
    }

    #[test]
    fn restart_stops_codex_then_runtime_before_checking_native_cleanup() {
        let events = std::cell::RefCell::new(Vec::new());
        stop_codex_plus_for_restart(
            || {
                events.borrow_mut().push("codex");
                Ok(())
            },
            || {
                events.borrow_mut().push("runtime");
                Ok(())
            },
            || {
                events.borrow_mut().push("cleanup");
                Ok(codex_plus_core::native_browser::NativeBrowserShutdown::Ready)
            },
        )
        .unwrap();
        assert_eq!(*events.borrow(), ["codex", "runtime", "cleanup"]);
    }

    #[test]
    fn restore_failure_is_reported_after_runtime_has_stopped() {
        let stopped = std::cell::Cell::new(false);
        let shutdown = stop_codex_plus_for_restart(
            || Ok(()),
            || {
                stopped.set(true);
                Ok(())
            },
            || Ok(codex_plus_core::native_browser::NativeBrowserShutdown::RestoreFailed),
        )
        .unwrap();
        assert!(stopped.get());
        assert_eq!(
            shutdown,
            codex_plus_core::native_browser::NativeBrowserShutdown::RestoreFailed
        );
    }

    #[test]
    fn restart_stop_errors_name_the_step_that_failed() {
        let browser = restart_stop_failure_message(&RestartStopError::NativeBrowser(
            anyhow::Error::new(codex_plus_core::native_browser::NativeBrowserCleanupStillRunning),
        ));
        let runtime = restart_stop_failure_message(&RestartStopError::Runtime(anyhow::anyhow!(
            "runtime still exiting"
        )));
        assert!(browser.contains("原生浏览器文件仍在恢复"));
        assert!(runtime.contains("后台服务尚未清理完成"));
        assert!(!runtime.contains("原生浏览器文件仍在恢复"));
        let codex = restart_stop_failure_message(&RestartStopError::Codex(anyhow::anyhow!(
            "app remains running"
        )));
        assert!(codex.contains("Codex 进程尚未确认退出"));
        let failed = restart_stop_failure_message(&RestartStopError::NativeBrowser(
            anyhow::anyhow!("Invalid native cleanup receipt"),
        ));
        assert!(failed.contains("原生浏览器文件恢复失败"));
    }

    #[test]
    fn restart_does_not_continue_when_runtime_cleanup_fails() {
        let result = stop_codex_plus_for_restart(
            || Ok(()),
            || anyhow::bail!("runtime still running"),
            || panic!("must not continue before runtime cleanup"),
        );
        assert!(matches!(result, Err(RestartStopError::Runtime(_))));
    }

    #[test]
    fn restart_does_not_cleanup_if_app_stop_fails() {
        let result = stop_codex_plus_for_restart(
            || anyhow::bail!("app remains running"),
            || panic!("must not stop runtime"),
            || panic!("must not wait on cleanup"),
        );
        assert!(matches!(result, Err(RestartStopError::Codex(_))));
    }

    #[test]
    fn failed_spawn_rolls_back_synced_live_files_for_retry() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join("config.toml"), "model = \"old\"\n").unwrap();
        std::fs::write(temp.path().join("auth.json"), "{\"old\":true}\n").unwrap();

        let result = restart_codex_plus_after_stop(
            &launch_request(true),
            temp.path(),
            Some(&routed_pure_api_settings()),
            |_| anyhow::bail!("synthetic spawn failure"),
        );

        assert!(result.is_err());
        assert_eq!(
            std::fs::read_to_string(temp.path().join("config.toml")).unwrap(),
            "model = \"old\"\n"
        );
        assert_eq!(
            std::fs::read_to_string(temp.path().join("auth.json")).unwrap(),
            "{\"old\":true}\n"
        );
    }

    #[test]
    fn ordinary_restart_does_not_read_or_change_live_relay_files() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join("config.toml"), "model = \"old\"\n").unwrap();
        std::fs::write(temp.path().join("auth.json"), "{\"old\":true}\n").unwrap();
        let spawned = std::cell::Cell::new(false);

        restart_codex_plus_after_stop(&launch_request(false), temp.path(), None, |_| {
            spawned.set(true);
            Ok(())
        })
        .unwrap();

        assert!(spawned.get());
        assert_eq!(
            std::fs::read_to_string(temp.path().join("config.toml")).unwrap(),
            "model = \"old\"\n"
        );
        assert_eq!(
            std::fs::read_to_string(temp.path().join("auth.json")).unwrap(),
            "{\"old\":true}\n"
        );
    }

    #[test]
    fn relay_files_payload_reads_config_and_auth_contents() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(
            temp.path().join("config.toml"),
            "model_provider = \"custom\"\n",
        )
        .unwrap();
        std::fs::write(
            temp.path().join("auth.json"),
            "{\"OPENAI_API_KEY\":\"sk-test\"}\n",
        )
        .unwrap();

        let payload = relay_files_payload_from_home(temp.path()).unwrap();

        assert!(payload.config_path.ends_with("config.toml"));
        assert!(payload.auth_path.ends_with("auth.json"));
        assert_eq!(payload.config_contents, "model_provider = \"custom\"\n");
        assert_eq!(payload.auth_contents, "{\"OPENAI_API_KEY\":\"sk-test\"}\n");
    }

    #[test]
    fn env_conflict_commands_ignore_codex_home_and_remove_openai_vars() {
        let _codex_home_guard = lock_codex_home_for_test();
        let test_openai_name = "OPENAI_CODEX_PLUS_ENV_CONFLICT_TEST";
        let previous_openai = std::env::var_os(test_openai_name);
        let previous_codex_home = std::env::var_os("CODEX_HOME");
        let temp = tempfile::tempdir().unwrap();
        unsafe {
            std::env::set_var(test_openai_name, "sk-test");
            std::env::set_var("CODEX_HOME", temp.path());
        }

        let check = check_env_conflicts();
        assert_eq!(check.status, "ok");
        assert!(
            check
                .payload
                .conflicts
                .iter()
                .any(|item| item.name == test_openai_name)
        );
        assert!(
            !check
                .payload
                .conflicts
                .iter()
                .any(|item| item.name == "CODEX_HOME")
        );

        codex_plus_core::env_conflicts::remove_process_env_conflicts_for_tests(
            &[test_openai_name.to_string(), "CODEX_HOME".to_string()],
            codex_plus_core::paths::default_app_state_dir().join("test-backups"),
        )
        .unwrap();
        assert!(std::env::var_os(test_openai_name).is_none());
        assert_eq!(
            std::env::var_os("CODEX_HOME"),
            Some(temp.path().as_os_str().to_os_string())
        );

        unsafe {
            match previous_openai {
                Some(value) => std::env::set_var(test_openai_name, value),
                None => std::env::remove_var(test_openai_name),
            }
            match previous_codex_home {
                Some(value) => std::env::set_var("CODEX_HOME", value),
                None => std::env::remove_var("CODEX_HOME"),
            }
        }
    }

    #[test]
    fn delete_local_session_falls_back_when_requested_db_no_longer_contains_thread() {
        let _codex_home_guard = lock_codex_home_for_test();
        let temp = tempfile::tempdir().unwrap();
        let previous_codex_home = std::env::var_os("CODEX_HOME");
        let codex_home = temp.path().join("codex-home");
        let sqlite_dir = codex_home.join("sqlite");
        std::fs::create_dir_all(&sqlite_dir).unwrap();
        let stale_db = sqlite_dir.join("codex-dev.db");
        let active_db = sqlite_dir.join("state_5.sqlite");
        let rollout_path = temp.path().join("rollout.jsonl");
        std::fs::write(&rollout_path, "{\"type\":\"message\"}\n").unwrap();
        let stale = rusqlite::Connection::open(&stale_db).unwrap();
        stale
            .execute(
                "CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, title TEXT)",
                [],
            )
            .unwrap();
        drop(stale);
        let active = rusqlite::Connection::open(&active_db).unwrap();
        active
            .execute(
                "CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, title TEXT)",
                [],
            )
            .unwrap();
        active
            .execute(
                "INSERT INTO threads VALUES ('t1', ?1, 'Active Thread')",
                [rollout_path.to_string_lossy().to_string()],
            )
            .unwrap();
        drop(active);

        unsafe {
            std::env::set_var("CODEX_HOME", &codex_home);
        }
        let result = delete_local_session(DeleteLocalSessionRequest {
            session_id: "t1".to_string(),
            title: "Active Thread".to_string(),
            db_path: Some(stale_db.to_string_lossy().to_string()),
        });
        unsafe {
            if let Some(value) = previous_codex_home {
                std::env::set_var("CODEX_HOME", value);
            } else {
                std::env::remove_var("CODEX_HOME");
            }
        }

        assert_eq!(result.status, "ok");
        assert_eq!(
            result.payload.status,
            codex_plus_core::models::DeleteStatus::LocalDeleted
        );
        let active = rusqlite::Connection::open(&active_db).unwrap();
        assert_eq!(
            active
                .query_row("SELECT COUNT(*) FROM threads WHERE id = 't1'", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            0
        );
    }

    #[test]
    fn project_path_identity_matches_frontend_grouping() {
        assert_eq!(normalized_project_path(r"C:\Projects\Foo\\"), "C:/Projects/Foo");
        assert_eq!(normalized_project_path("/Projects/Foo///"), "/Projects/Foo");
        assert_ne!(normalized_project_path("/Projects/Foo"), normalized_project_path("/Projects/foo"));
        assert_ne!(normalized_project_path("/Projects/Foo"), normalized_project_path(" /Projects/Foo"));
    }

    #[test]
    fn list_project_sessions_keeps_case_distinct_projects_separate() {
        let _codex_home_guard = lock_codex_home_for_test();
        let temp = tempfile::tempdir().unwrap();
        let previous_codex_home = std::env::var_os("CODEX_HOME");
        let home = temp.path().join("codex-home");
        let sqlite = home.join("sqlite");
        std::fs::create_dir_all(&sqlite).unwrap();
        let db = rusqlite::Connection::open(sqlite.join("state_5.sqlite")).unwrap();
        db.execute_batch(
            "CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, title TEXT, cwd TEXT, updated_at_ms INTEGER);\
             INSERT INTO threads VALUES ('upper', '', 'Upper', '/Projects/Foo', 30);\
             INSERT INTO threads VALUES ('upper-slash', '', 'Upper slash', '/Projects/Foo/', 20);\
             INSERT INTO threads VALUES ('lower', '', 'Lower', '/Projects/foo', 10);",
        ).unwrap();
        drop(db);
        unsafe { std::env::set_var("CODEX_HOME", &home); }
        let upper = list_project_sessions_blocking("/Projects/Foo/".into());
        let lower = list_project_sessions_blocking("/Projects/foo".into());
        restore_codex_home(previous_codex_home);

        assert_eq!(upper.status, "ok");
        assert_eq!(upper.payload.total_count, 2);
        assert_eq!(upper.payload.sessions.iter().map(|session| session.id.as_str()).collect::<Vec<_>>(), vec!["upper", "upper-slash"]);
        assert_eq!(lower.status, "ok");
        assert_eq!(lower.payload.total_count, 1);
        assert_eq!(lower.payload.sessions[0].id, "lower");
    }

    #[test]
    fn list_local_sessions_deduplicates_threads_across_current_and_legacy_dbs() {
        let _codex_home_guard = lock_codex_home_for_test();
        let temp = tempfile::tempdir().unwrap();
        let previous_codex_home = std::env::var_os("CODEX_HOME");
        let codex_home = temp.path().join("codex-home");
        let sqlite_dir = codex_home.join("sqlite");
        std::fs::create_dir_all(&sqlite_dir).unwrap();
        let current_db = sqlite_dir.join("state_5.sqlite");
        let legacy_db = codex_home.join("state_5.sqlite");
        create_minimal_thread_db(&current_db, "t1", "Current Copy", 100);
        create_minimal_thread_db(&legacy_db, "t1", "Legacy Copy", 200);

        unsafe {
            std::env::set_var("CODEX_HOME", &codex_home);
        }
        let result = tauri::async_runtime::block_on(list_local_sessions(None));

        assert_eq!(result.status, "ok");
        assert_eq!(result.payload.sessions.len(), 1);
        assert_eq!(result.payload.total_count, 1);
        assert_eq!(result.payload.sessions[0].id, "t1");
        assert_eq!(result.payload.sessions[0].title, "Legacy Copy");
        assert_eq!(
            result.payload.sessions[0].db_path,
            legacy_db.to_string_lossy()
        );

        rusqlite::Connection::open(&current_db)
            .unwrap()
            .execute("INSERT INTO threads VALUES ('t2', '', 'Newest', 300)", [])
            .unwrap();
        rusqlite::Connection::open(&legacy_db)
            .unwrap()
            .execute("INSERT INTO threads VALUES ('t3', '', 'Oldest', 50)", [])
            .unwrap();

        let first_page = list_local_sessions_blocking(Some(ListLocalSessionsRequest {
            offset: 0,
            limit: 2,
        }));
        assert_eq!(first_page.payload.sessions.len(), 2);
        assert_eq!(first_page.payload.sessions[0].id, "t2");
        assert_eq!(first_page.payload.sessions[1].id, "t1");
        assert!(first_page.payload.has_more);
        assert_eq!(first_page.payload.total_count, 3);

        let second_page = list_local_sessions_blocking(Some(ListLocalSessionsRequest {
            offset: 2,
            limit: 2,
        }));
        restore_codex_home(previous_codex_home);

        assert_eq!(second_page.payload.sessions.len(), 1);
        assert_eq!(second_page.payload.sessions[0].id, "t3");
        assert!(!second_page.payload.has_more);
        assert_eq!(second_page.payload.total_count, 3);
    }

    #[test]
    fn list_local_sessions_returns_partial_payload_and_clamps_extreme_pages() {
        let _codex_home_guard = lock_codex_home_for_test();
        let temp = tempfile::tempdir().unwrap();
        let previous_codex_home = std::env::var_os("CODEX_HOME");
        let home = temp.path().join("codex-home");
        let sqlite = home.join("sqlite");
        std::fs::create_dir_all(&sqlite).unwrap();
        create_minimal_thread_db(&sqlite.join("state_5.sqlite"), "valid", "Valid", 10);
        std::fs::write(home.join("state_5.sqlite"), b"not a database").unwrap();
        unsafe {
            std::env::set_var("CODEX_HOME", &home);
        }
        let first =
            tauri::async_runtime::block_on(list_local_sessions(Some(ListLocalSessionsRequest {
                offset: 0,
                limit: 0,
            })));
        let beyond = list_local_sessions_blocking(Some(ListLocalSessionsRequest {
            offset: usize::MAX,
            limit: usize::MAX,
        }));
        restore_codex_home(previous_codex_home);
        assert_eq!(first.status, "failed");
        assert_eq!(first.payload.limit, 1);
        assert_eq!(first.payload.total_count, 1);
        assert_eq!(first.payload.sessions[0].id, "valid");
        assert_eq!(beyond.status, "failed");
        assert_eq!(beyond.payload.limit, MAX_LOCAL_SESSIONS_PAGE_SIZE);
        assert_eq!(beyond.payload.total_count, 1);
        assert!(beyond.payload.sessions.is_empty());
        assert!(!beyond.payload.has_more);
    }

    #[test]
    fn list_local_sessions_ignores_relation_only_thread_reference_dbs() {
        let _codex_home_guard = lock_codex_home_for_test();
        let temp = tempfile::tempdir().unwrap();
        let previous_codex_home = std::env::var_os("CODEX_HOME");
        let codex_home = temp.path().join("codex-home");
        let sqlite_dir = codex_home.join("sqlite");
        std::fs::create_dir_all(&sqlite_dir).unwrap();
        let session_db = sqlite_dir.join("state_5.sqlite");
        let relation_db = sqlite_dir.join("codex-related.db");
        create_minimal_thread_db(&session_db, "t1", "Current Thread", 100);
        let relation = rusqlite::Connection::open(&relation_db).unwrap();
        relation
            .execute(
                "CREATE TABLE local_thread_catalog (thread_id TEXT PRIMARY KEY)",
                [],
            )
            .unwrap();
        relation
            .execute("INSERT INTO local_thread_catalog VALUES ('t1')", [])
            .unwrap();
        drop(relation);

        unsafe {
            std::env::set_var("CODEX_HOME", &codex_home);
        }
        let result = list_local_sessions_blocking(None);
        restore_codex_home(previous_codex_home);

        assert_eq!(result.status, "ok");
        assert_eq!(result.payload.sessions.len(), 1);
        assert_eq!(result.payload.sessions[0].id, "t1");
        assert_eq!(result.payload.sessions[0].title, "Current Thread");
    }

    #[test]
    fn delete_local_session_removes_duplicate_threads_from_all_candidate_dbs() {
        let _codex_home_guard = lock_codex_home_for_test();
        let temp = tempfile::tempdir().unwrap();
        let previous_codex_home = std::env::var_os("CODEX_HOME");
        let codex_home = temp.path().join("codex-home");
        let sqlite_dir = codex_home.join("sqlite");
        std::fs::create_dir_all(&sqlite_dir).unwrap();
        let current_db = sqlite_dir.join("state_5.sqlite");
        let legacy_db = codex_home.join("state_5.sqlite");
        create_minimal_thread_db(&current_db, "t1", "Current Copy", 100);
        create_minimal_thread_db(&legacy_db, "t1", "Legacy Copy", 200);

        unsafe {
            std::env::set_var("CODEX_HOME", &codex_home);
        }
        let result = delete_local_session(DeleteLocalSessionRequest {
            session_id: "t1".to_string(),
            title: "Legacy Copy".to_string(),
            db_path: Some(legacy_db.to_string_lossy().to_string()),
        });
        restore_codex_home(previous_codex_home);

        assert_eq!(result.status, "ok");
        assert_eq!(thread_count(&current_db, "t1"), 0);
        assert_eq!(thread_count(&legacy_db, "t1"), 0);
    }

    fn create_minimal_thread_db(path: &Path, id: &str, title: &str, updated_at_ms: i64) {
        let db = rusqlite::Connection::open(path).unwrap();
        db.execute(
            "CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, title TEXT, updated_at_ms INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO threads VALUES (?1, '', ?2, ?3)",
            (id, title, updated_at_ms),
        )
        .unwrap();
    }

    fn thread_count(path: &Path, id: &str) -> i64 {
        let db = rusqlite::Connection::open(path).unwrap();
        db.query_row("SELECT COUNT(*) FROM threads WHERE id = ?1", [id], |row| {
            row.get::<_, i64>(0)
        })
        .unwrap()
    }

    fn restore_codex_home(previous: Option<std::ffi::OsString>) {
        unsafe {
            if let Some(value) = previous {
                std::env::set_var("CODEX_HOME", value);
            } else {
                std::env::remove_var("CODEX_HOME");
            }
        }
    }

    #[test]
    fn apply_relay_profile_to_home_with_switch_rules_preserves_custom_provider_id() {
        let temp = tempfile::tempdir().unwrap();
        let profile = RelayProfile {
            relay_mode: codex_plus_core::settings::RelayMode::PureApi,
            protocol: codex_plus_core::settings::RelayProtocol::Responses,
            config_contents: "model_provider = \"ai\"\nmodel = \"gpt-image-2\"\n\n[model_providers.ai]\nname = \"ai\"\nwire_api = \"responses\"\nrequires_openai_auth = true\nbase_url = \"https://ahg.codes\"\n"
                .to_string(),
            auth_contents: "{}\n".to_string(),
            ..RelayProfile::default()
        };

        codex_plus_core::relay_config::apply_relay_profile_to_home_with_switch_rules(
            temp.path(),
            &profile,
            "",
        )
        .unwrap();

        let applied = std::fs::read_to_string(temp.path().join("config.toml")).unwrap();
        assert!(applied.contains("model_provider = \"ai\""));
        assert!(applied.contains("[model_providers.ai]"));
        assert!(!applied.contains("[model_providers.custom]"));
    }

    #[test]
    fn archiving_writes_archived_at_in_seconds_like_codex() {
        let temp = tempfile::tempdir().unwrap();
        let db = temp.path().join("state_5.sqlite");
        let connection = rusqlite::Connection::open(&db).unwrap();
        connection
            .execute_batch("CREATE TABLE threads(id TEXT PRIMARY KEY, archived INTEGER NOT NULL DEFAULT 0, archived_at INTEGER); INSERT INTO threads(id) VALUES('t1');")
            .unwrap();
        drop(connection);
        archive_one_local_session(&db, "t1", true).unwrap();
        let connection = rusqlite::Connection::open(&db).unwrap();
        let (archived, archived_at): (i64, i64) = connection
            .query_row("SELECT archived, archived_at FROM threads WHERE id='t1'", [], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap();
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;
        assert_eq!(archived, 1);
        assert!((archived_at - now).abs() < 60, "archived_at 必须是秒：{archived_at}");
        drop(connection);
        archive_one_local_session(&db, "t1", false).unwrap();
    }

    #[test]
    fn save_relay_file_in_home_only_allows_known_files() {
        let temp = tempfile::tempdir().unwrap();

        save_relay_file_in_home(temp.path(), "config", "model = \"gpt-5\"\n").unwrap();
        save_relay_file_in_home(temp.path(), "auth", "{}\n").unwrap();

        assert_eq!(
            std::fs::read_to_string(temp.path().join("config.toml")).unwrap(),
            "model = \"gpt-5\"\n"
        );
        assert_eq!(
            std::fs::read_to_string(temp.path().join("auth.json")).unwrap(),
            "{}\n"
        );
        assert!(save_relay_file_in_home(temp.path(), "../bad", "").is_err());
    }

    #[test]
    fn config_save_applies_official_deepseek_responses_compatibility() {
        let profile = RelayProfile {
            id: "custom-deepseek".to_string(),
            base_url: "https://api.deepseek.com/".to_string(),
            upstream_base_url: "https://api.deepseek.com/".to_string(),
            protocol: codex_plus_core::settings::RelayProtocol::Responses,
            ..RelayProfile::default()
        };
        let config = r#"[features]
unified_exec = true
code_mode_only = true

[features.code_mode]
enabled = true
"#;

        let prepared = prepare_relay_file_contents("config", config, &profile).unwrap();

        assert!(prepared.contains("unified_exec = true"));
        assert!(prepared.contains("code_mode_only = false"));
        assert!(prepared.contains("enabled = false"));
    }

    #[test]
    fn config_save_preserves_third_party_responses_and_deepseek_chat_completions() {
        let config = r#"[features]
code_mode_only = true

[features.code_mode]
enabled = true
"#;
        let third_party = RelayProfile {
            base_url: "https://relay.example/v1".to_string(),
            upstream_base_url: "https://relay.example/v1".to_string(),
            protocol: codex_plus_core::settings::RelayProtocol::Responses,
            ..RelayProfile::default()
        };
        let chat_completions = RelayProfile {
            base_url: "https://api.deepseek.com/".to_string(),
            upstream_base_url: "https://api.deepseek.com/".to_string(),
            protocol: codex_plus_core::settings::RelayProtocol::ChatCompletions,
            ..RelayProfile::default()
        };

        assert_eq!(
            prepare_relay_file_contents("config", config, &third_party).unwrap(),
            config
        );
        assert_eq!(
            prepare_relay_file_contents("config", config, &chat_completions).unwrap(),
            config
        );
    }

    #[test]
    /// #1972：用户误把 Codex++ 自己的 exe 选成了「Codex 应用路径」——文件选择器
    /// 只按 exe 扩展名过滤，拦不住。以前无效路径会原样存进 settings.json，而
    /// launcher 拿到显式无效 --app-path 又不回退自动探测，于是启动永久失败，
    /// 只能手改配置文件才能恢复。
    fn normalize_settings_before_save_drops_an_invalid_codex_app_path() {
        let codex_plus_own_exe = if cfg!(windows) {
            r"D:\Codex++\codex-plus-plus.exe"
        } else {
            "/Applications/Codex++/codex-plus-plus"
        };
        let settings = BackendSettings {
            codex_app_path: codex_plus_own_exe.to_string(),
            ..BackendSettings::default()
        };

        let normalized = normalize_settings_before_save(settings);

        // 清空而不是留着：留着就会被当成显式 --app-path 传下去，永久失败
        assert!(
            normalized.codex_app_path.is_empty(),
            "指向 Codex++ 自身的路径不该落库，实际是 {}",
            normalized.codex_app_path
        );
    }

    #[test]
    fn normalize_settings_before_save_keeps_an_empty_codex_app_path_empty() {
        let settings = BackendSettings {
            codex_app_path: "   ".to_string(),
            ..BackendSettings::default()
        };

        assert!(
            normalize_settings_before_save(settings)
                .codex_app_path
                .is_empty()
        );
    }

    #[test]
    fn backfill_request_preserves_identity_unless_explicitly_adopted() {
        let settings = serde_json::to_value(BackendSettings::default()).unwrap();
        let request: BackfillRelayProfileRequest = serde_json::from_value(json!({
            "settings": settings, "profileId": "profile-a"
        }))
        .unwrap();
        assert!(!request.adopt_provider_identity);
        let request: BackfillRelayProfileRequest = serde_json::from_value(json!({
            "settings": settings, "profileId": "profile-a", "adoptProviderIdentity": true
        }))
        .unwrap();
        assert!(request.adopt_provider_identity);
    }

    #[test]
    fn normalize_settings_before_save_preserves_profile_context_until_manual_extract() {
        let settings = BackendSettings {
            relay_common_config_contents: "[mcp_servers.context7]\ncommand = \"npx\"\n".to_string(),
            relay_profiles: vec![RelayProfile {
                use_common_config: false,
                config_contents: "model = \"gpt-5\"\n\n[mcp_servers.context7]\ncommand = \"npx\"\n"
                    .to_string(),
                ..RelayProfile::default()
            }],
            ..BackendSettings::default()
        };

        let normalized = normalize_settings_before_save(settings);

        assert!(
            normalized.relay_profiles[0]
                .config_contents
                .contains("model = \"gpt-5\"")
        );
        assert!(
            normalized.relay_profiles[0]
                .config_contents
                .contains("[mcp_servers.context7]")
        );
        assert!(
            normalized
                .relay_context_config_contents
                .contains("[mcp_servers.context7]")
        );
        assert!(
            !normalized
                .relay_common_config_contents
                .contains("[mcp_servers")
        );
    }

    #[test]
    fn normalize_settings_before_save_ignores_legacy_launch_mode_and_preserves_provider_mode() {
        let settings: BackendSettings = serde_json::from_value(json!({
            "activeRelayId": "api", "launchMode": "relay",
            "relayProfiles": [{ "id": "api", "name": "API", "relayMode": "pureApi" }],
        }))
        .unwrap();
        let normalized = normalize_settings_before_save(settings);
        assert_eq!(
            normalized.relay_profiles[0].relay_mode,
            codex_plus_core::settings::RelayMode::PureApi
        );
        assert!(
            serde_json::to_value(&normalized)
                .unwrap()
                .get("launchMode")
                .is_none()
        );
    }

    #[test]
    fn normalize_settings_before_save_preserves_official_profile_auth() {
        let settings = BackendSettings {
            relay_profiles: vec![RelayProfile {
                relay_mode: codex_plus_core::settings::RelayMode::Official,
                official_mix_api_key: false,
                auth_contents: r#"{"auth_mode":"chatgpt","tokens":{"access_token":"edited"}}"#
                    .to_string(),
                config_contents: "model_provider = \"custom\"\n".to_string(),
                ..RelayProfile::default()
            }],
            ..BackendSettings::default()
        };

        let normalized = normalize_settings_before_save(settings);

        let auth_json: serde_json::Value =
            serde_json::from_str(&normalized.relay_profiles[0].auth_contents).unwrap();
        assert_eq!(
            auth_json,
            serde_json::json!({
                "auth_mode": "chatgpt",
                "tokens": {
                    "access_token": "edited"
                }
            })
        );
        assert!(normalized.relay_profiles[0].config_contents.is_empty());
    }

    #[test]
    fn normalize_settings_before_save_strips_common_from_enabled_profile() {
        let settings = BackendSettings {
            relay_common_config_contents: r#"model_reasoning_effort = "high"

[features]
goals = true

[plugins."superpowers@openai-curated"]
enabled = true
"#
            .to_string(),
            relay_profiles: vec![RelayProfile {
                use_common_config: true,
                config_contents: r#"model = "gpt-5"
model_reasoning_effort = "high"

[features]
goals = true
model_reasoning_effort = "high"

[plugins."superpowers@openai-curated"]
enabled = true
"#
                .to_string(),
                ..RelayProfile::default()
            }],
            ..BackendSettings::default()
        };

        let normalized = normalize_settings_before_save(settings);
        let config = &normalized.relay_profiles[0].config_contents;

        assert!(config.contains("model = \"gpt-5\""));
        assert!(!config.contains("model_reasoning_effort"));
        // `goals` is an explicit per-profile override and must survive
        // normalization even when it matches the common configuration.
        assert!(config.contains("[features]"));
        assert!(config.contains("goals = true"));
        assert!(!config.contains("[plugins.\"superpowers@openai-curated\"]"));
    }

    #[test]
    fn normalize_settings_before_save_preserves_explicit_false_goals_override() {
        let settings = BackendSettings {
            relay_common_config_contents: "[features]\ngoals = true\nfast_mode = true\n"
                .to_string(),
            relay_profiles: vec![RelayProfile {
                use_common_config: true,
                config_contents: "model = \"gpt-5\"\n[features]\ngoals = false\n".to_string(),
                ..RelayProfile::default()
            }],
            ..BackendSettings::default()
        };

        let normalized = normalize_settings_before_save(settings);
        let config = &normalized.relay_profiles[0].config_contents;
        assert!(config.contains("goals = false"));
        assert!(!config.contains("fast_mode = true"));
    }

    #[test]
    fn normalize_settings_before_save_repairs_invalid_profile_common_duplication() {
        let settings = BackendSettings {
            relay_common_config_contents: r#"model_reasoning_effort = "high"

[marketplaces.openai-bundled]
last_updated = "2026-05-25T11:52:46Z"
"#
            .to_string(),
            relay_profiles: vec![RelayProfile {
                use_common_config: true,
                config_contents: r#"model = "gpt-5"
model_reasoning_effort = "high"

[marketplaces.openai-bundled]
last_updated = "2026-05-25T11:52:46Z"

[marketplaces.openai-bundled]
last_updated = "2026-05-25T11:52:46Z"
"#
                .to_string(),
                ..RelayProfile::default()
            }],
            ..BackendSettings::default()
        };

        let normalized = normalize_settings_before_save(settings);
        let config = &normalized.relay_profiles[0].config_contents;

        assert!(config.contains("model = \"gpt-5\""));
        assert!(!config.contains("model_reasoning_effort"));
        assert!(!config.contains("[marketplaces.openai-bundled]"));
    }

    #[test]
    fn normalize_settings_before_save_removes_model_catalog_from_common_config() {
        let settings = BackendSettings {
            relay_common_config_contents: r#"model_catalog_json = "C:\\Users\\Administrator\\.codex\\model-catalogs\\relay-a.json"
model_catalog_json = 'C:\Users\Administrator\.codex\model-catalogs\relay-b.json'
model_reasoning_effort = "high"
"#
            .to_string(),
            ..BackendSettings::default()
        };

        let normalized = normalize_settings_before_save(settings);

        assert!(
            !normalized
                .relay_common_config_contents
                .contains("model_catalog_json")
        );
        assert!(
            normalized
                .relay_common_config_contents
                .contains("model_reasoning_effort = \"high\"")
        );
    }

    #[test]
    fn context_entry_commands_update_settings_payload() {
        let settings = BackendSettings::default();
        let upsert = upsert_context_entry(ContextEntryRequest {
            settings: settings.clone(),
            kind: "mcp".to_string(),
            id: "context7".to_string(),
            toml_body: "command = \"npx\"\n".to_string(),
        });

        assert_eq!(upsert.status, "ok");
        assert!(
            upsert
                .payload
                .settings
                .relay_context_config_contents
                .contains("[mcp_servers.context7]")
        );

        let listed = list_context_entries(ContextSettingsRequest {
            settings: upsert.payload.settings.clone(),
        });
        assert_eq!(listed.payload.entries.mcp_servers[0].id, "context7");

        let deleted = delete_context_entry(ContextDeleteRequest {
            settings: upsert.payload.settings,
            kind: "mcp".to_string(),
            id: "context7".to_string(),
        });
        assert_eq!(deleted.status, "ok");
        assert!(
            !deleted
                .payload
                .settings
                .relay_context_config_contents
                .contains("[mcp_servers.context7]")
        );
    }

    #[test]
    fn open_external_url_rejects_non_http_urls() {
        let result = open_external_url("file:///C:/Windows/win.ini".to_string());

        assert_eq!(result.status, "failed");
        assert!(result.message.contains("只允许打开 http 或 https 链接"));
    }

}
