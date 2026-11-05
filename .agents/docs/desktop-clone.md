# 桌面分身（desktop-clone）

在应用内创建一个**与本机控制台并存的 Windows 子会话（child session）**，把该子会话的桌面嵌进一个独立窗口；
游戏/程序在子会话里运行，主桌面的鼠标、焦点与窗口不受影响。

不是窗口镜像、不是同进程多开、也不是远程主机 RDP：子会话由远程桌面 ActiveX 控件
（`mstscax.dll` 的 `ConnectToChildSession`）创建，全系统同时只允许一个。

| 层 | 位置 |
|---|---|
| 后端编排 | `apps/web/src-tauri/src/submodules/desktop_clone/mod.rs` |
| 系统能力检测 | `.../desktop_clone/capability.rs` |
| WTS / 凭据预检 / 孤儿清理 | `.../desktop_clone/session.rs` |
| ActiveX 宿主（COM、属性、事件槽） | `.../desktop_clone/rdp_host.rs` |
| 窗口、原生子窗口定位、关闭拦截 | `.../desktop_clone/viewer.rs` |
| 鼠标捕获与按键投送 | `.../desktop_clone/input.rs` |
| 控制中心投送（Task Scheduler） | `.../desktop_clone/launcher.rs` |
| 设置持久化 | `.../desktop_clone/settings.rs` |
| Tauri 命令 | `apps/web/src-tauri/src/commands/desktop_clone.rs` |
| 前端 | `apps/web/src/views/DesktopCloneView.vue`、`components/desktop-clone/*`、`api/desktop-clone.ts`、`store/desktop-clone.ts` |

## 前置条件

- Windows 10/11 **专业版 / 企业版 / 教育版**（家庭版 `EditionID` 以 `Core` 开头 → 标记为不支持）。
- 应用已以管理员运行（安装清单即 `requireAdministrator`）；`WTSEnableChildSessions` 需要提权。
- `TermService` 可启动（`desktop_clone_prepare` / `connect` 会自动启动并轮询到 running）。
- `atl.dll`（`AtlAxWinInit` / `AtlAxGetControl`）与 `mstscax.dll` 可加载。
- 当前 Windows 账号**设置了密码**：child session 每次创建都需要显式凭据（用户在对话框输入，仅内存）。

不会做的事：不修改 `fDenyTSConnections`、不改防火墙、不动 RDP 用户组、不安装/替换任何系统补丁或 DLL。
唯一会写入的系统状态是 `WTSEnableChildSessions(TRUE)`（系统级开关，保留启用状态）。

## 架构

```
命令层（async + spawn_blocking）
  └── CloneManager（managed state：状态快照 / 设置 / 内存凭据 / 旧会话）
        ├── LIFECYCLE 互斥 + 代次 token：connect / reconnect / close_session / prepare 串行化
        ├── 状态机 CloneState（kebab-case 序列化）
        ├── viewer：Tauri 无边框窗口 + 原生子窗口定位 + 关闭拦截
        └── rdp_host：仅主线程的 COM 宿主（AtlAxWin80 + mstscax）
              └── 事件槽 → handle_rdp_event → 状态推进 → emit_to("desktop-clone")
```

- **线程模型**：COM 指针只存在于主线程 thread-local；跨线程一律 `on_main_sync`（已在主线程则直接执行）。
  控件事件回调发生在 `Connect()` 内部、宿主正被可变借用，因此 `ResetPassword` 与状态推进引发的重排
  都改成 `run_on_main_thread` 延后执行，避免 `RefCell` 重入；只有前端 `await` 的
  `set_overlay_visible` / `set_chrome_height` 同步投递，保证命令返回时布局已生效。
