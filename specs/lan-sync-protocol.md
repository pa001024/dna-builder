# 局域网设备发现与一键登录同步协议（手机端实现 Spec）

> 本文档面向手机 App 端实现者。桌面端（dna-builder，Tauri）已实现服务端部分，
> 代码位于 `src-tauri/src/submodules/lan_sync.rs`（服务）与
> `src/store/lanSync.ts`（账号导入导出逻辑），可实现时对照参考。

## 1. 功能概述

桌面端在设置页开启「局域网设备同步」后，在本机监听两个端口：

| 端口 | 协议 | 用途 |
|---|---|---|
| **28182** | **HTTPS** (TCP, TLS 1.2+) | 证书获取、配对、状态查询、双向账号同步 |
| **28183** | UDP | 局域网设备发现（手机广播探测，桌面单播应答） |

手机 App 流程：**UDP 广播发现 → 获取并固定桌面端自签 CA 证书 → 发起配对并在桌面端弹窗确认（仅首次）→ 一键双向同步**。

同步内容（双向，一次请求完成推+拉）：
- **DOB 账号**：DNA Builder 社区账号（JWT + 用户资料），单账号，后推送方覆盖；
- **DNA 账号**：皎皎角游戏账号，多账号列表，按 `uid` 合并。

安全模型：
- **传输加密**：所有业务接口走 HTTPS（自签证书链，TLS 1.2+），不再有明文 HTTP；
- **证书共享**：桌面端首次开启时生成自签 CA + 服务器证书（证书链）并持久化，此后不变；
  手机端获取**同一份 CA** 并作为唯一信任锚（certificate pinning）；
- **弹窗确认 + 设备 token**：配对的根信任是桌面端用户在弹窗上的明确确认，token 鉴权后续请求；
- 仅建议家庭/专用网络使用。

## 2. 常量与版本

```
protocol        = "dna-builder-lan"     # 发现协议标识，请求与应答都必须携带
protocolVersion = 1                     # 双方不一致时桌面端拒绝服务
HTTPS_PORT      = 28182
UDP_PORT        = 28183
```

## 3. UDP 设备发现

### 3.1 探测（手机 → 桌面，广播）

向广播地址的 **UDP 28183** 端口发送 JSON 文本（UTF-8）：

```json
{
  "protocol": "dna-builder-lan",
  "version": 1,
  "type": "discover"
}
```

广播地址建议依次尝试（间隔 ~300ms、各发 2-3 次）：
1. `255.255.255.255`（受限广播，部分 Android/WLAN 不支持）；
2. 子网定向广播，如 `192.168.1.255`（由本机 IP 与掩码计算，**最可靠**）。

### 3.2 应答（桌面 → 手机，单播到探测来源地址）

```json
{
  "protocol": "dna-builder-lan",
  "version": 1,
  "type": "announce",
  "deviceId": "uuid（桌面端标识，用于去重）",
  "deviceName": "DESKTOP-ABC12（电脑名）",
  "httpsPort": 28182,
  "caFingerprint": "64 位 hex（CA 证书 PEM 的 SHA-256）",
  "hasDob": true,
  "dnaCount": 3,
  "ts": 1730000000000
}
```

手机端按 `deviceId` 去重，展示 `deviceName` + `hasDob`/`dnaCount` 概况，
后续 HTTPS 请求发往 `https://<应答来源IP>:<httpsPort>`，并**记住 `caFingerprint`**
用于校验第 4 节下载到的证书。

> 桌面端未开启开关时不会应答；探测超时建议 1s/次。

## 4. HTTPS 证书共享（核心安全机制）

桌面端使用自签证书链：`自签 CA` → 签发 `服务器叶子证书`。CA 长期持久化不变，
**手机端与桌面端共享同一个 CA**：

1. 手机端首次连接时用「临时接受自签证书」的方式访问 `GET /api/cert`（见 5.2），
   下载 CA 证书 PEM；
2. **校验指纹**：`SHA-256(caPem)` 必须等于 UDP 通告 / `/api/info` 中的 `caFingerprint`，
   不一致立即断开并提示用户（可能存在中间人）；
3. 把 CA 存入安全存储，之后所有 HTTPS 连接的信任锚**只有这一个 CA**
   （Android：自定义 `SSLContext` / network_security_config；iOS：pinned trust）；
4. 主机名校验：桌面端叶子证书 SAN 覆盖 `dna-builder.local`、`127.0.0.1` 与生成时的主网卡 IP。
   若桌面端换了网络导致 IP 变化，手机端对 IP 直连场景应**跳过主机名校验、仅依赖 CA 固定**
   （CA 固定本身已保证对端持有对应私钥，主机名验证无额外增益）；
5. 桌面端卸载重装 / 删除证书目录后 CA 会重新生成，旧 CA 失效——手机端 TLS 握手失败或
   指纹不匹配时，应引导用户重新走证书获取流程。

