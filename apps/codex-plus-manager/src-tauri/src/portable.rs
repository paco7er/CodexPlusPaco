use std::path::{Path, PathBuf};

const PORTABLE_MARKER: &str = "portable.flag";

fn portable_paths(executable: &Path) -> Option<[(&'static str, PathBuf); 3]> {
    let root = executable.parent()?;
    if !root.join(PORTABLE_MARKER).is_file() {
        return None;
    }
    let data = root.join("data");
    Some([
        ("CODEX_PLUS_STATE_DIR", data.join("state")),
        ("CODEX_HOME", data.join("codex-home")),
        ("WEBVIEW2_USER_DATA_FOLDER", data.join("webview")),
    ])
}

fn prepare_paths(paths: &[(&str, PathBuf)]) -> std::io::Result<()> {
    // CODEX_HOME 必须先存在，否则核心路径解析会回退到用户目录。
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
            assert_eq!(paths[0], ("CODEX_PLUS_STATE_DIR", directory.join("data/state")));
            assert_eq!(paths[1], ("CODEX_HOME", directory.join("data/codex-home")));
            assert_eq!(paths[2], ("WEBVIEW2_USER_DATA_FOLDER", directory.join("data/webview")));
            prepare_paths(&paths).unwrap();
            assert!(paths.iter().all(|(_, path)| path.is_dir()));
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
