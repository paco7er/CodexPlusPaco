# CodexPlusPaco 文档入口

原文件是上游功能展示的独立预览稿，包含本定制版已移除的页面、安装方式和增强功能。为避免两套说明相互冲突，这里不再维护另一份完整 README。

- [中文说明](README.md)：当前功能、便携使用、模型上下文、数据目录、迁移与开发打包。
- [English](README_EN.md)：与中文说明对应的英文文档。
- [便携包内说明](assets/windows-portable/README.txt)：解压运行与数据保留注意事项。
- [仓库工作规范](AGENTS.md)：开发与本地验证约定。
- [许可证](LICENSE) 与 [第三方声明](THIRD_PARTY_NOTICES.md)。

当前版本为 **v1.11.1.S Windows x64 便携版**，应用名称仍为 Codex++。界面只保留概览、供应商配置、MCP、Skills 和会话管理；Codex 界面增强只保留概览里的插件市场解锁。

供应商默认空，已有记录保留。便携模式的数据位于 EXE 同级的 `data/state` 与 `data/webview`，不会接管 `CODEX_HOME`。

`docs/images/readme-preview/` 中的旧展示图片作为历史资源保留，不代表当前版本的界面或功能承诺。后续调整项目说明时，请直接更新中文和英文主文档。
