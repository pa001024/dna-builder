# 小小狩月人（AFKSupport）奖励管道协议

> 本文描述《二重螺旋》官方桌面工具「小小狩月人」(`AFKSupport.exe`) 与游戏本体
> (`EM-Win64-Shipping.exe`) 之间的本机通讯协议，以及 DNA Builder 侧兼容接收端的实现约定。
>
> 接收端代码：`apps/web/src-tauri/src/submodules/afk_protocol.rs`（纯协议：分帧 + 解码）、
> `apps/web/src-tauri/src/submodules/afk_bridge.rs`（管道服务端 + 运行状态 + Tauri 事件）、
> `apps/web/src/api/afkSupport.ts`（前端调用与事件订阅）、
> `apps/web/src/store/afkSupport.ts`（事件消费与 UI 状态）、
> `apps/web/src/components/AfkSupportSetting.vue`（设置页开关与事件列表）。
>
> 结论均来自对官方程序的静态逆向（IL 反编译）与官方日志中的真实报文；
> 每个断言都标注了**来源**，`[推断]` 表示未直接观测。

---

## 1. 一句话结论

游戏是**命名管道客户端**，官方工具是**服务端**；单向、UTF-8、**一行一条 JSON**、无握手无 ACK。
因此**任何人都可以顶替官方工具当服务端**——代价是与官方工具互斥（同一个管道名同一时刻只应有一个服务端在用）。

```
EM-Win64-Shipping.exe  ──(写, 一行一个 JSON)──►  \\.\pipe\TBH_RewardPipe  ◄──(读)  AFKSupport.exe / DNA Builder
```

## 2. 分析对象

| 项 | 值 |
|---|---|
| 工具 | `E:\game\Duet Night Abyss\DNA Game\EM\Binaries\Win64\AFKSupport\AFKSupport.exe`（170,901,152 B） |
| 托管程序集 | bundle 内 `AFKSupport.dll`，17,383,936 B，SHA-256 `c1def04cbb1f6ae688668728a832c9d8b58173934a8bfb783147edb541e40f82` |
| 运行时 | .NET 8.0（`net8.0` + `Microsoft.WindowsDesktop.App 8.0.20`，WPF），单文件自包含发布 |
| 程序集版本 | `AFKSupport/1.0.0`（`AFKSupport.deps.json`） |
| 命名空间 | `TBH_TaskbarRewardWidget`（进程内类名，与游戏内 "TBH" 代号一致） |
| 签名 | DigiCert G4 Code Signing，时间戳 `2026-10-02T12:10:40Z` |
| 日志 | `%LOCALAPPDATA%\AFKSupport\tbh_widget.log`（UTF-8，BOM，`yyyy-MM-dd HH:mm:ss.fff`） |
| 配置 | `%LOCALAPPDATA%\AFKSupport\settings.json`、`<安装目录>\Res\config\app.json` + `rewards.json`、`Res\Runtime\{display,manifest}.json`、`Res\lang.json` |

### 2.1 解包方法（可复现）

`AFKSupport.exe` 是 .NET 8 **单文件 bundle**（原生 apphost + 内嵌托管程序集，未压缩）。文件尾部 16 字节
是 bundle marker，其后的头部结构为：

```
int32 major(=6) int32 minor(=0) int32 fileCount(=443) <7bit-len> bundleId
repeat fileCount: int64 offset int64 size int64 compressedSize uint8 type <7bit-len> path
```

按此表切割即可得到全部内嵌文件（`type`：1=Assembly，2=Native，3=DepsJson，4=RuntimeConfigJson；
本次 `compressedSize` 全为 0，即不压缩）。`ilspycmd` 可直接反编译取出的 `AFKSupport.dll`。
游戏侧 `EM-Win64-Shipping.exe` 里没有管道名字符串，只有 UE 对象名 `AFKSupportScene`，
说明管道名字只存在于官方工具侧（`app.json` 的 `pipeName`），游戏侧写死在代码/蓝图中。

## 3. 传输层

### 3.1 管道

