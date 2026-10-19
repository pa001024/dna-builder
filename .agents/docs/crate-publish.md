# 发布 crate：dob-calc-core

`crates/dob-calc-core` 独立发版到 crates.io。触发方式与 `publish-data.yml` 一致：**改版本号 + 合入 master 自动发**，不打 tag。

| 文件 | 作用 |
|---|---|
| `.github/workflows/publish-dob-calc-core.yml` | 发布流程（唯一 CI，没有单独的 test/lint workflow） |
| `crates/dob-calc-core/Cargo.toml` | 版本号 + crates.io 元数据（description / license / repository…） |
| `crates/dob-calc-core/README.md` | crates.io 首页正文 |

触发条件：push 到 `master` 且改动包含 `crates/dob-calc-core/Cargo.toml`，或手动 `workflow_dispatch`。

## 一、首次发布（必须手工做一次）

crates.io 的 trusted publisher 只能挂在**已存在**的 crate 上，所以 0.1.0 得自己传。

1. 建 token：https://crates.io/settings/tokens → New Token，scope 勾 `publish-new` + `publish-update`。token 只显示一次，先存好。
2. 本地登录：

```bash
cargo login            # 粘贴 token，写入 ~/.cargo/credentials.toml
```

3. 前提：账号邮箱已验证（https://crates.io/settings/profile）。没验证时 `cargo publish` 会在上传阶段被 400 拒掉，token 有效也没用。

4. ⚠️ **本机 `~/.cargo/config.toml` 把 crates-io 替换成了 aliyun 镜像**，不加参数会报
   `error: crates-io is replaced with non-remote-registry source registry 'aliyun'`。发布必须显式指定真源：

```bash
cd crates/dob-calc-core
cargo publish --registry crates-io               # 真正上传，不可撤回
cargo publish --registry crates-io --dry-run     # 只想校验打包时用这个
```

工作区有未提交改动（新增 README 等）时 cargo 会拒绝，加 `--allow-dirty` 放行。

5. 上传成功后去 https://crates.io/crates/dob-calc-core/settings 配 trusted publisher：

| 字段 | 值 |
|---|---|
| Provider | GitHub Actions |
| Repository owner | `pa001024` |
| Repository name | `dna-builder` |
| Workflow file | `publish-dob-calc-core.yml` |
| Environment | **留空** |

workflow 里没有声明 `environment`，所以这里也必须留空；文件名改一个字就换不出 token。配好后可选开 “Require trusted publishing”，彻底禁掉长期 token 上传。

## 二、日常发版

```bash
# 1. 改版本号（crates.io 版本永久不可覆盖、不可删除，只能 yank）
#    crates/dob-calc-core/Cargo.toml: version = "0.1.1"

# 2. 改动提 PR 合入 master：只要这次 commit 里动了 Cargo.toml 就会触发
```

workflow 依次：读本地版本 → 查 crates.io 是否已有该版本（有则整条跳过）→ `--dry-run` 打包 → OIDC 换 token → `cargo publish --locked`。

重复推送不会有副作用：版本号没变就一路 skip（与 `publish-data.yml` 的 `version_check` 同款），所以「忘了改版本号就合入」只是空跑一次。

手动发（例如想重跑）：Actions → `publish-crate` → Run workflow。

成功后 docs.rs 几分钟内自动出文档，GitHub Step Summary 里有 crates.io / docs.rs 链接。

## 三、备选：不想用 OIDC

在仓库 Secrets 里加 `CARGO_REGISTRY_TOKEN`（crates.io 的 token）。workflow 已有分支：secret 非空时跳过 OIDC、直接用 secret；为空才走 trusted publishing。两者都不配则 publish 步骤 401。

## 四、撤回

```bash
cargo yank --registry crates-io --version 0.1.1   # 阻止新解析，代码仍在，可 --undo
```

## 五、排障

| 现象 | 原因 / 处理 |
|---|---|
| `crates-io is replaced with non-remote-registry` | 本机镜像配置；加 `--registry crates-io` |
| `crate version already exists` | 版本号重复；crates.io 不允许覆盖，只能升版本 |
| `A verified email address is required to publish` | 账号没验证邮箱；去 https://crates.io/settings/profile 填邮箱并点验证邮件里的链接（token 有效也没用，这是账号级门槛） |
| 合入 master 后 workflow 没跑 | `paths` 只监听 `crates/dob-calc-core/Cargo.toml`；没动它就不会触发，手动 Run workflow |
| workflow 跑了但一路 skip | 该版本已发布过；升版本号 |
| `not allowed to publish` / 401 | token 缺 scope，或 trusted publisher 的 repo / workflow / environment 不匹配（environment 必须留空） |
| `invalid category` | `Cargo.toml` 的 `categories` 只认 crates.io 分类 slug（当前用 `games`、`wasm`） |

## 六、当前已知状态

- 包体：103 文件 / 4.4 MiB（压缩后 ~570 KiB），含 `tests/fixtures`，未超 crates.io 上限。
- 没有测试 / lint workflow：`cargo test --locked`（42 lib + 全部 parity）、`cargo fmt`、`clippy` 全靠本地手动跑。
- crate-type 含 `cdylib`：rlib 给 Rust 调用方，cdylib 给 wasm / 动态加载，`capi` 模块是入口。
