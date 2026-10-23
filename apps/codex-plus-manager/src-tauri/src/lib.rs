mod auto_takeover;
mod global_dictation;
pub mod commands;
pub mod install;
mod runtime_health;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};

const TRAY_ID: &str = "codex_plus_tray";

static APP_EXITING: AtomicBool = AtomicBool::new(false);
static SHUTDOWN_STARTED: AtomicBool = AtomicBool::new(false);
static SHUTDOWN_COMPLETE: AtomicBool = AtomicBool::new(false);
const SHUTDOWN_WATCHDOG: std::time::Duration = std::time::Duration::from_secs(10);
const TRAY_MENU_SHOW: &str = "tray_show_main";
const TRAY_MENU_QUIT: &str = "tray_quit_app";
const MANAGER_NAVIGATION_EVENT: &str = "manager-navigation-requested";

pub(crate) fn app_is_exiting() -> bool {
    APP_EXITING.load(Ordering::SeqCst)
}

pub fn run() {
    install_panic_logger();
    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
        "manager.start",
        serde_json::json!({
            "version": env!("CARGO_PKG_VERSION")
        }),
    );
    let Some(_guard) = acquire_single_instance_guard() else {
        return;
    };
    #[cfg(target_os = "macos")]
    if let Some(root) = codex_plus_core::install::default_install_root() {
        match codex_plus_core::install::macos::migrate_legacy_manager_bundle(&root) {
            Ok(Some(archive)) => {
                let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                    "manager.legacy_manager_migrated",
                    serde_json::json!({ "archive": archive }),
                );
            }
            Ok(None) => {}
            Err(error) => {
                let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                    "manager.legacy_manager_migration_failed",
                    serde_json::json!({ "message": error.to_string() }),
                );
            }
        }
    }
    if let Ok(settings) = codex_plus_core::settings::SettingsStore::default().load() {
        codex_plus_core::launcher::set_http_body_limit_bytes(
            settings.helper_max_request_body_bytes(),
        );
    }
    let autostart = std::env::args().any(|arg| arg == "--autostart");
    let start_minimized = autostart
        && codex_plus_core::watcher::watcher_start_minimized();
    let start_codex_at_login = autostart && codex_plus_core::watcher::watcher_start_codex();
    let start_codex_on_open = !autostart && codex_plus_core::watcher::watcher_start_codex_on_open();
    let app_result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let mut main_window_builder =
                tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("/index.html".into()))
                    .title("Codex++")
                    .visible(!start_minimized)
                    .focused(!start_minimized)
                    .inner_size(1180.0, 820.0)
                    .min_inner_size(960.0, 720.0);
            if let Some(icon) = app.default_window_icon().cloned() {
                main_window_builder = main_window_builder.icon(icon)?;
            }
            let main_window = main_window_builder.build()?;
            // Tauri 的窗口图标只设置 ICON_SMALL，任务栏还需要 ICON_BIG。
            #[cfg(windows)]
            if let (Ok(hwnd), Ok(executable)) = (main_window.hwnd(), std::env::current_exe()) {
                codex_plus_core::windows_apply_icons_to_window(hwnd.0 as isize, executable);
            }
            install_tray(app)?;
            if start_minimized {
                set_manager_activation_policy(app.handle(), false);
            }
            let navigation_app = app.handle().clone();
            codex_plus_launcher::set_navigation_handler(move |_payload| {
                let app = navigation_app.clone();
                navigation_app.run_on_main_thread(move || {
                    show_main_window(&app);
                    let _ = app.emit(MANAGER_NAVIGATION_EVENT, ());
                })?;
                Ok(())
            });
            start_window_activation_listener(app.handle().clone());
            register_main_window_events(main_window);
            commands::resume_existing_codex_background(
                app.handle().clone(),
                start_codex_at_login || start_codex_on_open,
            );
            // 自动接管官方 App（默认关闭）：设置里开着才起守护线程。
            auto_takeover::start_supervisor();
            if let Err(error) = global_dictation::apply_config() {
                let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                    "dictation.global_hotkey_start_failed",
                    serde_json::json!({ "message": error.to_string() }),
                );
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::backend_version,
            commands::consume_pending_manager_navigation,
            commands::load_overview,
            commands::launch_codex_plus,
            commands::restart_codex_plus,
            commands::load_settings,

            commands::native_browser_status,
            commands::save_settings,
            commands::test_vlm,
            commands::query_builtin_model_metadata,
            commands::builtin_model_metadata_index,
            commands::load_ccs_providers,
            commands::import_ccs_providers,
            commands::load_pending_provider_import,
            commands::confirm_pending_provider_import,
            commands::dismiss_pending_provider_import,
            commands::list_local_sessions,
            commands::list_project_sessions,
            commands::delete_local_session,
            commands::archive_local_sessions,
            commands::load_provider_sync_targets,
            commands::repair_session_index,
            commands::load_session_index_repair_report,
            commands::preview_session_index_cleanup,
            commands::preview_provider_sync,
            commands::apply_session_index_cleanup,
            commands::sync_providers_now,
            commands::load_provider_sync_recovery,
            commands::recover_provider_sync,


            commands::refresh_skill_catalog,
            commands::list_installed_skills,
            commands::import_ccs_skills,
            commands::install_skill,
            commands::update_skill,
            commands::set_skill_enabled,
            commands::uninstall_skill,
            commands::restore_skill_backup,
            commands::delete_skill_backup,
            commands::upsert_skill_repo,
            commands::inspect_skill_repo,
            commands::delete_skill_repo,
            commands::open_external_url,
            commands::repair_shortcuts,
            commands::load_watcher_state,
            commands::set_watcher_enabled,
            commands::set_watcher_start_minimized,
            commands::set_watcher_start_codex,
            commands::set_watcher_start_codex_on_open,
            commands::load_relay_proxy,
            commands::set_relay_proxy,
            commands::load_relay_feature,
            commands::set_relay_feature,
            // 自动接管官方 App：前端 invoke 找不到命令时是运行期静默失败，
            // 没有编译期兜底，所以这三个必须注册在这里（契约测试会守）。
            commands::load_auto_takeover_state,
            commands::take_over_codex_now,
            commands::pause_auto_takeover_for_instance,
            commands::relay_status,
            commands::read_relay_files,
            commands::check_env_conflicts,

            commands::remove_env_conflicts,
            commands::save_relay_file,
            commands::write_diagnostic_event,
            commands::backfill_relay_profile_from_live,
            commands::list_context_entries,
            commands::read_live_context_entries,
            commands::sync_live_context_entries,
            commands::upsert_context_entry,
            commands::delete_context_entry,
            commands::parse_mcp_entry,
            commands::inspect_mcp_startup,
            commands::build_mcp_entry,
            commands::preview_mcp_servers_json,
            commands::import_mcp_servers_json,
            commands::extract_relay_common_config,
            commands::test_relay_profile,
            commands::diagnose_relay_profile,
            commands::fetch_relay_profile_models,
            commands::fetch_sub2api_billing,
            commands::switch_relay_profile,
            commands::apply_relay_injection,
            commands::apply_pure_api_injection,
            commands::clear_relay_injection,
            manager_exit_app,
            manager_hide_to_tray
        ])
        .build(tauri::generate_context!());
    match app_result {
        Ok(app) => app.run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = &event {
                if !SHUTDOWN_COMPLETE.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    if !SHUTDOWN_STARTED.swap(true, Ordering::SeqCst) {
                        APP_EXITING.store(true, Ordering::SeqCst);
                        std::thread::spawn(|| {
                            shutdown_watchdog(&SHUTDOWN_COMPLETE, SHUTDOWN_WATCHDOG, || {
                                // 日志磁盘也可能卡住，不能让诊断写入再次阻塞强制退出。
                                let (sent, received) = std::sync::mpsc::channel();
                                let _ = std::thread::Builder::new().spawn(move || {
                                    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                                        "app.shutdown_watchdog_forced",
                                        serde_json::json!({ "waitedSeconds": SHUTDOWN_WATCHDOG.as_secs() }),
                                    );
                                    let _ = sent.send(());
                                });
                                let _ = received.recv_timeout(std::time::Duration::from_millis(200));
                                std::process::exit(0);
                            });
                        });
                        auto_takeover::stop_supervisor();
                        let app = app_handle.clone();
                        tauri::async_runtime::spawn_blocking(move || {
                            if let Err(error) = codex_plus_launcher::shutdown() {
                                let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                                    "app.shutdown_failed",
                                    serde_json::json!({ "message": error.to_string() }),
                                );
                            }
                            SHUTDOWN_COMPLETE.store(true, Ordering::SeqCst);
                            app.exit(0);
                        });
                    }
                }
            }
            #[cfg(target_os = "macos")]
            match event {
                tauri::RunEvent::Reopen { .. } => {
                    show_main_window(app_handle);
                }
                _ => {}
            }

            #[cfg(not(target_os = "macos"))]
            let _ = (app_handle, event);
        }),
        Err(error) => {
            let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                "manager.run_failed",
                serde_json::json!({
                    "error": error.to_string()
                }),
            );
        }
    }
}

