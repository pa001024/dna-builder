# 深链（`dobapp://`）

与 dob-app（`lib/core/router/deep_link.dart` + `MainActivity.kt` 深链通道 + `app.dart` 引导）同构。
协议名固定 `dobapp`，host 决定「打开什么」，路径段当作参数：

| 深链 | 应用内路径 | 说明 |
|---|---|---|
| `dobapp://open-build/<id>`（或 `?id=`） | `/build/:id` 中转页 | 查到归属角色后 replace 到 `/char/:charId/:buildId` |
| `dobapp://open-dye/<planId>`（或 `?id=`） | `/skin-colorize/:planId` | 方案详情 |
| `dobapp://open-dye`（裸链接） | `/skin-colorize` | 画廊；构筑裸链接无目的地，直接忽略 |

## 改动点（新增链接类型时都要改）

- 纯解析：`apps/web/src/utils/deep-link.ts`（`deepLinkPathFor`，单测见同目录 `.test.ts`）
- 网页路由：`apps/web/src/router.ts`（`/build/:id`→`BuildRedirectView.vue` 落点，其他路径已存在）
- 站内链接口径：`apps/web/src/utils/site-link.ts`（`INTERNAL_PATH_PREFIXES`）
- 桌面端注册：`src-tauri/tauri.conf.json`（`plugins.deep-link.desktop.schemes`）、
  `src-tauri/src/lib.rs`（`single-instance` 必须先于 `deep-link` 注册，對應 `singleTop`）、
  `capabilities/default.json`（`deep-link:default`）
- 启动装配：`apps/web/src/App.vue`（主窗口独占：先订阅 `onOpenUrl` 再读 `getCurrent`，顺序反了会丢热启链接）

## 平台差异（Tauri 插件行为）

- Windows/Linux：点链接会起新进程，参数经 `single-instance`（`deep-link` 特性）转交已运行实例，
  前端统一在 `onOpenUrl` 收到；冷启动走 `getCurrent` 读 CLI 参数。
- macOS：系统直接发事件，`onOpenUrl` 收到。
- 网页版收不到自定义协议：短链 `https://dna-builder.cn/build/<id>` 照常可用（同一中转页）。
