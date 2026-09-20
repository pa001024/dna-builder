---
name: admin-management-page
description: 在 dna-builder 里新增一个 /admin 后台管理页（侧边栏菜单 + 路由 + REST 封装 + 统计卡/筛选卡/表格/分页 + 详情弹窗），并在本地实测验证。当需要给后台加新的管理页面、或改动 src/admin/ 下的页面结构时使用。
agent_created: true
---

# 新增后台管理页

`src/admin/` 下有 15+ 个同构管理页（`UserManagement.vue`、`RankingManagement.vue` …），
改造或新增前先挑一个**同类**的读一遍当模板，别从零写。

## 两类页面，先分清

| 类型 | 适用 | 落点 |
| --- | --- | --- |
| GraphQL CRUD | 增删改查挂在 GraphQL schema 上的普通实体 | **不写页面**，往 `src/admin/crud-config.ts` 加一段配置，复用 `AdminCrudPage.vue` |
| 自定义 REST 页 | 数据不在数据表里（文件分片、外部服务、聚合统计） | 新建 `src/admin/<Feature>Management.vue`，按下面的配方 |

判据：数据是「数据库里的一行」→ 配 CRUD；是「磁盘文件 / 日志 / 外部接口」→ 自定义页。

## 改动清单（自定义 REST 页）

1. **`src/api/<feature>.ts`** — REST 封装，抄 `src/api/modShare.ts` 的写法：
   - 内部一个 `request<T>(path, token, params?, init?)`：拼 `${env.apiEndpoint.replace(/\/$/, "")}/api/v1/<...>`、
     用 `URLSearchParams` 丢空值、头带 `token`、非 2xx 或 `{success:false}` 统一抛 `Error(error 文案)`。
   - 导出**具名函数**（`listXxx` / readXxx / …），每个都要 JSDoc；不要把接口类型塞进 `src/api/app.ts`（那里只 re-export）。
2. **`src/admin/<Feature>Management.vue`** — 页面本体，结构固定四段：
   统计卡（`grid` 一排 4 张）→ 筛选卡（起止日期/关键字/下拉 + 查询/重置）→ 结果表 → `PageFoot`。
3. **`src/router.ts`** — 在 `/admin` 的 `children` 里加**懒加载**路由：
   `{ name: "admin-<kebab>", path: "<kebab>", component: () => import("./admin/<Feature>Management.vue") }`
4. **`src/admin/AdminLayout.vue`** — `menuItems` 数组加 `{ name: "中文菜单名", path: "/admin/<kebab>", icon: "ri:xxx-line" }`。

## 硬约定（踩过）

- **图标必须在 `src/components/Icon.vue` 注册**，否则全量 vue-tsc 报 `TS2820`（`Type '"ri:xxx"' is not assignable`）。
  用项目工具加：`bun tools/icon-tool.ts add ri:xxx-line`，别手改那个大对象。
- **组件是全局自动注册的**（`unplugin-vue-components`）：`Icon` / `Dialog` / `ScrollArea` / `PageFoot` 直接用，
  **不要写 import**，写了反而与同目录文件不一致。
- **`Dialog.vue` 的 `max-w-[450px]` 是写死的**。要放整段对话 / 大表格这类宽内容时，自绘遮罩
  （`fixed inset-0 z-100 flex items-center justify-center bg-gray-900/50 p-4` + 内层 `w-full max-w-6xl max-h-[88vh] flex flex-col`），
  改成 `Dialog` 加宽会波及其它调用方。
- **页面里的用户可控文本一律 `{{ }}` 插值，禁止 `v-html`**（日志、标题、错误原文都属于用户可控）。
- **分页是两条独立的轴**：`PageFoot` 只管「当前已加载集合」的翻页；
  服务端 `limit`（默认 200 / 上限 2000）是另一条——返回带 `truncated` 时，底部给「加载更早记录」按钮，
  点了把 limit **翻倍**重查。别把两者混成一个。
- **统计接口失败不能挡住列表**：`loadStats` 与 `search` 分开 `try/catch`，各自降级。
- **加减列时 `thead th` 与 `tbody td` 必须同增同减**（列数错位不会报错，只会静默串列）。
  探针里别硬编码列序号：`const i = headers.indexOf("列名")` 再按 `row.children[i]` 取值。
- **长标识类取值（trace id / 会话 id / 哈希）的展示规格**：列表里只显示前 10 位加省略号，
  完整值挂 `title`，**点一下复制完整值**——半截值对排查没用，全值又排不进一列。
- **复制统一走 `copyText(text, label)`**（`AiLogManagement.vue` / `AiLogSessionDialog.vue` 各一份），
  不要再写 `copyXxx()` 那种单用途 helper，提示文案由 `label` 拼。

## 验证

1. 类型/lint：增量 lint 是最省的路径
   ```bash
   DNA_LINT_NODE="<managed node 绝对路径>" bun tools/incremental-lint.ts
   ```
   环境声明文件（`*.d.ts`、`vite-env.d.ts`、`components.d.ts`）被判为有改动时会**退回全量**，属正常。
   整项目 `vue-tsc` 会因大工程把 V8 打崩（exit 134），别单独去跑它。
2. 布局必须**量出来**，不靠肉眼：探针脚本放 `.tmp/*.mjs`，读 `getBoundingClientRect` / `getComputedStyle`，
   断言 `table.getBoundingClientRect().width <= document.documentElement.clientWidth`（无横向溢出）。
   - 脚本用 `import { chromium } from "@playwright/test"` —— 仓库里**没有**裸 `playwright` 包。
   - ⚠️ **提交进仓库的 e2e 用 `bun-webview-test`（`.agents/skills/bun-webview-test`），Playwright 只用于 `.tmp` 里的临时探针。**
   - 后端在**生产域**（`env.apiEndpoint`）时，本地页面发不出可用的真实请求 →
     用 `page.route("**/api/v1/<...>/**", …)` 拦截并喂 fixture，别去请求真接口。
   - 点击前先清遮挡层：`document.querySelectorAll("dialog").forEach(n => n.remove())` + 移除 `.modal-backdrop`。
     数据包安装弹窗是**异步挂载**的，会重新出现——`page.screenshot` 之前**再清一次**，否则截图上糊一层弹窗。
3. 开发服务器固定 `http://localhost:1420`，**不要自己起 dev/build**。