fn shutdown_watchdog(
    complete: &AtomicBool,
    timeout: std::time::Duration,
    force_exit: impl FnOnce(),
) {
    std::thread::sleep(timeout);
    if !complete.load(Ordering::SeqCst) {
        force_exit();
    }
}

#[cfg(test)]
mod shutdown_tests {
    use super::*;

    #[test]
    fn watchdog_forces_exit_only_when_cleanup_is_incomplete() {
        for complete in [false, true] {
            let forced = AtomicBool::new(false);
            shutdown_watchdog(&AtomicBool::new(complete), std::time::Duration::ZERO, || {
                forced.store(true, Ordering::SeqCst);
            });
            assert_eq!(forced.load(Ordering::SeqCst), !complete);
        }
    }

    #[test]
    fn watchdog_can_exit_a_process_with_stuck_cleanup() {
        const CHILD_ENV: &str = "CODEX_PLUS_SHUTDOWN_WATCHDOG_TEST";
        if std::env::var_os(CHILD_ENV).is_some() {
            let complete = AtomicBool::new(false);
            std::thread::spawn(move || {
                shutdown_watchdog(&complete, std::time::Duration::from_millis(10), || {
                    std::process::exit(73);
                });
            });
            loop {
                std::thread::park();
            }
        }
        let mut child = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "shutdown_tests::watchdog_can_exit_a_process_with_stuck_cleanup"])
            .env(CHILD_ENV, "1")
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        loop {
            if let Some(status) = child.try_wait().unwrap() {
                assert_eq!(status.code(), Some(73));
                break;
            }
            if std::time::Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                panic!("退出看门狗未在时限内结束进程");
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }
}

