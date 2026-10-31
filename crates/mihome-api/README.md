# mihome-api（内置副本）

米家云协议 + `MiHomeService` 编排，从 `E:/dev/mijia-rs/crates/mijia-api` 原样 vendoring
（类型名前缀 `Mijia` → `MiHome`，其余源码不动，含 SPDX 头）。

- 上游：Python `Do1e/mijia-api v5` → Rust 移植见 mijia-rs `AGENTS.md §3`。
- 用途：桌面端「米家联动」——扫码登录、手动场景列表/执行，不依赖外部服务进程。
- 登录态落盘：`<app_data>/mihome/auth.json`（与 `~/.config/mijia-api/auth.json` 格式互通，
  手动拷贝即迁移）。

**许可证：GPL-3.0-or-later**（随上游）。静态链接进桌面端二进制后，发行时需整体
履行 GPL 义务；同步上游修复时请整目录覆盖并注明来源提交。
