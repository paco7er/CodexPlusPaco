use std::path::{Path, PathBuf};

const PORTABLE_MARKER: &str = "portable.flag";

fn portable_paths(executable: &Path) -> Option<[(&'static str, PathBuf); 2]> {
    let root = executable.parent()?;
    if !root.join(PORTABLE_MARKER).is_file() {
        return None;
    }
    let data = root.join("data");
    Some([
        ("CODEX_PLUS_STATE_DIR", data.join("state")),
        ("WEBVIEW2_USER_DATA_FOLDER", data.join("webview")),
    ])
}

fn prepare_paths(paths: &[(&str, PathBuf)]) -> std::io::Result<()> {
    for (_, path) in paths {
        std::fs::create_dir_all(path)?;
    }
    Ok(())
}

pub fn initialize() -> anyhow::Result<()> {
    let executable = std::env::current_exe()?;
    let Some(paths) = portable_paths(&executable) else {
        return Ok(());
    };
    prepare_paths(&paths)?;
    for (name, path) in paths {
        // main 的第一步执行，此时尚未启动 Tauri、运行时或任何工作线程。
        // 标记文件明确选择独立数据，覆盖宿主继承的同名变量。
        unsafe { std::env::set_var(name, path) };
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unmarked_executable_keeps_installed_behavior() {
        let root = tempfile::tempdir().unwrap();
        assert!(portable_paths(&root.path().join("codex-plus-plus.exe")).is_none());
        assert!(!root.path().join("data").exists());
        std::fs::create_dir(root.path().join(PORTABLE_MARKER)).unwrap();
        assert!(portable_paths(&root.path().join("codex-plus-plus.exe")).is_none());
    }

    #[test]
    fn marked_executable_uses_its_own_directory_after_relocation() {
        let root = tempfile::tempdir().unwrap();
        let original = root.path().join("original");
        let relocated = root.path().join("moved with spaces");
        for directory in [&original, &relocated] {
            std::fs::create_dir(directory).unwrap();
            std::fs::write(directory.join(PORTABLE_MARKER), "").unwrap();
            let paths = portable_paths(&directory.join("codex-plus-plus.exe")).unwrap();
            assert_eq!(
                paths[0],
                ("CODEX_PLUS_STATE_DIR", directory.join("data/state"))
            );
            assert_eq!(
                paths[1],
                ("WEBVIEW2_USER_DATA_FOLDER", directory.join("data/webview"))
            );
            prepare_paths(&paths).unwrap();
            assert!(paths.iter().all(|(_, path)| path.is_dir()));
            assert!(!directory.join("data/codex-home").exists());
        }
    }

    #[test]
    fn initialization_preserves_codex_home() {
        const CHILD_ENV: &str = "CODEX_PLUS_PORTABLE_INITIALIZATION_TEST";
        if std::env::var_os(CHILD_ENV).is_some() {
            let original_home = std::env::var_os("CODEX_HOME");
            let executable = std::env::current_exe().unwrap();
            let root = executable.parent().unwrap();
            initialize().unwrap();
            assert_eq!(std::env::var_os("CODEX_HOME"), original_home);
            assert_eq!(
                std::env::var_os("CODEX_PLUS_STATE_DIR"),
                Some(root.join("data").join("state").into_os_string())
            );
            assert_eq!(
                std::env::var_os("WEBVIEW2_USER_DATA_FOLDER"),
                Some(root.join("data").join("webview").into_os_string())
            );
            assert!(root.join("data/state").is_dir());
            assert!(root.join("data/webview").is_dir());
            assert!(!root.join("data/codex-home").exists());
            return;
        }

        // 在独立子进程验证初始化，避免修改测试进程的全局环境变量。
        let root = tempfile::tempdir().unwrap();
        let executable = root.path().join("portable-test.exe");
        std::fs::copy(std::env::current_exe().unwrap(), &executable).unwrap();
        std::fs::write(root.path().join(PORTABLE_MARKER), "").unwrap();
        for codex_home in [None, Some(root.path().join("existing-codex-home"))] {
            let mut command = std::process::Command::new(&executable);
            command
                .args([
                    "--exact",
                    "portable::tests::initialization_preserves_codex_home",
                ])
                .env(CHILD_ENV, "1");
            if let Some(codex_home) = codex_home {
                command.env("CODEX_HOME", codex_home);
            } else {
                command.env_remove("CODEX_HOME");
            }
            let output = command.output().unwrap();
            assert!(output.status.success(), "{output:?}");
        }
    }

    #[test]
    fn unwritable_layout_fails_instead_of_falling_back_to_user_data() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join(PORTABLE_MARKER), "").unwrap();
        std::fs::write(root.path().join("data"), "not a directory").unwrap();
        let paths = portable_paths(&root.path().join("codex-plus-plus.exe")).unwrap();
        assert!(prepare_paths(&paths).is_err());
    }
}
