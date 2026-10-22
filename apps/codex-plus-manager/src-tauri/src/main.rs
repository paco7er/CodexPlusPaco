#![cfg_attr(windows, windows_subsystem = "windows")]

fn main() {
    let args: Vec<_> = std::env::args_os().collect();
    // 旧 MCP 配置和安装器参数不能误启动 GUI，也不能退回执行已移除的功能。
    if retired_mode_requested(args.iter().map(|arg| arg.to_string_lossy())) {
        eprintln!("此版本已移除多开、Agent 协作与自动更新，请移除旧的启动配置。");
        std::process::exit(1);
    }
    #[cfg(target_os = "macos")]
    if launched_from_legacy_manager_compat_bundle() {
        // 旧版更新器要求 DMG 中有第二个 manager bundle，并会在替换后打开它。
        // 兼容壳只满足身份校验；让真正的统一 Codex++ app 接管界面。
        return;
    }
    // 开机启动也只打开界面；禁用开机项不影响用户主动双击。
    if should_skip_autostart(
        std::env::args(),
        codex_plus_core::watcher::default_watcher_disabled_flag().exists(),
    ) {
        return;
    }
    for arg in std::env::args() {
        if arg.starts_with("codexplusplus://") {
            match codex_plus_core::provider_import::save_pending_provider_import_from_url(&arg) {
                Ok(request) => {
                    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                        "manager.provider_import_url.pending",
                        serde_json::json!({
                            "name": request.name,
                            "baseUrl": request.base_url
                        }),
                    );
                    codex_plus_manager_lib::focus_existing_manager_window();
                }
                Err(error) => {
                    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                        "manager.provider_import_url.failed",
                        serde_json::json!({
                            "error": error.to_string()
                        }),
                    );
                }
            }
        }
    }
    codex_plus_manager_lib::run();
}

#[cfg(target_os = "macos")]
fn launched_from_legacy_manager_compat_bundle() -> bool {
    std::env::current_exe()
        .ok()
        .map(|path| path.to_string_lossy().contains("Codex++ 管理工具.app"))
        .unwrap_or(false)
}

fn should_skip_autostart(args: impl IntoIterator<Item = String>, disabled: bool) -> bool {
    disabled && args.into_iter().any(|arg| arg == "--autostart")
}

fn retired_mode_requested(args: impl IntoIterator<Item = impl AsRef<str>>) -> bool {
    args.into_iter().any(|arg| {
        matches!(arg.as_ref(), "--codex-plus-agent-mcp" | "--apply-codex-plus-update" | "--codex-plus-multi-worker")
    })
}

#[cfg(test)]
mod tests {
    use super::{retired_mode_requested, should_skip_autostart};

    #[test]
    fn retired_background_modes_never_fall_through_to_the_gui() {
        assert!(retired_mode_requested(["app", "--codex-plus-agent-mcp"]));
        assert!(retired_mode_requested(["app", "--apply-codex-plus-update", "plan.json"]));
        assert!(retired_mode_requested(["app", "--codex-plus-multi-worker", "options.json"]));
        assert!(retired_mode_requested(["app", "--codex-plus-multi-worker"]));
        assert!(!retired_mode_requested(["app"]));
    }

    #[test]
    fn disabling_login_startup_still_allows_opening_the_gui() {
        for args in [
            vec!["codex-plus-plus"],
            vec!["codex-plus-plus", "--background"],
            vec!["codex-plus-plus", "--helper-only"],
        ] {
            assert!(!should_skip_autostart(
                args.into_iter().map(String::from),
                true
            ));
        }
        assert!(should_skip_autostart(
            ["codex-plus-plus", "--autostart"].map(String::from),
            true
        ));
        assert!(!should_skip_autostart(
            ["codex-plus-plus", "--autostart"].map(String::from),
            false
        ));
    }
}