## 5. HTTP API（全部为 HTTPS，JSON）

统一约定：
- Base URL：`https://<桌面IP>:28182`；
- 请求与响应均为 JSON（`Content-Type: application/json`）；
- **JSON 字段名以 camelCase 为准**（`deviceId` / `deviceName` / `dnaUsers`…）；
  服务端对 `/api/pair`、`/api/sync` 的请求体同时兼容 snake_case 别名
  （`device_id` / `device_name` / `dna_users`），但请统一使用 camelCase；
- 除 `/api/info`、`/api/cert` 外都需要请求头 `Authorization: Bearer <token>`；
- 错误响应统一为 `{"ok": false, "code": "<错误码>", "message": "<中文描述>"}`。

### 5.1 GET /api/info — 无鉴权信息（配对前确认目标机器）

```json
// 200
{
  "ok": true,
  "protocol": "dna-builder-lan",
  "protocolVersion": 1,
  "deviceId": "…",
  "deviceName": "DESKTOP-ABC12",
  "caFingerprint": "…"
}
```

### 5.2 GET /api/cert — 获取自签 CA（仅首次配对前调用）

```json
// 200
{
  "ok": true,
  "caPem": "-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----\n",
  "caFingerprint": "…"
}
```

调用方式：此接口本身也是 HTTPS（自签），客户端需临时接受自签证书；拿到 `caPem` 后
按第 4 节校验指纹并固定，之后的请求全部用固定 CA 校验。证书是公开材料，无鉴权。

### 5.3 POST /api/pair — 配对（仅首次，需桌面端用户弹窗确认）

```json
// 请求（无需任何配对码）
{
  "deviceId": "手机端稳定设备id（首次生成后永久保存）",
  "deviceName": "Pixel 8（机型名）"
}
```

```json
// 200 成功（桌面端用户在弹窗上点了「允许」）
{
  "ok": true,
  "token": "uuid（后续所有请求的鉴权凭据，永久保存）",
  "protocolVersion": 1,
  "deviceName": "DESKTOP-ABC12"
}
```

- **确认机制**：收到请求后，桌面端会弹出确认对话框（展示 `deviceName`），
  由桌面端用户手动「允许 / 拒绝」。请求在桌面端**挂起等待用户决定，最长 60 秒**；
- 手机端调用此接口时**超时必须 ≥ 70 秒**（60s 用户确认窗口 + 网络余量）；
  界面上应提示「请在桌面端确认」并进入等待态，超时后可重试；
- 同一 `deviceId` 重复配对会吊销旧 token；
- 配对请求发生在已固定 CA 的 TLS 通道上，请求内容不会被局域网内的第三方窃听；
- 成功后桌面端 UI 的「已配对设备」列表会出现该手机，用户可在桌面端移除（吊销 token）。

### 5.4 GET /api/status — 状态查询（需鉴权）

```json
// 200
{
  "ok": true,
  "protocolVersion": 1,
  "deviceName": "DESKTOP-ABC12",
  "caFingerprint": "…",
  "hasDob": true,
  "dnaCount": 3
}
```

用于同步前预览：桌面端有/无哪些账号。`hasDob=false` 且 `dnaCount=0` 时同步只会上行。

### 5.5 POST /api/sync — 双向同步（需鉴权，核心接口）

一次请求完成两个方向：
- **上行（push，可省略）**：手机端把本机账号数据推给桌面端；
- **下行（pull，在响应中）**：桌面端返回其当前账号快照。

```json
// 请求（只拉取时省略整个 push 字段）
{
  "push": {
    "dob": {
      "token": "eyJhbGciOi…（社区账号 JWT，未登录时整个 dob 传 null）",
      "profile": { "id": "…", "name": "…", "email": "…", "experience": 0 },
      "name": "用户名（仅展示用）"
    },
    "dnaUsers": [
      {
        "uid": "7…（唯一键）",
        "name": "…",
        "dev_code": "2…",
        "token": "ey…",
        "server": "cn",
        "kf_token": "",
        "refreshToken": "ey…",
        "pic": "https://…",
        "status": 0,
        "isComplete": 1,
        "isOfficial": 0,
        "isRegister": 0
      }
    ]
  }
}
```

```json
// 200 响应
{
  "ok": true,
  "pull": {
    "dob": { "token": "…", "profile": {…}, "name": "…" },
    "dnaUsers": [ { 同上结构 } ],
    "currentDnaUid": "7…（桌面端当前使用的账号 uid，可为空串）",
    "updatedAt": 1730000000000
  }
}
```

> **时序说明**：带 `push` 的请求，桌面端会先把数据转交前台导入，最多等待 2 秒导入完成再返回
> `pull`，因此响应可能比普通请求慢（约 0~2s），客户端超时建议 ≥ 5s。**响应中的 `pull`
> 已包含手机刚推上去的数据**（桌面端合并后回传），手机端可直接用它刷新本机存储。

