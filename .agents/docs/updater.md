# 桌面端自动更新（exe 差量包）

桌面端不再使用 `tauri-plugin-updater` 的整包 MSI 更新（约 50 MB），而是自研了一套 magpie 风格的
更新流程：只下载 `dna-builder.exe` 的 zip（约 30 MB），安装目录里的 `opencv_world490.dll`、
`DirectML.dll` 与 `resources/` 保持原样。

前端入口仍是 `apps/web/src/api/update.ts` 的 `checkUpdate` / `downloadAndInstallUpdate`，
`StartupModal.vue` 无需感知实现变化。

## 流程

```
feed(latest.json / update.json)
  → 版本比较（semver）
  → feed 标记 requires_full_install 时：不下载差量包，UI 引导打开 installer_url（完整 MSI）
  → 下载 exe.zip（Range 断点续传 + 5 次重试）
  → SHA-256 校验
  → 解压 dna-builder.exe 到 %LOCALAPPDATA%\com.pa.dna-builder\updates\<version>\
  → 启动 helper（当前 exe 的 --update-apply 模式）并退出
  → helper 等旧进程退出 → 旧 exe 改名 .old → 暂存 exe 换入 → 重新拉起
  → 下次启动清理 .old
```

关键实现：`apps/web/src-tauri/src/update.rs`（核心 + CLI/helper）与
`apps/web/src-tauri/src/commands/update.rs`（Tauri 命令）。

## Feed 格式

客户端同时兼容两种结构，exe 差量包均要求提供 `sha256`：

```json
// tauri latest.json 外层（CDN 使用），exe 包放在 windows-x86_64-exe
{
  "version": "1.5.3",
  "notes": "...",
  "pub_date": "2026-11-04T00:00:00Z",
  "platforms": {
    "windows-x86_64": { "signature": "...", "url": "...msi" },
    "windows-x86_64-exe": {
      "url": "https://cdn.dna-builder.cn/exe/dna-builder_1.5.3_x64.exe.zip",
      "size": 30123456,
      "sha256": "..."
    }
  }
}

// magpie 风格（仅用于测试/第三方源）
{ "version": "1.5.3", "url": "...", "size": 30123456, "sha256": "..." }

// 必须整包安装的版本：DLL / resources 有变化时使用，客户端不再下载 exe 包
{
  "version": "1.6.0",
  "notes": "...",
  "requires_full_install": true,
  "installer_url": "https://.../DNA%20Builder_1.6.0_x64_zh-CN.msi"
}

// 上一个是整包版本时，后续 exe 差量 feed 必须标出差量基线并提供完整安装回退
{
  "version": "1.7.0",
  "platforms": { "windows-x86_64-exe": { "url": "...zip", "size": 1, "sha256": "..." } },
  "delta_base": "1.6.0",
  "installer_url": "https://.../DNA%20Builder_1.7.0_x64_zh-CN.msi"
}
```

`requires_full_install` 为 true 时无论 `platforms` 里有没有 exe 条目都只走完整安装；缺失时回退到
`platforms["windows-x86_64"]` 的 URL；两者都没有则不视为有更新。旧客户端不认该字段，仍按 MSI 更新。

`delta_base` 是「可安全套用差量包的最低已安装版本」：客户端版本低于它（例如跳过了改动 DLL 的
1.6.0）时不会下载 exe，而是改用 `installer_url`（缺省回退 `platforms["windows-x86_64"]`），
避免用旧 DLL / resources 运行新 exe。发布端设置 `delta_base` 时必须同时提供可达的完整安装包地址。

> CDN 清单里的 `windows-x86_64-exe` 条目仍带 `signature`（复用 MSI 签名）：旧版 tauri updater
> 会把 `platforms` 的每一项都按 `{ url, signature }` 解析，缺字段会让整份 `latest.json` 反序列化失败。

更新源按顺序尝试，可用环境变量覆盖（逗号分隔）：

```bash
DNA_BUILDER_UPDATE_FEED=http://127.0.0.1:8791/latest.json
```

默认值见 `update.rs` 的 `DEFAULT_FEEDS`：
`cdn.dna-builder.cn/latest.json` → `cdn.dobapp.cc/latest.json` →
`github.com/pa001024/dna-builder/releases/latest/download/update.json`。

## 发布

- **GitHub Release**（`.github/workflows/publish.yml`）：tauri-action 打包后，把
  `target/release/dna-builder.exe` 压成 `dna-builder-x64.exe.zip`，生成 `update.json`
  （带 size / sha256）并随 Release 上传；客户端从 `releases/latest/download/update.json` 读取。
  手动触发（`workflow_dispatch`）必须选择 `v*` tag，分支触发的 run 会被 workflow 拒绝。
- **CDN**（`tools/deploy.ts app`）：额外打包并上传 `exe/dna-builder_<version>_x64.exe.zip`，
  把 `windows-x86_64-exe` 写进每端的 `latest.json`（MSI 字段保留给旧客户端）。

