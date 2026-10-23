<p align="center">
  <img src="docs/images/codex-plus-plus.png" alt="Codex++ 图标" width="88">
</p>

# CodexPlusPaco

基于 [CodexPlusPlus](https://github.com/BigPizzaV3/CodexPlusPlus) 的个人定制版。应用内名称仍为 **Codex++**，聚焦 Codex 桌面应用的启动、直连供应商配置、模型上下文、MCP、Skills 与本地会话管理。

当前定制版本为 **v1.11.1.S**，交付 **Windows x64 便携版**。本分支选择性迁移上游 v1.11.1 的修复，并非完整复刻上游功能；EXE 和项目清单中的内部版本号目前仍为 `1.10.1`。

[English](README_EN.md) · [本仓库发布页](https://github.com/paco7er/CodexPlusPaco/releases) · [问题反馈](https://github.com/paco7er/CodexPlusPaco/issues)

## 当前功能

管理器固定使用中文浅色界面，左侧保留五个页面：

| 页面 | 内容 |
| --- | --- |
| 概览 | Codex 版本与运行状态、应用路径选择/替换/移除、插件市场解锁 |
| 供应商配置 | Responses 直连供应商、官方登录或纯 API 配置、模型获取与测试、Provider Doctor |
| MCP | 本地 MCP 配置管理 |
| Skills | 本地技能、技能仓库与安装管理 |
| 会话管理 | 按项目或时间浏览、搜索、查看会话信息、批量归档、单条或批量删除 |

供应商列表**默认空**，不会自动把本机 Codex 配置导入成“系统默认”。升级时保留已经保存的供应商，不会自动删除旧记录。新建供应商只有保存后才会进入列表。

Codex 界面增强仅保留**插件市场解锁**，开关位于概览。它用于在 API Key 模式下尽量显示完整插件列表，不是插件订阅、付费权限或服务端授权的解锁。

### 与上游的区别

- 不提供安装器、应用内更新、推荐页、安装维护页或独立的 Codex 增强页。
- 供应商列表只展示使用 Responses、未配置模型路由的非聚合条目，不提供聚合供应商的创建入口；历史 Chat Completions、路由与聚合配置仍保留，列表不展示不代表已删除。
- 不再提供多开、微信连接、皮肤、桌宠、语音输入、打字特效、用量状态栏、Fast 强制解锁等增强入口；旧增强字段不会因此重新生效。
- 用户脚本不再自动加载，管理器不再提供拓展市场、代理设置和请求日志页面。

供应商配置仍会使用必要的本地协议转换与运行服务。“直连”表示当前供应商管理方式，不表示所有请求都绕过本地运行服务。源码中保留部分上游模块是为了兼容旧数据，不代表它们都是本版开放的功能。

## 便携版上手

1. 准备官方 Codex 桌面应用，以及本机可用的 Microsoft Edge WebView2 Runtime。
2. 将 `CodexPlusPlus-v1.11.1.S-windows-x64-portable.zip` 解压到可写目录。保留 EXE 同级的 `portable.flag`，双击 `codex-plus-plus.exe`。
3. 在“概览”的应用路径行直接选择 `Codex.exe`，不必选择文件夹；可以重新选择覆盖，也可以移除保存路径，恢复自动检测。
4. 如需管理供应商，在“供应商配置”中手动添加，填写地址、Key、协议与模型，再保存并按需切换。也可以保持列表为空，继续使用 Codex 原有配置。
5. 在概览按需设置“插件市场解锁”，再点击“启动 Codex”。修改注入相关设置后，需要从 Codex++ 重新启动 Codex。

仅打开管理器或点击启动，不会自动切换供应商或重写 Codex 的 `config.toml` / `auth.json`。启用“供应商配置切换”后，显式切换供应商或保存当前供应商配置时可能写入这些文件；关闭该开关可阻止供应商应用流程写入。

窗口关闭后会最小化到托盘。运行便携版前，请从托盘退出旧 Codex++；安装版与便携版默认使用相同的单实例端口。

## 模型与上下文

支持按供应商配置模型列表，并为每个模型设置上下文窗口与自动压缩阈值。模型列表也可以使用窗口后缀：

```text
your-model-a[1M]
your-model-b[200K]
your-model-c[128000]
```

后缀支持 `M`、`K` 或纯数字，表示窗口大小，不是模型名称的一部分。示例名称不代表真实模型或服务能力，请按上游实际支持填写。

应用配置时，Codex++ 生成独立的模型目录文件，并通过原生 `model_catalog_json` 指针让 Codex 按模型识别窗口。未单独配置的模型继续使用供应商级上下文设置；原有单值配置仍保持兼容。

## 数据边界

**便携模式只隔离 Codex++ 自己的数据，不接管或迁移 Codex 的主目录。**

```text
CodexPlusPlus-v1.11.1.S-windows-x64-portable/
  codex-plus-plus.exe
  portable.flag
  README.txt
  data/                  # 首次启动后生成，不包含在发布包里
    state/               # Codex++ 设置、Skills 和运行日志
    webview/             # Codex++ 管理器界面缓存
```

| 数据 | 位置与归属 |
| --- | --- |
| 便携版 Codex++ 设置 | EXE 同级 `data/state/` |
| 便携版管理器缓存 | EXE 同级 `data/webview/` |
| 非便携版 Codex++ 的默认状态目录 | `%USERPROFILE%\.codex-session-delete\`，可由 `CODEX_PLUS_STATE_DIR` 指定 |
| Codex 配置、认证与会话 | Codex 自己的主目录，遵循 `CODEX_HOME`；未设置时为 `%USERPROFILE%\.codex\` |
| Codex 会话数据库 | Codex 主目录内的 `sqlite/*.db`，旧版回退 `state_5.sqlite` |

`.codex-session-delete` 是 Codex++ 沿用的历史状态目录名，不是 Codex 自己的配置目录，也不是便携版 `data` 的自动映射。便携版不会自动导入这里的设置。

便携模式会把 `CODEX_PLUS_STATE_DIR` 和 `WEBVIEW2_USER_DATA_FOLDER` 固定到自身的 `data`，**不覆盖 `CODEX_HOME`**。旧便携版遗留的 `data/codex-home` 不会被自动读取、迁移或删除。

这不意味着所有操作都只写入 `data`：显式供应商切换、MCP 配置修改、Skills 安装与会话删除等，会按各自功能修改目标数据。便携模式不是 Codex 配置或会话的沙箱。

### 迁移与升级

先从托盘退出程序，再备份后操作：

- 升级便携版：替换 EXE、`portable.flag` 和随包说明，保留整个 `data` 目录。
- 移动便携版：移动整个解压目录；Codex 自身的数据不随之移动。
- 沿用安装版设置：确认旧版实际状态目录，将其内容复制到便携版 `data/state`，不是复制到 `data` 根目录；不同版本可能保留更多旧字段。
- 备份会话：除了 `data`，还要单独备份 Codex 主目录。会话删除会创建本地备份，仍建议先关闭对应会话并保留额外备份。

设置文件可能含 API Key 或认证快照，不要把 `data`、`.codex-session-delete`、`auth.json` 或带凭据的配置提交到仓库。

## 开发与打包

技术栈为 Rust、Tauri 2、React 与 TypeScript。本分支当前交付目标是 Windows x64；仓库保留上游其他平台代码，不代表已为本定制版本构建或验证对应安装包。

| 目录 | 职责 |
| --- | --- |
| `apps/codex-plus-manager/` | 管理器前端与 Tauri 桌面入口 |
| `apps/codex-plus-launcher/` | 内置启动与注入运行库 |
| `crates/codex-plus-core/` | 设置、供应商配置、模型目录与运行服务 |
| `crates/codex-plus-data/` | 本地会话与数据持久化 |
| `assets/inject/` | Codex 界面注入代码与保留的上游资源 |
| `scripts/` | 构建、便携打包与本地实例维护 |
| `docs/` | 设计与调研文档，部分为上游历史资料 |

先准备 Node.js/npm、Rust 和 Tauri 所需的 Windows 构建环境。在 `apps/codex-plus-manager` 使用锁文件安装依赖；不要将安装步骤混入日常检查。全量前端测试包含上游 macOS 打包模拟用例，Windows 上需将 Git for Windows 的 `bin` 目录加入测试进程的 `PATH`，使其找到 Git Bash，而不是 WSL 的 `bash.exe`。

依赖就绪后，在仓库根目录执行：

```powershell
npm --prefix apps/codex-plus-manager run check
npm --prefix apps/codex-plus-manager test
npm --prefix apps/codex-plus-manager run vite:build
cargo test -p codex-plus-core
cargo test -p codex-plus-manager
cargo build --release -p codex-plus-manager --bin codex-plus-plus
./scripts/package-windows-portable.ps1 -Version 'v1.11.1.S'
```

产物位于 `dist/portable/`。打包脚本只包含 EXE、标记和说明，不包含个人 `data`；遇到同名目录或 ZIP 会拒绝覆盖，请先备份旧包。不要把调试构建作为便携发行包。

Windows 固定本地验证入口为 `dist/local-build/codex-plus-plus.exe`，更新时只替换 EXE、保留数据，再启动验证。`scripts/relaunch-local.mjs` 当前是 macOS bundle 流程，不适用于 Windows。

修改 renderer 注入分片后，须运行 `node scripts/assemble-renderer-inject.mjs` 组装产物。本地历史构建只通过 `node scripts/prune-local-builds.mjs --apply` 清理。工作规范见 [AGENTS.md](AGENTS.md)。

## 反馈与来源

本定制版的问题请提交到 [CodexPlusPaco Issues](https://github.com/paco7er/CodexPlusPaco/issues)，附上包名、Windows 与 Codex 版本、复现步骤和脱敏日志，不要直接上传个人数据目录。旧截图和 `docs/` 中的上游功能指南可能不适用于当前界面，以本说明及实际代码为准。

感谢 [BigPizzaV3/CodexPlusPlus](https://github.com/BigPizzaV3/CodexPlusPlus) 及其贡献者。本仓库保留上游版权与第三方声明，不将上游代码或素材声明为原创。

## 许可证

Copyright (C) 2026 BigPizzaV3。定制修改沿用 [GNU AGPL v3.0](LICENSE)，SPDX：`AGPL-3.0-only`。分发修改版或通过网络提供服务时，须按许可证要求提供对应源代码。

第三方内容见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 及各资源目录内的声明；保留的挂件资源另见其 [LICENSE](assets/inject/upstream/whale-widget/LICENSE) 和 [PROVENANCE.md](assets/inject/upstream/whale-widget/PROVENANCE.md)。本项目不是 OpenAI 官方产品，不授予 OpenAI、ChatGPT、Codex 商标或官方应用资源的权利。
