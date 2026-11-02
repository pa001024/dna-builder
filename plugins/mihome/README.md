# mihome 自动化动作插件

执行米家手动场景（米家 APP → 智能 → 手动控制）：`mihome.run-scene`。

登录态保存在 `localStorage["mihome.auth"]`（见 `index.ts` 的 `LocalStorageTokenStore`），扫码流程由宿主 UI 经 `@pa001024/mihome-api` 的 `MiHomeClient.qrBegin/qrWait` 完成。

## 破坏性变更说明

旧的桌面端登录态文件 `<app_data>/mihome/auth.json` 已废弃：WebView 内无法再通过 Tauri 命令读写它，
且 Rust 协议实现（`crates/mihome-api`）已随本次移植删除。升级后需要用米家 APP 重新扫码登录一次，
token 将写入上述 `localStorage` 键。