- **原生子窗口**：`WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN | WS_CLIPSIBLINGS`。宿主矩形 = 标题栏以下
  可用区域内**最大的 16:9 矩形并居中**（letterbox）：宽富余时左右黑边、高富余时上下黑边，窗口比例正好
  16:9 时刚好填满、无黑边。标题栏高度由前端上报（默认 44 逻辑 px，按 DPI 换算）。顶层窗口补
  `WS_CLIPCHILDREN`；窗口与 webview 底色设为纯黑，黑边不露出未定义底色。游戏鼠标的 `ClipCursor`
  使用同一 letterbox 矩形。
- **显示层（条状 WebView2）**：windowed WebView2 的不透明 DirectComposition 表面不遵守兄弟 HWND 的
  z-order（airspace），整窗覆盖时会盖住原生 RDP 宿主。因此 `viewer` 缓存 `WRY_WEBVIEW` 子窗口句柄并
  按状态切换两套矩形：
  - `connected` 且没有网页弹层 → WebView2 = `clientWidth × chromeHeight`（只有标题栏可见），
    宿主 = 标题栏以下区域的 16:9 letterbox 矩形且可见；
  - 其余状态（准备/连接/断开/错误/关闭/未连接）或任一网页弹层打开 → WebView2 = 整窗，宿主隐藏。
  两者矩形永不重叠。`Resized` / `ScaleFactorChanged` / 显示 / 置顶 / 最大化 / 还原 / 状态转换 /
  弹层切换后都会重新应用（`SetWindowPos(..., SWP_NOZORDER | SWP_NOACTIVATE)`）；每次应用后再排一次
  60 ms 延迟复核，纠正 wry 在 `WM_SIZE` 之后重新把 WebView2 拉满的情况。找不到 `WRY_WEBVIEW` 时
  短延迟重试（最多 20 次）。`show` / 置顶 / 最大化之后重新补齐顶层 `WS_CLIPCHILDREN`（tao 会重设
  `GWL_STYLE`），`WRY_WEBVIEW` 与 `AtlAxWin` 都补 `WS_CLIPSIBLINGS`。
- **弹层时序**：前端打开任何弹层/菜单前先 `await desktop_clone_set_overlay_visible(true)`（store 的
  `prepareCloneOverlay`），后端同步完成「隐藏宿主 → 展开 WebView2」后才返回，避免弹层被 44px 条状
  视口裁切；关闭后引用计数归零再恢复条状。连接状态下的网页只有 44px 高，`DesktopCloneView` 根节点
  必须 `height:100%` + `overflow:hidden`，且标题栏恰好等于后端上报的 `chromeHeight`。
- **设置文件**：`{app_config_dir}/desktop-clone.json`，`version: 1`，原子写（每次唯一临时文件 + rename）。
  快照与落盘在同一临界区，选项提交也串行化，因此设置页、控制中心、几何防抖并发写入时文件不会回退到旧快照。
  版本高于当前时先备份 `desktop-clone.json.v<N>.bak` 再按默认值启动（不回写）。
- **投送**：控制中心把程序配置注册成 Task Scheduler 临时任务
  （`dna-builder-desktop-clone-<当前会话>-<pid>-<n>`），用 `RunEx(TASK_RUN_USE_SESSION_ID)` 启动到子会话。
  任务一律 `LUA`；勾选「管理员」的条目改为在 LUA 任务里启动 PowerShell
  （`Start-Process -Verb RunAs`），由**子会话内的 UAC 提示**确认提权，绝不使用静默的 `HIGHEST`。
  关闭会话、退出、启动时（清理崩溃残留）都会删除临时任务；启动清理只匹配本进程所在会话的任务前缀，
  不会误删其他用户会话的实例。路径先拒绝 UNC，再 `canonicalize` 解析真实路径并按驱动器类型
  拒绝网络共享（映射盘 / reparse point 不能绕过）。
- **退出清理**：`app_close`、托盘「退出」都会先断开控件、销毁宿主，再把会话注销与任务清理放到后台线程，
  最多等待 4 秒；超时后剩余步骤交由进程退出兜底（设置里的会话标记会保留，下次启动继续清理）。
  窗口销毁同样会注销本应用的子会话。启动时同步执行孤儿清理：只注销「设置里记录的会话 ID ==
  当前 `WTSGetChildSessionId()`」的那一个。