| 项 | 值 | 来源 |
|---|---|---|
| 管道名 | `TBH_RewardPipe` | `Res/config/app.json` → `"pipeName"`；`AppConfig.PipeName` 默认值同为 `TBH_RewardPipe` |
| 完整路径 | `\\.\pipe\TBH_RewardPipe` | 同上 |
| 服务端访问 | `PIPE_ACCESS_INBOUND`（`PipeDirection.In`） | `PipeServer.RunAsync` 反编译 |
| 客户端访问 | 只需写权限 | 由 inbound 决定 |
| 传输模式 | `PipeTransmissionMode.Byte`（字节流，非消息模式） | 同上 |
| 最大实例数 | `1` | 同上（`maxNumberOfServerInstances = 1`） |
| 异步 | `PipeOptions.Asynchronous` | 同上 |
| 服务端缓冲 | 由运行时默认值决定（官方未指定） | `[推断]` |

服务端创建代码（反编译原文，`TBH_TaskbarRewardWidget.PipeServer`）：

```csharp
NamedPipeServerStream pipe = new NamedPipeServerStream(_pipeName, PipeDirection.In, 1,
                                                       PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
await pipe.WaitForConnectionAsync(ct);
using StreamReader reader = new StreamReader(pipe, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, 1024, leaveOpen: true);
while (!reader.EndOfStream && !ct.IsCancellationRequested) {
    string text = await reader.ReadLineAsync(ct);
    if (!string.IsNullOrWhiteSpace(text)) _onMessage(text);
}
```

### 3.2 方向与握手

- **严格单向**：服务端只有读通道，官方工具**从不回写**（`PipeDirection.In`，全工程无管道写入代码）。
- **无握手、无版本协商、无 ACK、无心跳**：连上就开始逐行发。
- **无鉴权**：任何本机进程都能创建同名服务端；管道上没有任何身份校验字段。

### 3.3 帧格式

- **一行一条 JSON**（`StreamReader.ReadLine()` 语义）：分隔符为 `\r\n`（也接受 `\n`、`\r`）。
  `[未验证]` 游戏实际使用哪种换行——抓包未拿到原始字节；接收端必须三种都接受。
- **无长度前缀**，无帧头，无结束标记；管道是字节流，单次 `Read` 的边界与消息边界无关。
- **编码 UTF-8**，不带 BOM（`detectEncodingFromByteOrderMarks: false`），中文以 UTF-8 三字节出现。
- 空行/纯空白行被丢弃（`string.IsNullOrWhiteSpace`）。
- 单行大小：实测最大 86 字节（`character` 帧）；官方 `StreamReader` 缓冲 1024 字节，但那是内部缓冲，
  不构成协议上限。`[推断]` 游戏不会发超过数千字节的单行。
- JSON 是**单层扁平对象**，`System.Text.Json` 解析，字段名区分大小写。

### 3.4 生命周期（服务端）

1. `MainWindow` 构造函数里 `new PipeServer(appConfig.PipeName, HandlePipeMessage)` 并 `Start()`；
   `Start()` 先 `Stop()` 再起后台 `Task`，随即打印
   `PipeServer.RunAsync() started.` / `NamedPipeServerStream created, name=… . Waiting for connection...`。
2. 连接建立后打印 `Client connected to pipe.`，进入逐行读循环；每行先 `Read line: <原文>`，
   再 `HandlePipeMessage called: <原文>`（日志里两行成对出现，共 119 组）。
3. 客户端断开 → `reader.EndOfStream` → 关闭本次实例 → `while` 回到 `CreateNamedPipe` **重新建实例**，
   失败时 `Task.Delay(1000)` 后重试。因此服务端天然支持重连。
4. 进程退出：`PipeServer.Dispose()` → `Stop()`（取消 token）→ `RunAsync() exiting.`。

### 3.5 单实例与权限

- 官方工具用命名互斥体 `TBH_TaskbarRewardWidget_SingleInstance` 保证只跑一个实例；
  第二个实例会去激活已有窗口后 `Shutdown()`。
- 该互斥体**只保护官方工具自身**，不保护管道。管道本身也没有 ACL，默认继承创建者 DACL
  （同用户可读写）。
