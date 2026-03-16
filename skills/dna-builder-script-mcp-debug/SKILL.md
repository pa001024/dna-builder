---
name: dna-builder-script-mcp-debug
description: Use when an AI agent needs to debug dna-builder script runtime through the script MCP server, including running/stopping scripts, checking runtime state, reading status/console, finding the default script directory, and iterating a closed-loop workflow from single-frame capture to state-machine tuning.
---

# DNA Builder Script MCP Debug Skill

当任务涉及 `script MCP`、脚本页脚本调试、`run/stop/status/console`、单帧抓取、状态机迭代、或者“某个脚本为什么没跑起来/为什么卡住”时，默认使用这个 skill。

这个 skill 的目标不是“描述功能”，而是把调试工作做成闭环：

1. 找到脚本
2. 跑起来
3. 看运行态
4. 看 `status`
5. 看 `console`
6. 改脚本
7. 重跑
8. 再次验证

## MCP 能力

本项目脚本 MCP 暴露的基础操控能力：

- `get_runtime_info`
- `run_script`
- `exec_script`
- `stop_script`
- `read_status`
- `read_console`

如果当前会话已经接入这个 MCP，优先直接调这些工具，不要手搓 HTTP。

## 两阶段工作流

这个 skill 现在明确分成两个阶段，不要混着做。

### Phase 1. 实时交互阶段

目标：

- 把 agent 当成 GUI agent
- 直接操作游戏
- 通过 `imwrite` 落盘截图
- 读图后判断下一步该点什么、按什么
- 先把一套真实流程走通

这一阶段优先工具：

- `exec_script`
- `request_help`
- `read_status`
- `read_console`

`exec_script` 的语义要按“同步即时执行”理解：

- 不落临时文件
- 等待执行完成再返回
- `console` 输出应直接看工具返回值，不要把它当成长生命周期事件流

这一阶段的原则：

- 不落调试脚本文件，优先用 `exec_script` 做一次性截图、点按、取色、打印结果
- 截图优先 `imwrite` 落盘，再由 agent 直接查看图片
- 需要用户精确确认时，再用 `request_help`
- 先闭环真实操作路径，再总结状态和动作

典型节奏：

1. `exec_script` 截图并 `imwrite`
2. 查看图片
3. `exec_script` 执行一次点击/按键
4. 再截图确认是否进入下一页
5. 重复直到整套流程走通

### Phase 2. 脚本编写阶段

目标：

- 把 Phase 1 跑通的真实流程固化为脚本
- 总结需要的 `state`
- 总结每个 `state` 对应的 `action`
- 形成稳定状态机

这一阶段优先工具：

- `run_script`
- `stop_script`
- `read_status`
- `read_console`

这一阶段的原则：

- 先写 `state`
- 再写 `action`
- 每次只扩一小步
- 所有状态都要有可观测输出

Phase 2 最少应产出：

- 状态枚举或等价的识别分支
- 每个状态的进入判据
- 每个状态对应的动作
- 从一次人工闭环抽象出来的跳转关系

## 默认脚本目录

通用规则：

- 默认目录是 `Documents/dob-scripts`
- 传本地脚本文件名时，后端会自动拼成 `Documents/dob-scripts/<name>.js`

注意：

- MCP 也支持传绝对路径
- 当你怀疑默认目录解析错了时，直接改用绝对路径，少猜

## 推荐工作流

### 1. 先确认运行态

第一步永远先看：

- `get_runtime_info`

你要确认三件事：

- 当前是否已经有脚本在跑
- 跑了几个
- 路径是不是你以为的那个脚本

如果这里已经有旧脚本残留，先决定是并行观察还是先停掉。

### 2. 做一个最小可观测脚本

不要一上来就调大脚本。

先写最小闭环脚本，只做三件事：

- `console.log`
- `setStatus`
- `Timer.sleep`

示例：

```js
async function main() {
    const timer = new Timer()
    let tick = 0
    console.log("boot")
    while (true) {
        tick += 1
        setStatus("debug", `tick ${tick}`)
        console.log(`tick ${tick}`)
        await timer.sleep(500)
    }
}

main()
```

这个脚本能快速验证四件事：

- `run_script` 能不能启动
- `read_status` 能不能读到状态
- `read_console` 能不能读到日志
- `stop_script` 能不能停下来

### 2.5 调试阶段不要接 `readConfig`

调试脚本默认不要调用 `readConfig`。

原因很直接：

- `readConfig` 的职责是给最终用户创建或更新脚本配置 UI
- 它不是“调试态临时读参”接口
- 在识别和状态机还没稳定前接入 `readConfig`，会把临时参数、实验开关、错误命名直接暴露到配置面板

调试阶段推荐做法：

- 直接在脚本顶部写内联常量
- 或者集中放到 `const config = { ... }`
- 等脚本行为稳定、确认确实需要给用户调节时，再把少量稳定参数迁移到 `readConfig`

一句话判断：

- 这是为了让 agent 调试方便的参数：不要用 `readConfig`
- 这是为了让最终用户长期配置的参数：再考虑用 `readConfig`

### 3. 用 `run_script` 启动

推荐顺序：

1. `run_script`
2. `get_runtime_info`
3. `read_status`
4. `read_console`

如果 `run_script` 返回成功，但 `get_runtime_info.running=false`，优先怀疑：