## 6. 数据结构与合并语义

### 6.1 DOB 账号（DNA Builder 社区账号）

| 字段 | 类型 | 说明 |
|---|---|---|
| token | string | 社区账号 JWT（核心凭据） |
| profile | object \| null | 用户资料（id/name/email/qq/experience/level/points/roles 等），可缺省 |
| name | string | 用户名，仅展示用 |

**合并语义：单账号，后推送方覆盖。** 手机端 pull 到非空 `dob` 时，用 `token` 覆盖本机登录态
（token 与本机相同则忽略）；`profile` 缺省时应凭 JWT 自行向社区服务端拉取资料。

### 6.2 DNA 账号（皎皎角游戏账号）

| 字段 | 类型 | 说明 |
|---|---|---|
| uid | string | 用户 ID，**合并唯一键** |
| name | string | 用户名 |
| dev_code | string | 设备码 |
| token | string | 游戏侧 JWT（核心凭据） |
| server | `"cn"` \| `"global"` | 国服 / 国际服 |
| kf_token | string | 客服/社区 token，可为空 |
| refreshToken | string | 刷新令牌 |
| pic | string | 头像 URL |
| status | number | 官方接口原样字段 |
| isComplete | number | 绑定状态（0/1） |
| isOfficial? | number | 官方标记（可选） |
| isRegister? | number | 注册标记（可选） |

**合并语义：按 `uid` 并集。** 任一端存在、对端缺失的账号会被添加；两端同 `uid` 的账号，
推送方覆盖接收方（token/refreshToken 等凭据以最新登录的设备为准）。`currentDnaUid`
仅供参考，各端保留自己的「当前账号」选择。

### 6.3 手机端本地处理建议

- 手机端解析 `dnaUsers` 时逐条容错：缺少 `uid` 或 `token` 的条目跳过（桌面端也是这么做的）；
- 同步完成的判定：`/api/sync` 返回 200 且 `ok=true`；
- 同步可由用户手动触发（推荐：「立即同步」按钮），成功后提示「社区账号 + N 个游戏账号已同步」。

## 7. 错误码

| HTTP | code | 含义 | 客户端处理 |
|---|---|---|---|
| 403 | `SYNC_DISABLED` | 桌面端已关闭开关 | 提示用户在桌面端开启 |
| 401 | `UNAUTHORIZED` | 缺少 Authorization 头 | 本地 bug |
| 401 | `BAD_TOKEN` | token 已被吊销/失效 | 清除本地 token，回到配对流程 |
| 403 | `PAIR_DENIED` | 桌面端用户拒绝了配对 | 提示用户在桌面端重新发起并确认 |
| 403 | `PAIR_TIMEOUT` | 桌面端用户未在 60s 内响应 | 可直接重试 |
| 400 | `BAD_REQUEST` | 字段缺失/非法 | 检查请求体 |
| — | TLS 握手失败 / 指纹不匹配 | CA 不匹配（桌面重装或被替换） | 清除已固定 CA，重新走证书获取流程 |

## 8. 手机端实现清单

1. **设备标识**：首次启动生成 `uuid` 作为 `deviceId`，永久保存；
2. **凭据存储**：`token`（桌面端签发）、固定 CA 证书与 `deviceId` 存入安全存储
   （Android EncryptedSharedPreferences / iOS Keychain）；
3. **发现页**：UDP 广播 → 列出桌面设备（去重，记录 caFingerprint），点击进入证书/配对/同步；
4. **证书固定**：首次连接调 `GET /api/cert`，校验 SHA-256 指纹后固定 CA（见第 4 节）；
5. **配对**：调 `/api/pair` 后进入「等待桌面端确认」状态（可能最长 60s）；成功后保存
   `token`，之后不再需要配对；
6. **同步页**：展示桌面端概况（来自 announce/status），「立即同步」按钮调 `/api/sync`
   （带本机 push，取回 pull 并落库）；
7. **网络**：HTTPS 自签固定，无需明文流量例外（不要配置 `usesCleartextTraffic`）；
8. **容错**：UDP 探测失败时支持手动输入「IP:端口」直连 `/api/info`。

## 9. 安全注意事项（务必遵守）

- 所有同步数据（含游戏账号 token）经固定 CA 的 HTTPS 传输；固定校验必须包含
  `caFingerprint` 比对，仅"接受任何自签证书"是不合格的实现；
- 不要把 token / CA 私钥写进日志（CA 私钥只存在于桌面端，手机端永远只拿 CA 证书公钥）；
- 不要把账号数据转发给任何第三方服务；
- 配对的根信任是桌面端用户的弹窗确认，手机端不要提供任何绕过确认的「自动配对」选项；
- 收到 `BAD_TOKEN` 或 TLS 指纹校验失败时立即清除本地凭据，防止已吊销设备或被替换的
  伪桌面端继续尝试。