## 用户流程

1. 设置页「桌面分身」分区或托盘菜单「桌面分身」→ 打开克隆窗口（未连接时显示能力清单）。
2. 「启动并连接」→ 输入 Windows 账号密码（留空 = 自动登录 / 当前登录身份）→ 连接。
3. 连接后标题栏出现：鼠标模式、切换窗口、控制中心、置顶、窗口选项、最小化/最大化/关闭。
4. 关闭窗口会弹确认：「隐藏」（保留会话与程序）/「关闭并注销」（结束子会话内所有程序）/「取消」。
   隐藏后可从托盘重新显示。
5. 断线：窗口保留，覆盖层提供「重新连接」与「诊断」。

## 命令与事件（前后端契约）

命令只允许 `main` / `desktop-clone` 两个窗口调用（命令里显式校验 label；加载远端内容的窗口会被拒绝）：

`desktop_clone_status` / `_capability` / `_prepare` / `_open` / `_connect(username, password)` /
`_disconnect` / `_reconnect` / `_close_session(logoff)` / `_hide` / `_get_options` / `_set_options` /
`_set_overlay_visible` / `_set_chrome_height` / `_send_keys(action)` / `_launch_program(id)` / `_diagnose`。

事件（`emit_to("desktop-clone")`，主窗口收不到）：

| 事件 | 载荷 | 说明 |
|---|---|---|
| `desktop-clone:status` | `CloneStatus` | 状态/能力/选项/会话 ID/最近错误 |
| `desktop-clone:credentials-required` | `{ usernameHint }` | 2055 或重连时无缓存凭据 |
| `desktop-clone:close-requested` | `{}` | 需要确认的关闭（准备/连接/已连接/断开，或 `idle`/`error` 但仍追踪存活会话；控件关闭） |
| `desktop-clone:reconnect-required` | `{ reason: "keyboard-hook" \| "mute" }` | 选项已持久化，确认后 `_reconnect()` |
| `desktop-clone:mouse-mode-changed` | `{ relative, degraded? }` | `degraded` 表示控件拒绝相对鼠标，此时 `mouseMode` 已回写 `normal` |

关键语义：

- `connect` 空账号 + 有密码 → 回落到当前登录身份，密码不会被丢弃；空账号空密码 → 尝试自动登录。
- 重连缓存记录「本次实际使用的身份」：自动登录/SSO 时身份为空，重连仍走自动登录，不会被固化成当前用户；
  无身份时连接属性会显式清空 `UserName`/`Domain`，避免复用宿主时沿用它。
- `close_session(false)`：断开控件但**保留**会话 ID 与清理标记（凭据清空），窗口销毁/退出/下次启动仍能追踪并注销。
  连接中/已连接但会话 ID 尚未回写时取消，会先短轮询 `WTSGetChildSessionId()` 并记录，避免留下无追踪的孤儿会话。
- `close_session(true)`：自增代次 → `Disconnect()` → 等待 500 ms → 销毁宿主 → 清理任务 → `WTSLogoffSession` → 回到 `Idle`；
  注销失败会保留标记并把错误返回前端（避免关窗确认反复拦截成死循环）。
- 2055（登录未完成）推进到 `awaiting-credentials` 并清空内存凭据，不是 `error`。
- `OnLogonError(-2)` 与其他登录错误一样挂 5 秒宽限期：期间出现任何控件事件（连接继续推进）就交给后续事件；
  超时仍停在 `connecting` 时，`-2` 回到等待凭据，其他代码落到 `error`，两条路径都会清空控件口令。
- 运行中修改热键路由/静音不会立刻生效：后端持久化后发 `reconnect-required`，由前端确认重连。
- `SendInput` 回退路径会把控件热键路由切到「子会话」并同步持久化 + 推送状态，界面不会继续显示「本机」。
- 复制/握手会复用同一宿主：事件槽按连接代次重挂（`Unadvise` → `Advise`），2055 重试/失败重试不会因旧 sink
  代次失效而永久停在 `connecting`。
