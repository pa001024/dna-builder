# 安全模式解锁密码（夸克网盘定时备份）

关闭安全模式是单流程双门控，不降级：答题全对 **且** 解锁密码正确，缺一不可。
解锁密码由服务端每天生成新值，打进 zip 传到夸克网盘；
用户打开固定分享链接（hover 可扫码）→ 转存到自己网盘 → 下载解压看密码 → 填回弹窗解锁。

## 链路

```
服务端定时（04:00 Asia/Shanghai，可配）
  rotateVault()：生成 16 位分组密码 → buildVaultZip() → QuarkClient.uploadBuffer(文件名, zip, 目录fid)
  → bcrypt 存哈希 + 文件信息落盘（同名覆盖，目录在固定分享内，不另建分享）
  状态文件 server/data/safe-mode-vault.json（只存哈希与分享信息，无明文）

前端 SafeModeQuizDialog.vue（答题区下方追加解锁密码卡）
  打开即 GET /api/safe-mode/vault/status 确认密码就绪 → 链接取自 env.quarkShareUrl（静态）
  → 提交时先本地验答题，再 POST /api/safe-mode/vault/verify 验密码
  无密码状态时确认按钮禁用，不退化为仅答题
```

## 服务端文件

| 文件 | 说明 |
|---|---|
| `apps/server/src/util/quark.ts` | 夸克开放平台客户端（协议见 wlor0623/quark-api）：`x-pan-*` 签名、秒传→分片直传→完成确认、建目录、分享创建/详情、文件详情、token 失效自动 rotate 一次 |
| `apps/server/src/util/safe-mode-vault.ts` | 密码生成、stored-zip 打包（零依赖，系统解包器可直接打开）、上传目标解析、bcrypt 哈希、状态落盘、`syncVaultScheduled` 定时入口 |
| `apps/server/src/api/safe-mode.ts` | `GET /api/safe-mode/vault/status`（公开）、`POST /vault/verify`（公开，只返回对错）、`POST /vault/rotate`（仅 admin），cron 注册与冷启动补传 |

## 环境变量

| 变量 | 说明 |
|---|---|
| `QUARK_ACCESS_TOKEN` | 必需。OAuth 访问令牌；缺失时定时任务跳过、status 报 `configured: false` |
| `QUARK_REFRESH_TOKEN` | 可选。有则 token 失效（errno 11001/31001）时自动刷新一次并写回进程环境 |
| `QUARK_CLIENT_ID` / `QUARK_SIGN_KEY` | 可选，默认 wild 模式值（`third_party_agent` / `cf1348…`） |
| `QUARK_DEVICE_ID` / `QUARK_DEVICE_NAME` | 可选，授权时服务端分配的设备号（换令牌时自动写回） |
| `SAFE_MODE_PASSWORD_DIR` | 解锁密码压缩包的上传目录：空（或 `0`）= 根目录；32 位 hex 按目录 fid 直用；其余视为路径经 `createDir` 幂等创建。默认与固定分享对齐到已分享文件夹 |
| `SAFE_MODE_PASSWORD_FILE` | 网盘内文件名，默认 `密码.zip`。同名覆盖更新，固定分享长期有效 |
| `SAFE_MODE_VAULT_CRON` | 可选，默认 `0 4 * * *`（croner 表达式，上海时区） |
| `QUARK_APP_DIR` | 桌面端发布（`tools/deploy.ts`）的网盘投放目录：fid 或路径，默认 `Duet Night Abyss Builder`。`pnpm deploy app` 传完 MSI 后，把同目录历史版本移进 `老版本`（`--skip-quark` 跳过） |

OAuth 授权走标准流程（见 quark-api 第 3 章）：授权页拿 code → 换 `access_token`/`refresh_token` → 填进服务端环境变量。
首次冷启动（无状态文件且已配置令牌）会在后台传一次，不阻塞服务启动。

## 一致性校验与旧件清理（2026-10 轮换误触 + 副本堆积修复）

- 夸克存在两套 fid 命名空间：上传/详情入参用 32-hex（如配置的 `SAFE_MODE_PASSWORD_DIR`），
  而 `searchFiles` 回来的 `fid`/`parent_fid` 全是 open 形态 `xxx|stable`（`|` 前为单次请求令牌，
  每次接口返回都不同，后段稳定）。旧代码裸比 `parent_fid === dirFid` 永远为 false，
  旧件一个都删不掉，每次轮换都被静默改名（`密码(1).zip`…），越堆越多。
  现经 `resolveVaultDirIdentity`（目录名搜目录条目拿 open 后缀键）+ `isVaultFileInDir`
  （原文相等 → 后缀键相等 → full_path 含目录名）跨命名空间判定，由 `fidIdentityKey` 归一化。
- `deleteFiles` 必须带 `action_type: 1`，缺失报 14001（之前即使找到旧件也删不动）。
  open 与 32-hex 两种 fid 删除均已线上实测通过。
- `rotateVault` 串行锁（cron/启动自检/手动三入口并发会产生 `(N)` 副本）+ 删后轮询确认旧名释放
  （`waitUntilVaultFilesGone`）再传 + 上传后校验实际文件名、被改名则删掉本次改名件重试（最多 3 次）。
  下一次轮换会自动清掉目录内全部历史 `(N)` 副本并恢复单个 `密码.zip`，无需手动清理。
- `checkVaultConsistency` 兜底候选含 `(N)` 改名副本，逐个下载以密码哈希判定并修正 `fid` 指向；
  落盘 `fid`（上传返回的 32-hex）可直下，失败再走搜索兜底。

## 固定分享对齐（重要）

前端链接是静态的 `env.quarkShareUrl`，服务端不会改它，因此：

- 上传目录 + 文件名必须落在该分享覆盖范围内（当前对齐到分享内的 `Duet Night Abyss Builder` 文件夹）。
- 首次上传后检查分享内能看到新文件；之后每天同名覆盖，分享自动指向新版，无需重新分享。
- 改了文件名或换了目录后，记得确认新文件仍在固定分享内，否则弹窗链接打不开密码。

## 测试

- `apps/server/src/util/quark.test.ts`：签名向量、包络/刷新重试、分片上传与秒传、建目录/分享详情/文件详情（全 mock fetch）。
- `apps/server/src/util/safe-mode-vault.test.ts`：密码格式、目标解析（根回退/fid 直用/路径建目录）、CRC32 向量、zip 中央目录 + 系统 `unzip` 真实解包、轮换/校验（含落盘无明文断言）。
- `apps/web/src/api/tests/safe-mode.test.ts`：前端接口封装（verify 401→false、异常抛错）。
- 浏览器实测：`.tmp/safe-mode-dialog.spec.ts`（Playwright + Edge，需 `http://localhost:1420` 运行），截图见 `.tmp/screenshots/safe-mode-dialog.png`。
