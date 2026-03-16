---
name: dna-builder-script-mcp-debug
description: Use when an AI agent needs to debug dna-builder script runtime through the script MCP server, including running/stopping scripts, checking runtime state, reading status/console, finding the default script directory, and iterating a closed-loop workflow from single-frame capture to state-machine tuning.
---

# DNA Builder Script MCP Debug Skill

当任务涉及 `script MCP`、脚本调试、`run/stop/status/console`、单帧抓取、状态机迭代、或者"某个脚本为什么没跑起来/为什么卡住"时，默认使用这个 skill。

核心目标不是描述功能，而是把调试做成闭环：找到脚本 → 跑起来 → 看运行态 → 看 status → 看 console → 改脚本 → 重跑 → 再次验证。

---

## MCP 工具一览

| 工具                       | 用途                                               |
| -------------------------- | -------------------------------------------------- |
| `get_runtime_info`         | 查看当前运行态：是否有脚本在跑、跑了几个、路径列表 |
| `run_script`               | 启动脚本文件（长生命周期）                         |
| `exec_script`              | 同步即时执行一段代码（不落文件，等执行完再返回）   |
| `stop_script`              | 停止指定脚本                                       |
| `read_status`              | 读取脚本 `setStatus` 输出                          |
| `read_console`             | 读取脚本 `console.log` 输出                        |
| `clear_script_mcp_cache`   | 清除指定脚本的 status + console 缓存               |
| `clear_script_mcp_status`  | 只清 status 缓存                                   |
| `clear_script_mcp_console` | 只清 console 缓存                                  |

如果当前会话已接入 MCP，优先直接调这些工具，不要手搓 HTTP。

---

## 默认脚本目录

- 默认目录：`Documents/dob-scripts`
- 传文件名时，后端自动拼为 `Documents/dob-scripts/<name>.js`
- 也支持绝对路径——当你怀疑默认目录解析有误时，直接用绝对路径，不要猜

---

## 两阶段工作流

两个阶段目标不同，不要混着做。

**判断标准**：还没走通真实操作路径时，停留在 Phase 1；只有当流程、状态切分、关键动作都已基本明确后，才进入 Phase 2。

### Phase 1：实时交互——当 GUI Agent 用

**目标**：直接操作游戏，通过截图判断状态，先把一套真实流程走通。

**核心工具**：`exec_script`、`request_help`

**关键语义**：`exec_script` 是同步即时执行——不落临时文件，等执行完才返回，console 输出直接看返回值。

**原则**：

- 不落调试脚本文件，一切用 `exec_script` 完成
- 截图用 `imwrite` 落盘，再由 agent 直接查看图片
- 需要用户精确确认时才用 `request_help`
- 先闭环真实操作路径，再总结状态和动作

**典型节奏**：

1. `exec_script` 截图并 `imwrite`
2. 查看缩略图判断当前场景
3. `exec_script` 执行一次点击 / 按键
4. 再截图确认是否进入下一页
5. 重复直到整套流程走通

**这一步要回答的问题**：

- 当前页面长什么样？
- 下一步应该执行什么动作？
- 哪些状态切分是稳定的？
- 哪些坐标、ROI、判据是可信的？

这些问题没稳定之前，不要进入 Phase 2。

Phase 1 结束时，agent 应强制产出一份**场景-动作表**，格式可以是：

```markdown
| 场景   | 判据（ROI / 像素 / 文字）      | 动作               | 预期下一场景 | 已验证截图           |
| ------ | ------------------------------ | ------------------ | ------------ | -------------------- |
| 登录页 | (800,450) 附近有"开始游戏"按钮 | mc(hwnd, 800, 500) | 主城         | scene_login_full.png |
| 主城   | 左上角有体力条                 | mc(hwnd, 1400, 50) | 背包         | scene_main_full.png  |
```

这张表就是 Phase 2 写状态机的直接输入——不是"回忆一下刚才做了什么"，而是每走通一步就往表里填一行。

**附带收益**：Phase 1 的"什么时候才算走通"也有了客观标准——表填完、每行都有已验证截图时，才进 Phase 2。

### Phase 2：脚本编写——固化为状态机

**目标**：把 Phase 1 跑通的真实流程固化为可重复执行的脚本。

**核心工具**：`run_script`、`stop_script`、`read_status`、`read_console`、`clear_script_mcp_cache`

**原则**：

- 先写 state，再写 action，每次只扩一小步
- 所有状态都要有可观测输出

**最少产出**：

- 状态枚举或等价的识别分支
- 每个状态的进入判据
- 每个状态对应的动作
- 从人工闭环中抽象出的跳转关系

---

## 截图与图片约定

### 固定路径，不要每轮现编

| 文件                      | 用途                 |
| ------------------------- | -------------------- |
| `imgs/latest_full.png`    | 当前轮全图临时文件   |
| `imgs/latest_thumb.png`   | 当前轮缩略图临时文件 |
| `imgs/scene_xxx_full.png` | 确认语义后的保留文件 |

**流程**：