- 脚本立即退出
- 脚本路径不对
- 启动后立刻抛异常

这时不要猜，直接看 `read_console`。

### 4. 用 `status` 和 `console` 分层调试

推荐分工：

- `console.log` 打“发生了什么”
- `setStatus` 打“当前停在什么状态”

实践上很好用的约定：

- `setStatus("state", "...")` 表示大状态
- `setStatus("substate", "...")` 表示细分步骤
- `setStatus("fps", i)` 表示循环频率
- `setStatus("img", frame)` 表示当前观察图
- `setStatus("result", result)` 表示识别结果

这样你能很快分辨问题属于哪层：

- 没日志：脚本可能根本没跑
- 有日志没状态：`setStatus` 没走到
- 有状态没图：抓图或分支有问题
- 图正常但结果不对：识别逻辑有问题
- 结果对但动作不对：状态机或输入链有问题

### 5. 单帧抓取优先，不要直接写整套状态机

推荐先做“静态观察脚本”，只抓一帧或循环抓帧，不执行任何输入。

典型步骤：

1. 找窗口句柄：`getCGWindow()` 或 `getWindowByProcessName()`
2. `captureWindow` / `captureWindowWGC`
3. `setStatus("img", frame)`
4. `console.log` 输出判定值
5. 必要时把 ROI 单独 `setStatus`

先把“看见了什么”做对，再写“要做什么”。

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

### 5.6 优先用 `request_help` 做用户协助标注

如果问题本质是“模型知道目标控件，但没有稳定坐标”，优先使用 `request_help`，不要继续盲点。

当前推荐输入：

- `script_path + status_title`
- 或 `image_path`

不要设计或依赖：

- 让模型直接输出整段 base64 图片内容

目标是让前端弹窗展示图片，然后让用户：

- 点一个点
- 或框一个区域

再把结构化结果回传给 MCP。

一句话原则：

- 需要精确点位时，优先采集坐标，不要让模型猜坐标

### 5.7 高频调试优先缩略图，不要持续上传整帧

当问题进入“长循环观察 / unknown 分支诊断 / 粗粒度状态判断”阶段时，默认不要每轮都往 `status` 面板塞整张 `1600x900` 原图。

推荐顺序：

1. 先上传缩略图
2. 再上传 1 到 2 个固定 ROI
3. 只有在确实需要精查像素细节时，才临时上传整帧

建议做法：

- 原图固定是 `1600x900`
- 先生成低成本缩略图，比如 `400x225`
- 用缩略图做初步状态判断
- 进入 `unknown` 时，也优先展示缩略图和关键 ROI，而不是持续刷整帧

这样做的收益很直接：

- `status` 面板刷新更轻
- 前端更容易看出“现在大概在哪一屏”
- agent 可以先用缩略图粗判，再决定是否需要更细的 ROI 或用户协助

一句话原则：

- 粗判看缩略图，精查看 ROI，整帧只作临时取证

### 6. 状态机按最小步扩展

不要直接堆一大坨 `if/else` 和动作。

推荐顺序：

1. 单帧识别
2. 识别函数稳定
3. 循环观察
4. 加 `state/substate`
5. 只加一个动作
6. 再加状态跳转

一个健康的脚本一般能满足：

- 任意时刻能从 `status` 看出自己卡在哪
- 任意异常都能从 `console` 回溯到最近一步
- 任意一个识别函数都能单独验证

### 7. 改脚本后立即重跑，不要脑补

每次改完，固定做一轮：

1. `run_script`
2. `get_runtime_info`
3. `read_status`
4. `read_console`
5. `stop_script`

如果是长循环脚本，按脚本路径过滤 `status/console`，不要看全局缓存。

### 8. 停止后的语义

实测结论：

- `stop_script` 后，`get_runtime_info` 会立刻回到 `running=false`
- 但 `read_status` 和 `read_console` 仍可能保留最后一份缓存

这很重要。

不要把“还能读到最后一条 status/log”误判成“脚本还在运行”。

运行态以 `get_runtime_info` 为准。

## 排障顺序

当脚本“看起来不对”时，按这个顺序排：

1. `get_runtime_info`
2. 路径是否正确
3. `read_console`
4. `read_status`
5. 是否抓到正确窗口
6. 是否拿到正确图像/ROI
7. 状态机是否走到预期分支
8. 动作是否真的发出

## 对 Codex 的使用建议

如果 Codex 会话已经挂上这个 MCP，建议这样工作：

- 探索阶段：多用 `read_status` / `read_console`
- 执行阶段：用 `run_script` / `stop_script`
- 定位阶段：把脚本改到“高可观测”，而不是让 MCP 替你猜

一句话原则：

- 先让脚本会说话，再让脚本会行动

## 这次实测的最小闭环

本次会话里，已经真实验证过：

- `run_script` 可启动绝对路径脚本
- `exec_script` 适合不落文件的一次性截图、取色和点按
- `get_runtime_info` 会返回 `running=true/runningCount/scriptPaths`
- `read_status(scriptPath)` 可按路径过滤到实时 `tick`
- `read_console(scriptPath)` 可按路径过滤到实时日志
- `stop_script(scriptPath)` 后运行态恢复为 `running=false`
- 停止后 `status/console` 缓存仍可读

调试时优先复用这套最小闭环，再上更复杂的脚本。