- **冲突语义**：管道名 + `maxNumberOfServerInstances = 1` 意味着同一时刻只应有一个「活跃服务端」。
  若官方工具与 DNA Builder 同时运行，两边的服务端实例会同时存在，游戏的下一次 `CreateFile`
  连到哪个实例**不确定**，事件流会被随机瓜分；且先连上的那一方拿满整条流。→ 见 §6 切换方式。

## 4. 消息 Schema

分发逻辑（`MainWindow.HandlePipeMessage`，反编译原文语义）：

- `type` 缺省（或不是字符串）= `"reward"`。
- `switch (type)` 精确匹配（区分大小写）：`shutdown`、`language`、`hittest`、`history`、
  `craftpanel`、`scroll`、`settings`、`tab`、`zoom`、`character`、`monster`。
- 之后再用 `OrdinalIgnoreCase` 依次比较 `craft` → `dungeon` → `chat`。
- **兜底是 reward**：只要对象里有 `name`（字符串）就当成奖励；没有 `name` 则记日志丢弃
  （`HandlePipeMessage: reward message missing 'name' field.`）。
- 字段类型严格按 `JsonElement.ValueKind` 校验，类型不符等于字段缺失（例如 `id` 是字符串时
  `character`/`monster` 会被丢弃；`dungeon.id` 则同时接受数字与字符串）。

### 4.1 数据类消息（DNA Builder 关心这些）

| type | 字段 | 类型 | 必填 | 默认 | 语义 |
|---|---|---|---|---|---|
| `reward` | `name` | string | ✅ | — | 物品名（本地化后的中文，如 `透析·缠缚`） |
| | `id` | number(int32) | ❌ | 0 | 物品 ID（`51007`） |
| | `rarity` | number(int32) | ❌ | 1 | 品质 1..5（5 = 金色） |
| | `count` | number(int32) | ❌ | 1 | 数量 |
| `craft` | `name` | string | ✅ | — | 铸造产物名；缺失则整条丢弃 |
| | `rarity` | number(int32) | ❌ | 1 | 品质 |
| | `count` | number(int32) | ❌ | 1 | 数量 |
| `dungeon` | `id` | number 或 string | ❌ | `""` | 副本/委托 ID（实测 `"616006"` 字符串、`616006` 数字皆有） |
| | `status` | string | ✅ | `""` | `enter` / `complete`（大小写不敏感）；其它值整条丢弃 |
| | `name` | string | ❌ | `""` | 副本/委托名（`避险`、`扼守/无尽`） |
| `character` | `id` | number(int32) | ✅ | — | 角色 ID（`4103`）；缺失或非数字整条丢弃 |
| | `skin` | number(int32) | ❌ | null | 皮肤 ID |
| | `state` | string | ❌ | `"idle"` | `idle` / `combat`（其它值按原样透传） |
| | `name` | string | ❌ | `""` | 角色显示名（`黎瑟·浴火`） |
| | `scene` | string | ❌ | null | 背景场景 ID（`BG01`..`BG07`） |
| `monster` | `id` | number(int32) | ✅ | — | >0 强制指定刷怪，≤0 恢复随机 |
| `chat` | `team` | number(int32) | ❌ | 0 | 队伍未读数 |
| | `world` | number(int32) | ❌ | 0 | 世界（协会）未读数 |
| | `party` | number(int32) | ❌ | 0 | 私聊未读数 |
| | `count` | number(int32) | ❌ | — | 兼容字段，等价于 `party`（覆盖写入） |
| `language` | `lang` | string | ❌ | `""` | 游戏语言（`zh` / `zht` / …），首次生效后忽略后续 |

### 4.2 控制类消息（官方工具 UI 指令，DNA Builder 只透传不执行）

| type | 字段 | 说明 |
|---|---|---|
| `shutdown` | — | 关闭工具 |
| `history` | — | 切换历史面板 |
| `craftpanel` | — | 切换铸造面板 |
| `settings` | — | 切换设置面板 |
| `tab` | `index` (int) | 选中设置页签 |
| `scroll` | `value` (double) | 历史列表滚动偏移 |
| `zoom` | `value` (double) | 窗口缩放 |
| `hittest` | `x`,`y` (double) | 命中测试调试（工具把结果写日志） |

