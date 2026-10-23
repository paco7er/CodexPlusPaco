<p align="center">
  <img src="docs/images/codex-plus-plus.png" alt="Codex++ icon" width="88">
</p>

# CodexPlusPaco

A personal customization of [CodexPlusPlus](https://github.com/BigPizzaV3/CodexPlusPlus). The application is still named **Codex++**. This fork focuses on launching the Codex desktop app, direct providers, per-model context settings, MCP, Skills, and local sessions.

The custom release is **v1.11.1.S**, delivered as a **Windows x64 portable ZIP**. It selectively incorporates upstream v1.11.1 fixes rather than mirroring the full upstream feature set. The executable and project manifests still report the internal version `1.10.1`.

[中文](README.md) · [Fork releases](https://github.com/paco7er/CodexPlusPaco/releases) · [Report an issue](https://github.com/paco7er/CodexPlusPaco/issues)

## Current Scope

The manager has a fixed Chinese, light-theme interface with five pages:

| Page | Capabilities |
| --- | --- |
| Overview (概览) | Codex version and app status, executable path selection/replacement/removal, plugin marketplace unlock |
| Providers (供应商配置) | Direct Responses providers, official login or pure API configuration, model discovery and tests, Provider Doctor |
| MCP | Local MCP configuration |
| Skills | Local skills, repositories, and installation management |
| Sessions (会话管理) | Project/time views, search, session details, batch archiving, individual and bulk deletion |

The provider list **starts empty**. Loading settings does not import the local Codex configuration as a "system default" provider. Saved providers survive upgrades; existing entries are not automatically removed. New provider drafts enter the list only when saved.

The only retained Codex UI enhancement is **plugin marketplace unlock**, controlled from Overview. It attempts to display the full plugin list in API-key mode; it does not bypass paid access, subscriptions, or server-side authorization.

### Differences From Upstream

- No installer, in-app updater, recommendations, Maintenance page, or separate Codex Enhancements page.
- The provider list only displays non-aggregate Responses profiles without model routes. Legacy Chat Completions, routed, and aggregate profiles remain stored; hiding them does not delete them. There is no aggregate-provider creation entry.
- Multi-launch, WeChat integration, skins, desktop widgets, dictation, typing effects, usage status lines, and forced native Fast unlock are not offered. Retained legacy enhancement fields do not reactivate those features.
- User scripts no longer load automatically. The extension marketplace, proxy settings, and request-log pages are removed.

Provider configuration still uses local protocol conversion and runtime services when needed. "Direct" describes the manager's provider workflow, not a guarantee that every request bypasses local services. Retained upstream modules support compatibility and are not a list of enabled features.

## Portable Quick Start

1. Prepare the official Codex desktop app and a working Microsoft Edge WebView2 Runtime.
2. Extract `CodexPlusPlus-v1.11.1.S-windows-x64-portable.zip` into a writable directory. Keep `portable.flag` next to `codex-plus-plus.exe`, then run the EXE.
3. In Overview, select `Codex.exe` directly rather than its folder. Re-selecting replaces the saved path; removing it restores automatic detection.
4. To manage a provider, add one manually and configure its URL, key, protocol, and models. Save it, then switch when needed. Leaving the list empty continues to use Codex's existing configuration.
5. Set plugin marketplace unlock in Overview if desired, then click "启动 Codex". Restart Codex from Codex++ after changing injection-related settings.

Opening the manager or launching Codex does not automatically switch providers or rewrite Codex's `config.toml` / `auth.json`. With provider switching enabled, explicitly switching providers or saving the active provider can apply configuration to these files. Disabling provider switching prevents these provider-apply writes.

Closing the window minimizes the manager to the system tray. Exit the older Codex++ instance from its tray before running the portable edition: installed and portable editions share the default single-instance ports.

## Models And Context

Provider profiles support model lists, per-model context windows, and auto-compact limits. A model list can also declare a window through a suffix:

```text
your-model-a[1M]
your-model-b[200K]
your-model-c[128000]
```

`M`, `K`, and plain integer values specify the context window, not part of the model name. These are placeholder names, not claims about actual model availability or capabilities.

When configuration is applied, Codex++ generates a model catalog and uses the native `model_catalog_json` pointer so Codex can recognize each model's window. Models without individual limits keep provider-level settings; existing single-value settings remain compatible.

## Data Boundaries

**Portable mode isolates Codex++ data only. It does not take over or migrate the Codex home directory.**

```text
CodexPlusPlus-v1.11.1.S-windows-x64-portable/
  codex-plus-plus.exe
  portable.flag
  README.txt
  data/                  # Created at first launch, not included in the ZIP
    state/               # Codex++ settings, Skills, and runtime logs
    webview/             # Manager UI cache
```

| Data | Location |
| --- | --- |
| Portable Codex++ settings | `data/state/` beside the EXE |
| Portable manager cache | `data/webview/` beside the EXE |
| Default non-portable Codex++ state | `%USERPROFILE%\.codex-session-delete\`, overridable with `CODEX_PLUS_STATE_DIR` |
| Codex configuration, auth, and sessions | Codex's own home: `CODEX_HOME`, or `%USERPROFILE%\.codex\` when unset |
| Codex session databases | `sqlite/*.db` inside Codex home, with legacy `state_5.sqlite` fallback |

`.codex-session-delete` is a historical Codex++ state-directory name, not Codex's own configuration directory or an automatic mapping to portable `data`. Portable mode does not automatically import settings from it.

Portable mode overrides `CODEX_PLUS_STATE_DIR` and `WEBVIEW2_USER_DATA_FOLDER` to use its own `data` directory, but **does not override `CODEX_HOME`**. A legacy `data/codex-home` directory is not automatically read, migrated, or deleted.

Not every operation writes only to `data`: explicit provider configuration changes, MCP edits, Skills installation, and session deletion modify their respective target data. Portable mode is not a sandbox for Codex configuration or sessions.

### Migration And Upgrades

Exit from the tray and make backups before changing files:

- Upgrade: replace the EXE, `portable.flag`, and package instructions, preserving all of `data`.
- Relocate: move the entire extracted directory. Codex's own data does not move with it.
- Import installed settings: confirm the old instance's actual state directory, then copy its contents into `data/state`, not the `data` root. Other versions may retain additional legacy fields.
- Back up sessions separately: preserve Codex home as well as portable `data`. Session deletion creates local backups, but close affected sessions and keep an additional backup first.

Settings may contain API keys or authentication snapshots. Never commit personal `data`, `.codex-session-delete`, `auth.json`, or credential-bearing configuration.

## Development And Packaging

Built with Rust, Tauri 2, React, and TypeScript. The current delivery target is Windows x64. Other platform code remains from upstream; that does not mean this custom release has been built or verified for those platforms.

| Directory | Purpose |
| --- | --- |
| `apps/codex-plus-manager/` | React UI and Tauri entry point |
| `apps/codex-plus-launcher/` | Embedded launch and injection runtime |
| `crates/codex-plus-core/` | Settings, providers, model catalogs, runtime services |
| `crates/codex-plus-data/` | Local sessions and persistence |
| `assets/inject/` | Injection code and retained upstream assets |
| `scripts/` | Builds, portable packaging, and local-instance maintenance |
| `docs/` | Design and research, including historical upstream documents |

Prepare Node.js/npm, Rust, and the Windows prerequisites for Tauri. Install frontend dependencies from the lockfile in `apps/codex-plus-manager` as a separate setup step. The full frontend suite includes upstream macOS packaging simulations. On Windows, put the Git for Windows `bin` directory on the test process's `PATH` so these tests find Git Bash rather than WSL's `bash.exe`.

With dependencies available, run from the repository root:

```powershell
npm --prefix apps/codex-plus-manager run check
npm --prefix apps/codex-plus-manager test
npm --prefix apps/codex-plus-manager run vite:build
cargo test -p codex-plus-core
cargo test -p codex-plus-manager
cargo build --release -p codex-plus-manager --bin codex-plus-plus
./scripts/package-windows-portable.ps1 -Version 'v1.11.1.S'
```

Outputs go to `dist/portable/`. The packager includes only the EXE, marker, and instructions, never personal `data`. It refuses to overwrite an existing output directory or ZIP; back up older packages first. Do not distribute debug builds as the portable release.

The fixed Windows verification entry point is `dist/local-build/codex-plus-plus.exe`. Replace only its EXE, preserve data, then launch it to verify changes. `scripts/relaunch-local.mjs` currently targets macOS bundles, not Windows.

After editing renderer injection fragments, run `node scripts/assemble-renderer-inject.mjs`. Use only `node scripts/prune-local-builds.mjs --apply` for historical local-build cleanup. See [AGENTS.md](AGENTS.md) for repository working rules.

## Support And Attribution

Report custom-version issues to [CodexPlusPaco Issues](https://github.com/paco7er/CodexPlusPaco/issues) with the package name, Windows/Codex versions, reproduction steps, and redacted logs. Do not upload personal data directories. Old screenshots and upstream guides under `docs/` may not match this fork; use this README and current code as the reference.

Thanks to [BigPizzaV3/CodexPlusPlus](https://github.com/BigPizzaV3/CodexPlusPlus) and its contributors. Upstream copyright and third-party notices are preserved; upstream code and assets are not claimed as original work.

## License

Copyright (C) 2026 BigPizzaV3. Custom modifications retain the [GNU AGPL v3.0](LICENSE), SPDX `AGPL-3.0-only`. Provide corresponding source code when distributing modified versions or offering them over a network, as required by the license.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and resource-specific notices. Retained widget assets have their own [LICENSE](assets/inject/upstream/whale-widget/LICENSE) and [PROVENANCE.md](assets/inject/upstream/whale-widget/PROVENANCE.md). This is not an official OpenAI product and grants no rights to OpenAI, ChatGPT, Codex trademarks, or official application assets.