1. 每次 `exec_script` 至少输出全图 + 缩略图到固定临时路径
2. 先看 `latest_thumb.png` 做粗判
3. 确认值得保留时，再把 `latest_full.png` 复制为语义化命名（如 `scene_login_full.png`）

### 截图代码示例

```js
const hwnd = getCGWindow() || getWindowByProcessName("EM-Win64-Shipping.exe")
if (!hwnd) throw new Error("未找到窗口")
checkSize(hwnd)
const img = captureWindowWGC(hwnd)
imwrite("imgs/latest_full.png", img)
const thumb = img.resize(400, 225, "area")
imwrite("imgs/latest_thumb.png", thumb)
```

### 高频调试时优先缩略图

进入长循环观察、unknown 分支诊断、粗粒度状态判断阶段时：

1. 默认看缩略图
2. 需要细查时看 1–2 个固定 ROI
3. 只有确实需要像素级精查时才上整帧

> 一句话：粗判看缩略图，精查看 ROI，整帧只作临时取证。

---

## 坐标系与点击定位

识别和定位是两层能力，不要混用：

- **识别**：图里哪个控件是目标
- **定位**：给出脚本可直接执行的绝对坐标

**坐标系规则**：

- 当前 dob-script 调试的截图坐标系固定为 `1600×900`，左上 `(0,0)`，右下 `(1600,900)`
- 在原始固定截图上可以直接给绝对坐标
- 如果图片经过缩放、裁切、二次截图，不要把视觉估计当成脚本坐标
- 坐标系一旦确认，后续轮次不要无故退回到"坐标系可能不对"的假设

**取坐标优先级**：

1. 前端直接点图取点
2. 前端框选取区域
3. 在已明确坐标系的原始图上给绝对坐标
4. 最后才是人工试探

---

## `request_help` 使用边界

`request_help` 解决的是"目标是谁"，不是"帮我取每个坐标"。

**该用的场景**：

- 看了全图、缩略图、必要 ROI 后仍无法确定要点哪个控件
- 目标语义不明确，需要用户直接指认
- 继续让模型猜只会在多个候选目标间摇摆

**不该用的场景**：

- 已知要点哪个控件，只差精确坐标
- 已有固定坐标系，只是在原始 `1600×900` 图上取点
- 不存在目标语义歧义

**输入方式**：传 `script_path + status_title` 或 `image_path`，不要输出整段 base64。

---

## 调试阶段不要接 `readConfig`

`readConfig` 是给最终用户创建配置 UI 的，不是调试态临时读参接口。

**调试阶段**：直接在脚本顶部写内联常量，或集中放到 `const config = { ... }`。

**迁移时机**：脚本行为稳定，确认需要给用户调节时，再把少量稳定参数迁移到 `readConfig`。

> 判断标准：为 agent 调试方便的参数不用 `readConfig`，为最终用户长期配置的参数才用。

---

## 推荐工作流

### 1. 先确认运行态

第一步永远先调 `get_runtime_info`，确认三件事：

- 当前是否有脚本在跑
- 跑了几个
- 路径是不是你以为的那个

有旧脚本残留时，先决定是并行观察还是先停掉。

### 2. Phase 1：用 `exec_script` 跑通真实流程

1. `exec_script` 截图并输出全图 + 缩略图
2. 先看缩略图判断当前场景
3. `exec_script` 执行点击 / 按键 / 取色
4. 必要时 `read_status` / `read_console` 辅助
5. 重复直到流程走通

### 3. Phase 2：用 `run_script` 启动脚本

1. `run_script`
2. `get_runtime_info` 确认启动成功
3. `read_status` 看状态
4. `read_console` 看日志

如果 `run_script` 返回成功但 `running=false`，优先怀疑脚本立即退出、路径错误、启动即抛异常——直接看 `read_console`，不要猜。

### 4. 用 status 和 console 分层观察

**分工**：

- `console.log`：记录"发生了什么"
- `setStatus`：展示"当前停在什么状态"

**推荐 status key**：

| Key        | 含义       |
| ---------- | ---------- |
| `state`    | 大状态     |
| `substate` | 细分步骤   |
| `fps`      | 循环频率   |
| `img`      | 当前观察图 |
| `result`   | 识别结果   |

**分层排查**：

| 现象             | 定位方向             |
| ---------------- | -------------------- |
| 没日志           | 脚本可能根本没跑     |
| 有日志没状态     | `setStatus` 没走到   |
| 有状态没图       | 抓图或分支有问题     |
| 图正常但结果不对 | 识别逻辑有问题       |
| 结果对但动作不对 | 状态机或输入链有问题 |

### 5. 单帧抓取优先，不要直接写整套状态机

先做"静态观察"——只抓帧不执行输入：

1. 找窗口句柄：`getCGWindow()` 或 `getWindowByProcessName()`
2. `captureWindow` / `captureWindowWGC`
3. `setStatus("img", frame)`
4. `console.log` 输出判定值

> 先把"看见了什么"做对，再写"要做什么"。