> 这些指令由游戏侧 UI 发出（游戏内按钮/热区驱动工具窗口），是**游戏 → 工具**的控制通道，
> 与奖励数据共用一条管道。DNA Builder 收到后仅记录原始 `type`，不改变自身行为。

### 4.3 消费侧行为（官方工具，供对齐语义）

- `reward` → `AddReward(name, rarity, count, itemId)`：进历史列表 + 漂浮提示（品质配色）。
- `craft` → `AddCraftReward(...)`：`CraftingCompleteNotify` 关闭时只打日志不显示。
- `dungeon` → `AddDungeonStatus(id, status, name)`：`enter`/`complete` 都进历史；`complete` 在
  `DungeonCompleteNotify` 关闭时跳过。文本模板 `Main.DungeonEnter(NoLevel)` / `Main.DungeonComplete(NoLevel)`。
- `character` / `monster` → 驱动任务栏浮窗的像素战斗动画。
- `chat` → 未读数角标。

**没有去重**：官方工具对重复帧来者不拒（实测 `{"type":"dungeon","id":"616006","status":"complete","name":"避险"}`
在一秒内出现 40+ 次，全部入列）。DNA Builder 侧必须自己按内容+时间窗去重（见 §5.6）。

## 5. 真实样本

以下 4 条是 `tbh_widget.log`（2026-10-22 08:01:37 会话）里 `Read line:` 记录的**原文**，
即官方工具 `ReadLine()` 的返回值（已剥掉行尾分隔符），UTF-8 解码后的字符串。

### 5.1 reward

```
{"type":"reward","id":51007,"name":"坚守","rarity":5,"count":1}
```

UTF-8 十六进制（65 字节，行尾分隔符未包含）：

```
7b 22 74 79 70 65 22 3a 22 72 65 77 61 72 64 22 2c 22 69 64 22 3a 35 31 30 30 37
2c 22 6e 61 6d 65 22 3a 22 e5 9d 9a e5 ae 88 22 2c 22 72 61 72 69 74 79 22 3a 35
2c 22 63 6f 75 6e 74 22 3a 31 7d
```

| 字段 | 值 |
|---|---|
| `type` | `reward` |
| `id` | `51007` |
| `name` | `坚守`（`e5 9d 9a` = 坚，`e5 ae 88` = 守） |
| `rarity` | `5` |
| `count` | `1` |

### 5.2 dungeon

```
{"type":"dungeon","id":"616006","status":"complete","name":"避险"}
```

```
7b 22 74 79 70 65 22 3a 22 64 75 6e 67 65 6f 6e 22 2c 22 69 64 22 3a 22 36 31 36
30 30 36 22 2c 22 73 74 61 74 75 73 22 3a 22 63 6f 6d 70 6c 65 74 65 22 2c 22 6e
61 6d 65 22 3a 22 e9 81 bf e9 99 a9 22 7d
```

`id` 是**字符串**（带引号）；同一次会话里也出现过 `{"type":"dungeon","id":"64102","status":"enter","name":"扼守/无尽"}`。

### 5.3 character

```
{"type":"character","id":4103,"state":"combat","name":"黎瑟·浴火","scene":"BG06"}
```

```
7b 22 74 79 70 65 22 3a 22 63 68 61 72 61 63 74 65 72 22 2c 22 69 64 22 3a 34 31
30 33 2c 22 73 74 61 74 65 22 3a 22 63 6f 6d 62 61 74 22 2c 22 6e 61 6d 65 22 3a
22 e9 bb 8e e7 91 9f c2 b7 e6 b5 b4 e7 81 ab 22 2c 22 73 63 65 6e 65 22 3a 22 42
47 30 36 22 7d
```

`黎瑟·浴火` 中的 `·` 是 U+00B7（`c2 b7`）。同会话另有 `"state":"idle"` 帧。

### 5.4 language

```
{"type":"language","lang":"zh"}
```

```
7b 22 74 79 70 65 22 3a 22 6c 61 6e 67 75 61 67 65 22 2c 22 6c 61 6e 67 22 3a 22
7a 68 22 7d
```

