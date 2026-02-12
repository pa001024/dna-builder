# 二重螺旋构筑模拟器 Duet Night Abyss Builder

<p align="center">
  <a href="https://dna-builder.edgeone.dev/"><img alt="Website" src="https://img.shields.io/website/https/dna-builder.edgeone.dev"></a>
  <a href="https://github.com/pa001024/dna-builder/actions/workflows/alpha.yml"><img src="https://img.shields.io/github/actions/workflow/status/pa001024/dna-builder/alpha.yml" alt="Build Status"></a>
  <a href="https://github.com/pa001024/dna-builder"><img src="https://img.shields.io/github/license/pa001024/dna-builder" alt="License"></a>
  <img alt="GitHub code size in bytes" src="https://img.shields.io/github/languages/code-size/pa001024/dna-builder">
</p>

**DNA Builder**（二重螺旋构筑模拟器，简称 DOB）是面向《二重螺旋 Duet Night Abyss》的综合工具，提供资料检索、角色构建、养成分析与伤害计算能力。

## 使用入口

### 网页版（支持 PWA）

可直接在浏览器中安装为应用，支持离线访问。

- **国内服务器**: [https://dna-builder.cn/](https://dna-builder.cn/)
- **EdgeOne**: [https://dna-builder.edgeone.dev/](https://dna-builder.edgeone.dev/)
- **Vercel**: [https://dna-builder.vercel.app/](https://dna-builder.vercel.app/)

### 桌面版（推荐）

- **winget**: `winget install pa001024.dna-builder`
- **微软商店**: [https://apps.microsoft.com/detail/9nk8zw43shb1](https://apps.microsoft.com/detail/9nk8zw43shb1)
- **GitHub Releases**: [https://github.com/pa001024/dna-builder/releases/latest](https://github.com/pa001024/dna-builder/releases/latest)
- **运行前置**: 请确保已安装 [Microsoft Edge WebView2](https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/)

微软商店截图

![微软商店截图](./misc/1.png)

## 功能特点

- 🎮 角色构建：角色、武器、MOD、BUFF 的可视化配置
- 🔨 自动构建：一键搜索当前条件下的高收益组合
- 📊 伤害计算：技能与武器伤害期望的实时计算
- ⚙️ 目标函数：支持自定义表达式优化
- 📦 库存管理：支持武器与 MOD 的库存记录与筛选
- 🔍 拼音搜索：快速检索角色、武器与 MOD
- 🎣 钓鱼模拟器：内置鱼类与钓点相关数据
- 🔒 密函模拟器：内置密函数据与模拟流程
- 🏆 成就系统：记录与跟踪成就进度
- 🤖 MCP Server：支持 AI 工具集成

## 技术栈

### 前端

- Vue 3 + TypeScript
- Vite 7
- Tailwind CSS v4 + daisyUI v5 + reka-ui
- Pinia + Vue Router
- i18next
- Vitest + Biome

### 桌面应用

- Tauri 2（Rust + WebView2）

### 服务端（可选）

- Bun + Elysia
- SQLite + Drizzle ORM
- GraphQL Yoga

### MCP Server（可选）

- Rust + Tokio
- Model Context Protocol SDK

## 多语言

目前支持（含部分数据翻译）：

- 中文（简体 / 繁体）
- English
- 日本語
- 한국어

欢迎提交翻译改进。

## 开发说明

### 环境要求

- Node.js（建议 20+）
- `pnpm`（项目使用 `pnpm`）
- `bun`（用于 server 与工具脚本）
- Rust 工具链（开发 Tauri / MCP Server 时需要）

### 前端

```bash
# 安装依赖
pnpm install

# 本地开发（默认 http://localhost:1420/）
pnpm dev

# 代码检查（Biome + vue-tsc）
pnpm lint

# 单元测试
pnpm test

# 覆盖率
pnpm coverage

# 代码格式化
pnpm format
```

### 桌面应用（Tauri）

```bash
pnpm tauri dev
pnpm tauri build
```

### 服务端（Bun + Elysia）

```bash
cd server
bun install

# 开发模式（含迁移）
bun run dev

# 生成迁移
bun run gen

# 执行迁移
bun run mig
```

### MCP Server（Rust）

```bash
# 仅构建 MCP Server
cd mcp_server
cargo build --release

# 在仓库根目录构建 mcp_server 并打包到前端输出
cd ..
pnpm build:mcp
```

### 常用工具命令

```bash
# 生成 API 调用代码
pnpm gen

# 图标管理
bun tools/icon_tool.ts add|check|clean|list

# i18n 导入导出
bun tools/i18n_tool.ts export|import
```

## 项目结构

```text
dna-builder/
├── src/                  # 前端主代码
│   ├── components/       # Vue 组件
│   ├── data/             # 游戏数据与计算逻辑（含 tests）
│   ├── store/            # Pinia 状态管理
│   ├── views/            # 页面视图
│   ├── api/              # API 调用
│   ├── utils/            # 工具函数
│   └── router.ts         # 路由配置
├── public/               # 静态资源（图片、i18n 等）
├── src-tauri/            # Tauri Rust 代码
├── server/               # Bun + Elysia 服务端
├── mcp_server/           # Rust MCP Server
├── externals/dna-api/    # 外部 dna-api 包源码
└── tools/                # 开发工具脚本
```

## 相关包

### dna-api

[dna-api](https://www.npmjs.com/package/dna-api) 提供游戏数据访问接口。

```bash
npm install dna-api
# or
pnpm install dna-api
# or
bun install dna-api
```

### dna-builder-data

[dna-builder-data](https://www.npmjs.com/package/dna-builder-data) 提供核心计算模型。

```bash
npm install dna-builder-data
```

```typescript
import { CharBuild, LeveledBuff, LeveledChar, LeveledMod, LeveledWeapon } from "dna-builder-data"

const options = {
    char: new LeveledChar("黎瑟", 80),
    melee: new LeveledWeapon("铸铁者"),
    ranged: new LeveledWeapon("烈焰孤沙"),
    charMods: [new LeveledMod(41324)],
    buffs: [new LeveledBuff("黎瑟E")],
    hpPercent: 1,
    resonanceGain: 0,
    baseName: "普通攻击",
    targetFunction: "DPS",
    enemyId: 130,
    enemyLevel: 80,
    skillLevel: 10,
}

const cb = new CharBuild(options)
const damage = cb.calculate()
```

## 支持作者

如果这个项目对你有帮助，欢迎支持：

- 爱发电: [https://afdian.com/a/pa001024](https://afdian.com/a/pa001024)
- 微软商店购买: [https://apps.microsoft.com/detail/9nk8zw43shb1](https://apps.microsoft.com/detail/9nk8zw43shb1)

## 贡献

欢迎提交 Issue 与 Pull Request。

## 许可证

MIT License

## 联系方式

如有问题或建议，请在 GitHub 仓库提交 Issue。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=pa001024/dna-builder&type=date&legend=top-left)](https://www.star-history.com/#pa001024/dna-builder&type=date&legend=top-left)