fn install_tray<R: tauri::Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, TRAY_MENU_SHOW, "显示主窗口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, TRAY_MENU_QUIT, "退出程序", true, None::<&str>)?;
    let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&tray_menu)
        .tooltip("Codex++")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            TRAY_MENU_SHOW => {
                show_main_window(app);
            }
            TRAY_MENU_QUIT => {
                APP_EXITING.store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => {
                show_main_window(&tray.app_handle());
            }
            _ => {}
        });

    #[cfg(target_os = "macos")]
    {
        // 使用项目原有云朵图标；系统按 18pt 显示，不加标题占据菜单栏空间。
        // 禁用模板模式以保留品牌渐变颜色。
        tray_builder = tray_builder.icon(macos_tray_icon()).icon_as_template(false);
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    // Tauri 的资源表持有托盘对象，局部句柄释放不会移除菜单栏入口。
    let _ = tray_builder.build(app)?;
    Ok(())
}

#[cfg(any(target_os = "macos", test))]
fn macos_tray_icon() -> tauri::image::Image<'static> {
    tauri::include_image!("icons/icon.png")
}

#[cfg(test)]
mod tray_tests {
    #[test]
    fn macos_tray_preserves_the_brand_icons_colour_and_transparency() {
        let icon = super::macos_tray_icon();
        assert_eq!(icon.width(), icon.height());
        assert!(icon.width() > 0);
        assert!(
            icon.rgba()
                .chunks_exact(4)
                .any(|pixel| pixel[3] > 0 && pixel[2] > pixel[0])
        );
        assert!(icon.rgba().chunks_exact(4).any(|pixel| pixel[3] == 0));
    }
}

fn register_main_window_events<R: tauri::Runtime>(window: tauri::WebviewWindow<R>) {
    let event_window = window.clone();
    let close_event_window = event_window.clone();
    let close_event_app = event_window.app_handle().clone();
    let focus_event_window = event_window.clone();

    event_window.on_window_event(move |event| match event {
        WindowEvent::Focused(true) => {
            // 外部实例通过 Win32 ShowWindow 唤起时，Tao 的 VISIBLE 标记可能仍为 false。
            // 同步框架状态，否则后续 hide() 会被当作重复操作而跳过。
            #[cfg(windows)]
            let _ = focus_event_window.show();
            let _ = focus_event_window.emit(MANAGER_NAVIGATION_EVENT, ());
        }
        WindowEvent::CloseRequested { api, .. } => {
            if APP_EXITING.load(Ordering::SeqCst) {
                return;
            }

            api.prevent_close();
            // Windows 上 Tao 的 VISIBLE 标记可能停在 false（窗口曾被 Win32 直接显示
            // 或隐藏），此时 hide() 会被框架当成重复操作跳过，窗口既不关闭也不隐藏
            // （issue #1542）。先强制同步为可见再隐藏，保证 hide() 真正执行。
            #[cfg(windows)]
            let _ = close_event_window.show();
            let _ = close_event_window.hide();
            set_manager_activation_policy(&close_event_app, false);
        }
        _ => {}
    });
}

#[tauri::command]
fn manager_exit_app<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    APP_EXITING.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[tauri::command]
fn manager_hide_to_tray<R: tauri::Runtime>(window: tauri::WebviewWindow<R>) {
    let app_handle = window.app_handle();
    let _ = window.hide();
    set_manager_activation_policy(&app_handle, false);
}