### 5.5 流量模型（同一次抓取，119 帧）

| 观察 | 值 |
|---|---|
| 连接时刻 | `08:01:37.091`（服务端建实例后 55 ms） |
| 第一秒内帧数 | 100（**积压回放**：本次会话开始时把历史事件一次性全推一遍） |
| 之后 | 事件驱动：`08:19:39` 一帧 `dungeon enter` + 一帧 `character combat`，随后几十分钟里零星 `reward` |
| 帧类型分布 | reward 57 / dungeon 45 / character 16 / language 1 |
| 重复率 | 119 帧里只有 32 条不同内容（重复帧必须由接收端去重） |
| 会话时长 | 08:01:37 → 09:46:23（工具退出），游戏侧全程未主动断开 |

**重要**：历史/积压回放意味着**接收端不能把"收到一帧"当成"刚刚发生"**——必须带 `receivedAt`
时间戳入库，并对 `dungeon.complete` 这类语义做时间窗去重。

### 5.6 未观测到的消息

- `craft` / `monster` / `chat` / 控制类消息本次抓取中**未出现**（日志里只有 reward/dungeon/character/language），
  但它们的处理分支、字段名校验与错误日志在 DLL 里全部存在（见 §4），属**协议内**消息。
- `[未验证]` 游戏实际使用的行尾（`\r\n` vs `\n`）。

## 6. DNA Builder 接收端

### 6.1 角色选择

协议只有一种可行实现：**我们当服务端**（`PIPE_ACCESS_INBOUND` 等价物），因为游戏是客户端且从不读。
Rust 侧用 `tokio::net::windows::named_pipe::ServerOptions` 建实例，逐行读；官方工具不可能与我们共存于同一条活跃连接。

### 6.2 与官方工具的互斥

- **不要同时开**。两边都当服务端时，游戏的下一次连接会被随机一边接走；更常见的结果是官方工具启动后
  游戏仍连着 DNA Builder，官方浮窗永远收不到事件（或反之）。
- 官方工具那边没有错误提示（`CreateNamedPipe` 同名多实例仍可能成功，随后一直 `Waiting for connection`）。
- 切换方式（都是用户操作，程序不代劳）：
  1. 退出 DNA Builder 的接收功能（设置页开关 → `afk_bridge_stop`，会释放管道实例）；
  2. 再启动官方 `AFKSupport.exe`；
  3. 反之若要切回 DNA Builder：先关官方工具（它会 `PipeServer.Stop()` 释放实例），再开 DNA Builder 开关。
- 开关**默认关闭**，避免用户装了 DNA Builder 就无感抢走官方浮窗的管道。

### 6.3 实现要点

| 关注点 | 实现 |
|---|---|
| 重连 | 单实例循环：`connect` → 读循环 → 断开后重建实例（同官方 `RunAsync`），重试间隔 1 s |
| 任务派生 | `afk_bridge_start` 是同步命令，必须用 `tauri::async_runtime::spawn`；在同步上下文里直接 `tokio::spawn` 会因「no reactor running」panic |
| 互斥检测 | 建实例时带 `FILE_FLAG_FIRST_PIPE_INSTANCE`：官方工具已经占着管道名时 `create` 直接失败，设置页显示错误并每秒重试，而不是两个服务端同时静默监听 |
| 编码 | 按 UTF-8 严格解码；非法序列用 `from_utf8_lossy` 兜底并计一次 `decode_error` |
| 分帧 | 自写行切分，接受 `\r\n` / `\n` / `\r`；不依赖单次 `read` 边界 |
| 背压/半包 | 累积缓冲 + 上限（1 MiB）保护，超限丢半包并重同步 |
| 解析 | `serde_json` → 归一化 `AfkEvent`（`kind` + 强类型字段 + `raw`），与 §4 的默认值/校验逐条对齐 |
| 前端 | `app.emit("afk-support://event", payload)`；状态变更 `app.emit("afk-support://status", …)` |
| 去重 | 前端 store 以「kind + 关键字段 + count」在 3 s 窗口内去重（回放 burst 大量重复） |
| 权限 | 不写游戏目录、不注入、不读游戏内存；只创建/读取本机命名管道 |

