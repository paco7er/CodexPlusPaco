Codex++ Windows 便携版 v1.11.1.S

解压到可写目录，双击 codex-plus-plus.exe 即可启动，无需安装。
portable.flag 必须与 EXE 放在一起。便携模式启动时自动使用：

data/state       Codex++ 设置、Skills 和运行日志
data/codex-home  Codex 配置、登录信息及会话数据
data/webview     Codex++ 界面缓存

首次启动为空配置，需要选择 Codex 应用并添加供应商或登录。
包内不含个人设置、密钥和聊天记录，不会自动导入已安装版的数据。
需要沿用旧配置时，先退出程序，备份后再将对应数据复制到上述目录。
移动或备份时保留整个文件夹；升级只替换 EXE 和标记，保留 data。

本包包含 Codex++；官方 Codex 应用仍需单独准备，其自身界面缓存由官方应用管理。
本机需要可用的 Microsoft Edge WebView2 Runtime。
已安装版和便携版使用相同的默认单实例端口，请先从托盘退出旧版再运行便携版。
便携模式覆盖继承的 CODEX_HOME、CODEX_PLUS_STATE_DIR 和 WEBVIEW2_USER_DATA_FOLDER。

本分支选择性迁移了 v1.11.1 修复，EXE 内部版本号目前仍为 1.10.1。