fn show_main_window<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) {
    if let Some(window) = app_handle.get_webview_window("main") {
        set_manager_activation_policy(app_handle, true);
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "macos")]
fn set_manager_activation_policy<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    main_window_visible: bool,
) {
    // 关闭窗口收起到菜单栏；重新打开窗口时才恢复 Dock 图标。
    let policy = if main_window_visible {
        tauri::ActivationPolicy::Regular
    } else {
        tauri::ActivationPolicy::Accessory
    };
    let _ = app_handle.set_activation_policy(policy);
}

#[cfg(not(target_os = "macos"))]
fn set_manager_activation_policy<R: tauri::Runtime>(
    _app_handle: &tauri::AppHandle<R>,
    _main_window_visible: bool,
) {
}

/// Restores and focuses an existing manager window on desktop platforms.
pub fn focus_existing_manager_window() {
    // 锁持有者在主进程内消费请求，Linux 及隐藏窗口也能重新打开。
    let path = window_activation_request_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let request = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .to_string();
    let _ = std::fs::write(path, request);
    #[cfg(windows)]
    {
        let current_process_id = std::process::id();
        for process in codex_plus_core::windows_enumerate_processes() {
            if process.process_id == current_process_id {
                continue;
            }
            if ["codex-plus-plus.exe", "codex-plus-plus-manager.exe"]
                .iter()
                .any(|name| process.exe_file.eq_ignore_ascii_case(name))
                && codex_plus_core::windows_activate_process_window(process.process_id)
            {
                break;
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(executable) = std::env::current_exe()
            && let Ok(app) =
                codex_plus_core::install::macos::native_application_bundle_from_executable(
                    &executable,
                )
        {
            let _ = std::process::Command::new("/usr/bin/open")
                .arg(app)
                .status();
        }
    }
}

fn window_activation_request_path() -> std::path::PathBuf {
    codex_plus_core::paths::default_app_state_dir().join(format!(
        "window-activation-{}.request",
        codex_plus_core::ports::manager_guard_port()
    ))
}

fn start_window_activation_listener(app: tauri::AppHandle) {
    let path = window_activation_request_path();
    let mut previous = std::fs::read(&path).unwrap_or_default();
    std::thread::spawn(move || {
        while !SHUTDOWN_STARTED.load(Ordering::SeqCst) {
            std::thread::sleep(std::time::Duration::from_millis(300));
            let current = std::fs::read(&path).unwrap_or_default();
            if !current.is_empty() && current != previous {
                previous = current;
                let app = app.clone();
                let handle = app.clone();
                let _ = handle.run_on_main_thread(move || {
                    show_main_window(&app);
                    let _ = app.emit(MANAGER_NAVIGATION_EVENT, ());
                });
            }
        }
    });
}

fn install_panic_logger() {
    std::panic::set_hook(Box::new(|panic_info| {
        let payload = panic_info
            .payload()
            .downcast_ref::<&str>()
            .map(|message| (*message).to_string())
            .or_else(|| panic_info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "非字符串 panic payload".to_string());
        let location = panic_info.location().map(|location| {
            serde_json::json!({
                "file": location.file(),
                "line": location.line(),
                "column": location.column()
            })
        });
        let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
            "manager.panic",
            serde_json::json!({
                "payload": payload,
                "location": location
            }),
        );
    }));
}

fn acquire_single_instance_guard() -> Option<codex_plus_core::ports::LoopbackPortGuard> {
    match codex_plus_core::ports::acquire_resilient_loopback_port_guard(
        codex_plus_core::ports::manager_guard_port(),
    ) {
        Ok(guard) => {
            if let Some(fallback_lock_path) = guard.fallback_path() {
                let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                    "manager.guard_fallback",
                    serde_json::json!({
                        "requested_guard_port": codex_plus_core::ports::manager_guard_port(),
                        "fallback_lock_path": fallback_lock_path
                    }),
                );
            }
            Some(guard)
        }
        Err(error)
            if matches!(
                error.kind(),
                std::io::ErrorKind::AddrInUse | std::io::ErrorKind::WouldBlock
            ) =>
        {
            let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                "manager.already_running",
                serde_json::json!({
                    "guard_port": codex_plus_core::ports::manager_guard_port()
                }),
            );
            focus_existing_manager_window();
            None
        }
        Err(error) => {
            let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                "manager.guard_failed",
                serde_json::json!({
                    "guard_port": codex_plus_core::ports::manager_guard_port(),
                    "error": error.to_string()
                }),
            );
            match std::net::TcpListener::bind(("127.0.0.1", 0)) {
                Ok(listener) => Some(codex_plus_core::ports::LoopbackPortGuard::listener(
                    listener,
                )),
                Err(fallback_error) => {
                    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                        "manager.guard_fallback_failed",
                        serde_json::json!({
                            "error": fallback_error.to_string()
                        }),
                    );
                    None
                }
            }
        }
    }
}