## 7. 已知边界与未决项

| 项 | 状态 |
|---|---|
| 管道名会不会被配置改写 | 会（`app.json.pipeName`）；接收端把它当常量 `TBH_RewardPipe`，不读官方配置文件 |
| 游戏是否只在特定状态连接 | `[未验证]` 观察到「工具建实例后 55 ms 游戏即连上」，说明游戏侧在重试；但 09:46 工具退出后，
  新服务端（10:06 建立）在 20+ 分钟内未被连接 → 重连未必是持续重试，可能只在进入挂机场景时发起 |
| 行尾 | `[未验证]`，接收端三种都接受 |
| 单行编码 | UTF-8 无 BOM（官方 `StreamReader` 参数确定；实测中文三字节一致） |
| 是否有多客户端并发 | 否，官方只接受 1 个；游戏侧只有一个客户端 |
| 协议版本号 | 不存在 |
| 消息签名/加密 | 不存在 |
| 会话期间工具崩溃 | 游戏侧把积压事件留到下次连接再补发（由 100 帧 burst 推断） |

## 8. 验证记录

### 8.1 已实测（真机、真字节）

| 项 | 手段 | 结果 |
|---|---|---|
| 服务端可建同名管道 | `CreateNamedPipeW(\\.\pipe\TBH_RewardPipe, DUPLEX, BYTE, 不限实例)` | 成功；`\\.\pipe\` 枚举里出现 `TBH_RewardPipe`，`GetNamedPipeInfo` 返回 `flags=0x1`（服务端实例）、`maxInstances=255`、缓冲各 64 KiB |
| 真实帧解码 | 用 §5 的 4 类真实帧跑 `parse_event` | 6 个协议单测全绿（`cargo test` 在独立 crate 里跑通，见下） |
| 分帧健壮性 | 把真实帧按 3 字节切片喂 `LineSplitter`（含 `\r\n` 被切断） | 还原出 3 条完整帧，逐条解析成功 |
| 管道端到端 | 真实命名管道（与生产同参数：byte + inbound + maxInstances=1）+ 仅写客户端，写入 2 帧 | 服务端逐条收到并解码成 `reward` / `dungeon` 事件 |

> 端到端测试用独立管道名 `\\.\pipe\TBH_RewardPipe-DnaBuilderTest`，不占生产管道。
> 应用 crate 的 `cargo test` 在本机因原生依赖（opencv/DirectML 链）加载报
> `0xC0000139 STATUS_ENTRYPOINT_NOT_FOUND`（`--list` 阶段即失败，与本改动无关，仓库 CI 也不跑它），
> 因此上述测试是把 `afk_protocol.rs` 用 `#[path]` 引到独立 crate 后执行的。

### 8.2 未实测（需要用户配合）

**没有抓到游戏端到接收端的实时事件。** 原因与证据：

1. 官方工具 09:46:23 退出后释放了管道；10:06 我们建立兼容服务端（`\\.\pipe\TBH_RewardPipe` 已出现在
   `\\.\pipe\` 枚举里），此后**持续监听 60+ 分钟零连接**。
2. 反向证据：08:01:36 官方工具建实例，08:01:37.091（55 ms 后）游戏就连上了 —— 说明游戏侧确实有
   连接逻辑，但**不是持续轮询**，更像是「游戏内挂机场景/Widget 打开时发起一次，失败后不再重试」。

需要用户配合的最小动作（按代价从低到高）：

1. 保持 DNA Builder 的「小小狩月人同步」开关为开（服务端已在等连接），在游戏里**退出再进入一次挂机/
   AFK 委托场景**，或触发一次委托完成；
2. 若仍无连接：**重启游戏**（服务端不用动，重启后游戏会重新走连接逻辑）；
3. 观察设置页卡片的「已接收 / 最近事件」是否出现数据，以及 `tbh_widget.log` 是否同时增长
   （两者此消彼长——同时开就是抢管道）。

拿到实时连接后要补验的就两项：真实行尾（`\r\n` vs `\n`）与「进入场景是否立刻发起连接」。
接收端对前者三种都兼容，因此不影响可用性。