- 会话所有权：只有 `connecting`/`connected`/`closing` 信任内存里的会话 ID；其余状态（`idle`/`disconnected`/`error`）
  必须先与 `WTSGetChildSessionId()` 及持久化标记比对，防止 ID 被系统复用后误注销其他程序的新子会话。

## 配置项（`CloneOptions`，默认值）

| 字段 | 默认 | 说明 |
|---|---|---|
| `alwaysOnTop` | `false` | 窗口置顶 |
| `smartSizing` | `true` | 自适应缩放；`false` 为 1:1（控件自带滚动） |
| `aspectLock` | `true` | 手动缩放时把高度校正到「视口 16:9 + 标题栏」（最大化时跳过） |
| `smallWindow` | `"off"` | `off` / `"500"`（画面 500×281）/ `"1280"`（画面 1280×720）；窗口内高 = 画面高度 + 44px 标题栏（325 / 764），选项文案仍显示画面尺寸 |
| `keyboardHook` | `"local"` | 系统热键投递目标：本机 / 子会话 |
| `mouseMode` | `"normal"` | `game` 会锁定并隐藏光标（按住 Alt 临时释放） |
| `muted` | `false` | 子会话音频静音 |
| `programs` | `[]` | 控制中心程序列表（id/name/path/args/elevated） |

几何按模式分别记忆：`geometry.normal` / `geometry.small500` / `geometry.small1280`，位置/尺寸变更
300 ms 防抖落盘；保存的坐标与所有显示器都不相交时居中到主显示器。旧几何无需迁移：首个 `Resized`
会按 `aspectLock` 校正高度，关掉锁定时由 letterbox 保证画面不变形。

## 排障

| 现象 | 处理 |
|---|---|
| `1326` 账号或密码错误 | 凭据错误；确认 Windows 账号密码（不是 PIN） |
| `1327` 账户限制 | 空密码、登录时段限制或账号策略 |
| `2055` 登录未完成 | 会回到等待凭据；确认能在普通 RDP 登录该账号（父会话登录早于 child sessions 启用时也会出现） |
| `2057` 或其他原因码断开 | 覆盖层显示「连接已断开（原因码 N）」。检查子会话是否被外部注销/关机；重新连接即可，反复出现时用诊断查看会话列表与宿主状态 |
| `AtlAxWin` 创建失败 | `atl.dll` 缺失/未注册；诊断里看 atl/mstscax 可用性 |
| 连接后黑屏 / 网页被盖住 | 确认 WebView2 已收成标题栏条（诊断「WebView2: 条状」）、宿主 rect 在标题栏下方、顶层有 `WS_CLIPCHILDREN`；诊断里看 WRY HWND 与 SetWindowPos 结果 |
| 连接后只看得到标题栏、下方是网页底色 | `WRY_WEBVIEW` 没被收缩（找到的句柄失效或 wry 又拉满）：诊断看「WRY HWND」与「延迟复核」；窗口缩放一次可强制重排 |
| 画面被拉伸（方块变长方形） | 诊断看「宿主」矩形与「视口比例」应约为 1.778:1；宿主小于标题栏以下的整块区域、四周有黑边是正常 letterbox |
| 切换窗口/显示桌面无效 | `SendKeys` 可能有签名差异，会回退 `SendRemoteAction` → 本机 `SendInput`；返回 `send-input` 时需把热键路由切到「子会话」，且宿主必须取得键盘焦点，否则直接报错 |
| 游戏鼠标不生效 | 部分系统不接受 `RelativeMouseMode`：选项会回写普通模式并提示；诊断里看钩子/裁剪状态 |
| 管理员投送失败 | 确认程序为本地 `.exe`（拒绝 UNC/映射盘）、Task Scheduler 服务可用；成功投送后需在子会话桌面确认 UAC 提示；诊断里看最近投送结果 |
| 投送后子会话里没有窗口 | 管理员条目会先弹出 UAC，未确认前程序不会启动；取消 UAC 即视为未投送 |
| 上次崩溃后残留会话 | 下次启动按 `activeSessionId` 同步清理；注销失败会保留标记继续重试 |
| 设置文件损坏 | 解析失败按默认值启动；版本更高时先备份再忽略 |