> ⚠️ 差量包只包含 exe。若某次发版改动了 DLL、`resources/` 等安装目录文件，**必须按整包发版**，
> 否则旧安装目录会缺文件：
>
> - GitHub Release：手动触发 workflow 时勾选 `full_install`（`workflow_dispatch.inputs.full_install`），
>   此时不打包 exe，`update.json` 写 `requires_full_install: true` + release 里 MSI 的 `installer_url`。
> - CDN：`pnpm deploy app --full-install`，不生成差量包，`latest.json` 带 `requires_full_install`。
>
> 整包版本之后的第一个 exe 差量版本要把基线传给客户端，否则跳过了整包版本的用户会直接套用差量：
>
> - GitHub Release：对该 tag 手动触发 workflow，`delta_base` 填整包版本（如 `1.6.0`）；
>   普通 tag push 不带头部信息，只适合紧接上一个差量版本的常规发版。
> - CDN：`pnpm deploy app --delta-base 1.6.0`。
>
> 客户端收到该标记后只提示、不下载，点击更新会打开完整安装包地址。

> `tauri.conf.json` 仍保留 `plugins.updater` 与 `bundle.createUpdaterArtifacts`：打包器需要它生成
> MSI 的 `.sig` 与旧客户端读取的 `latest.json`；运行时不再注册 `tauri-plugin-updater`。

## 本地联调

```bash
# 1. 打包（用现有构建产物即可）
bun tools/update-pack.ts apps/web/src-tauri/target/release/dna-builder.exe \
    .tmp/update-server 1.5.3 "test update" http://127.0.0.1:8791

# 1b. 整包 feed（验证 requires_full_install 路径，不会生成 zip）
bun tools/update-pack.ts - .tmp/update-server-full 1.5.3 "test" \
    --full-install https://example.com/DNA%20Builder_1.5.3_x64_zh-CN.msi

# 2. 起本地更新服务器（支持 Range，可验证断点续传）
bun tools/update-server.ts .tmp/update-server 8791

# 3. 端到端验证：检查 / 下载 / 替换
DNA_BUILDER_UPDATE_FEED=http://127.0.0.1:8791/latest.json \
    <安装目录>/dna-builder.exe --update-check
DNA_BUILDER_UPDATE_FEED=http://127.0.0.1:8791/latest.json \
    <安装目录>/dna-builder.exe --update-cli --install --no-relaunch
```

### Program Files 提权路径

MSI 默认装在 `C:\Program Files\DNA Builder`，普通用户对该目录不可写，必须单独验证提权分支
（CLI 输出 `"elevated": true`，`apply.log` 记录 `elevated=true`），只测用户目录不算覆盖：

1. 用管理员权限把 release 产物复制到 `C:\Program Files\DNA Builder UAC Test`（连同 DLL 与 `resources/`）；
2. 用「release exe 追加几个字节」生成差量包，保证替换前后哈希不同；
3. 以普通权限运行测试目录里的 exe：`--update-cli --install --no-relaunch`；
4. 校验目标 exe 哈希等于包内 exe、`.old` 等于原 exe，`apply.log` 出现 `替换完成`。

> UAC 是否弹窗取决于本机设置；`ConsentPromptBehaviorAdmin=0`（无提示提权）下可全自动验证。
> GUI 更新走同一个 helper，唯一差异是 `update_install` 在启动 helper 后调用 `app.exit(0)`。

## CLI / helper 参数

| 参数 | 说明 |
|---|---|
| `--update-check` | 只检查更新并打印 JSON 结果 |
| `--update-cli [--install] [--no-relaunch]` | 检查 + 下载 +（可选）安装；测试用 |
| `--update-apply --parent-pid <pid> --staged <exe> --target <exe> [--relaunch] [--elevated]` | 安装 helper，内部使用；`--elevated` 表示重启时用 explorer 回到普通用户身份 |

## 安全边界

- feed 必须提供 `sha256`，缺失时直接拒绝下载；下载完成后校验整个包。
- 默认更新源均为 HTTPS；本地联调才用 `DNA_BUILDER_UPDATE_FEED` 指向 HTTP。
- 不做代码签名校验，信任链是 HTTPS feed + SHA-256（与 magpie 的 Windows 路径一致）。
- 替换过程失败会立即回滚原 exe；新版本启动失败不做自动回滚，原 exe 会保留为 `.old` 供手工恢复。

## 权限与回滚

- 安装目录可写（便携版 / 用户目录）：helper 直接完成替换。
- 安装目录不可写（默认 MSI 装在 `C:\Program Files\DNA Builder`）：启动 helper 时走 UAC
  （`ShellExecuteW runas`）；用户取消则保留暂存包并返回错误，应用不退出。
- 替换前先 `rename` 当前 exe 为 `.old`；换入失败会立即回滚。`.old` 在下次启动（可写目录）或下次提权更新时清理，
  Program Files 下普通用户无法删除，会保留到下一次更新。
- 替换 helper 是旧 exe 的 `--update-apply` 模式，不会初始化 Tauri，因此不会和单实例插件冲突。
- 失败日志：`%LOCALAPPDATA%\com.pa.dna-builder\updates\apply.log`。