### 5.5 图片识别和点击坐标的边界

要把这件事分清：

- 识别出“图里哪个控件是目标”
- 给出脚本可直接执行的绝对点击坐标

这是两层能力，不要混用。

默认规则：

- 如果没有明确坐标系，不要仅凭图片语义去猜 `mc(hwnd, x, y)`
- 如果图片经过聊天界面缩放、裁切、二次截图，不要把视觉估计直接当成脚本坐标
- 对当前这类 dob-script 调试，截图和坐标系固定为原始 `1600x900` 是公理：左上是 `(0,0)`，右下是 `(1600,900)`，可以直接基于这张图给出绝对坐标
- 不要在后续轮次重新退回到“坐标系可能不对”的假设，除非有直接证据表明输入图不是这类原始固定截图

也就是说：

- 坐标系不明确：只能说“识别到目标区域”，不能声称拿到了精确脚本点位
- 坐标系明确：可以直接输出推荐点击点和按钮矩形范围

调试时优先级：

1. 前端直接点图取点
2. 前端框选取区域
3. 在已明确坐标系的原始图上给绝对坐标
4. 最后才是人工试探点位

不要反过来。

### 5.6 只有真正不知道该点哪里时才用 `request_help`

`request_help` 不是常规取坐标工具。

只有当问题已经退化成下面这种情况时才使用：

- 看了全图、缩略图、必要 ROI 之后，仍然不能确定真正要点的是哪个控件
- 目标语义本身不明确，用户需要直接指认“就是这个按钮/区域”
- 继续让模型猜只会在多个候选目标之间来回摇摆

下面这些情况不要调用 `request_help`：

- 已经知道要点哪个控件，只差一个精确坐标
- 已经有固定坐标系，只是在原始 `1600x900` 图上取点
- 只是想让用户帮忙框一个常规 ROI、取一个常规点击点，却并不存在目标语义歧义

换句话说：

- 不知道“点哪里”时，才用 `request_help`
- 只是需要“这个已知目标的坐标是多少”时，不要默认走 `request_help`

当前推荐输入：

- `script_path + status_title`
- 或 `image_path`

不要设计或依赖：

- 让模型直接输出整段 base64 图片内容

目标是让前端弹窗展示图片，然后让用户在“目标语义不明确”的情况下：

- 点一个点
- 或框一个区域

再把结构化结果回传给 MCP。

一句话原则：

- `request_help` 解决的是“目标是谁”，不是“每个坐标都让用户手工取”

### 6. 状态机按最小步扩展

不要直接堆一大坨 `if/else`。推荐顺序：

1. 单帧识别
2. 识别函数稳定
3. 循环观察
4. 加 state / substate
5. 只加一个动作
6. 再加状态跳转

健康脚本的标准：

- 任意时刻能从 status 看出卡在哪
- 任意异常能从 console 回溯到最近一步
- 任意识别函数都能单独验证

### 7. 改完立即重跑，不要脑补

每次改完固定执行一轮：

1. `run_script`
2. `get_runtime_info`
3. `read_status`
4. `read_console`
5. `stop_script`
6. `clear_script_mcp_cache(scriptPath)` 清掉旧缓存再开始下一轮

长循环脚本注意：

- 按脚本路径过滤 status / console，不要看全局缓存
- 只清状态用 `clear_script_mcp_status(scriptPath, title?)`
- 只清日志用 `clear_script_mcp_console(scriptPath, includeGlobal?)`

### 8. 停止后的语义

- `stop_script` 后，`get_runtime_info` 立刻回到 `running=false`
- 但 `read_status` 和 `read_console` 仍可能保留最后一份缓存

**不要把"还能读到最后一条 status"误判成"脚本还在跑"。运行态以 `get_runtime_info` 为准。**

开始全新一轮观察前，先 `clear_script_mcp_cache(scriptPath)`，再看新数据。

---

## 排障清单

当脚本"看起来不对"时，按此顺序排查：

1. `get_runtime_info` — 到底在不在跑？
2. 路径是否正确？
3. 是否有上一轮遗留缓存干扰？
4. `read_console` — 有没有异常日志？
5. `read_status` — 停在哪个状态？
6. 是否抓到正确窗口？
7. 是否拿到正确图像 / ROI？
8. 状态机是否走到预期分支？
9. 动作是否真的发出？

---

## 已验证的最小闭环

以下能力均已实测确认可用：

- `run_script` 启动绝对路径脚本
- `exec_script` 一次性截图、取色、点按（不落文件）
- `get_runtime_info` 返回 `running / runningCount / scriptPaths`
- `read_status(scriptPath)` 按路径过滤实时 status
- `read_console(scriptPath)` 按路径过滤实时日志
- `stop_script(scriptPath)` 后运行态恢复为 `running=false`
- 停止后 status / console 缓存仍可读
- `clear_script_mcp_cache(scriptPath)` 主动清除残留缓存

调试时优先复用这套最小闭环，再上更复杂的脚本。

> **总原则：先让脚本会说话，再让脚本会行动。**