诊断：克隆窗口状态层「诊断」或设置页「桌面分身 → 诊断」，输出能力、会话列表、宿主/输入/投送状态与设置路径，
不含任何凭据。

## 安全

- 密码只存在于命令参数副本、控件 `ClearTextPassword` 与内存凭据（`SecretString` 丢弃时覆写）中：
  不落盘、不写日志、不进错误文案；所有终止路径（失败/2055/登录错误宽限/断开/销毁/关闭）都调用
  `ResetPassword` 并清空缓存；无口令时也会清空控件里的旧口令与旧身份。
- 命令按窗口 label 隔离，只有 `main` 与 `desktop-clone` 可调用，加载远端内容的窗口无法触发投送。
- 投送任务一律 `LUA`，管理员条目通过子会话内的 `Start-Process -Verb RunAs` 触发 UAC，
  不使用 `TASK_RUNLEVEL_HIGHEST`（避免用户可写的 `desktop-clone.json` 变成 UAC 绕过）。
- 不自动开启网络 RDP、不改防火墙、不安装第三方补丁、不修改 `termsrv.dll`。
- 子会话内程序默认普通权限（Task Scheduler LUA）；「以管理员身份启动」是用户在控制中心显式勾选，
  且仍需在子会话里确认 UAC。
- 关闭确认文案明确说明会结束子会话内所有程序。

## 已知限制

- **全系统一个分身**：Windows 只允许一个 child session；重复打开只会聚焦既有窗口。
- **可能出现黑边**：RDP 视口始终是 16:9 的 letterbox，最大化（通常不是 16:9）或关掉 `aspectLock`
  把窗口拉成其他比例时，标题栏以下会出现纯黑边；这是保证画面永不非等比拉伸的代价。窗口最小尺寸
  仍为 500×281（低于 16:9 视口所需高度），此时同样靠黑边兜底。
- **连接时窗口缩放受限**：原生子窗口覆盖 RDP 区域，右侧/下侧/左侧的网页缩放命中区被它盖住，
  实际只能从标题栏上沿或上角拖动；建议用「窗口选项」的 500/1280 预设或最大化。
- **连接时网页只剩标题栏**：整页被 WebView2 条状视口裁切，所有弹层/菜单都要先经
  `set_overlay_visible` 展开 WebView2 再显示（毫秒级 IPC；极端卡顿时可能看到一次短暂等待）。
- **取消连接是尽力而为**：在 `preparing/connecting` 取消走 `close_session(false)`。已经记录到会话 ID 时
  会话保留并计入追踪（下次连接/退出/关窗时注销）；若取消发生在登录完成、拿到 ID 之前，后端会先短轮询
  `WTSGetChildSessionId()` 并写回内存与清理标记；若轮询窗口内仍拿不到（控件尚未创建会话），才会留到
  下次连接时复用并重新记录（系统只允许一个 child session）。
- **退出清理有 4 秒预算**：注销会话与删除投送任务在后台线程执行，超时后由进程退出兜底，标记保留到下次启动。
- **活动会话关窗确认**：`idle`/`error`/`disconnected` 但只要仍追踪着存活子会话，关窗也会要求确认，
  避免静默留下孤儿会话。
- **非 Windows 不支持**：能力检测会返回 unsupported；其余模块未加 `cfg` 门控（仓库只发布 Windows）。
- **需真机验证的路径**：原生子窗口 z-order/重绘、`SendKeys` 实际签名、重连是否复用同一 child session、
  管理员投送在子会话内弹出的 UAC 提示、鼠标相对模式手感、`ResetPassword` 的实际时机。
  诊断与手动验收清单覆盖这些项。
