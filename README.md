# 二重螺旋构筑模拟器 Duet Night Abyss Builder

<p align="center">
  <a href="https://dna-builder.edgeone.dev/"><img alt="Website" src="https://img.shields.io/website/https/dna-builder.edgeone.dev"></a>
  <a href="https://github.com/pa001024/dna-builder/actions/workflows/alpha.yml"><img src="https://img.shields.io/github/actions/workflow/status/pa001024/dna-builder/alpha.yml" alt="Build Status"></a>
  <a href="https://github.com/pa001024/dna-builder"><img src="https://img.shields.io/github/license/pa001024/dna-builder" alt="License"></a>
  <img alt="GitHub code size in bytes" src="https://img.shields.io/github/languages/code-size/pa001024/dna-builder">
</p>

**DNA Builder** （二重螺旋构筑模拟器）简称DOB，是一个用于游戏《二重螺旋 Duet Night Abyss》的多功能工具，提供资料库、养成计算、角色构建和伤害计算工具等诸多功能

## 网页版

支持 PWA (Progressive Web App), 可以在浏览器中安装为应用(支持断网访问), 无需下载安装

- **国内服务器**: [https://xn--chq26veyq.icu/](https://xn--chq26veyq.icu/)
- **EdgeOne(国内访问不了)**：[https://dna-builder.edgeone.dev/](https://dna-builder.edgeone.dev/)
- **Vercel(国内访问不了)**：[https://dna-builder.vercel.app/](https://dna-builder.vercel.app/)

## 桌面应用(推荐)

- **winget**: `winget install pa001024.dna-builder`
- **微软商店**: [https://apps.microsoft.com/detail/9nk8zw43shb1](https://apps.microsoft.com/detail/9nk8zw43shb1)
- **Windows**：[https://github.com/pa001024/dna-builder/releases/latest](https://github.com/pa001024/dna-builder/releases/latest)
- **无法运行**? 请确保已安装 [Microsoft Edge WebView2](https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/)。

微软商店截图
![微软商店截图](./misc/1.png)

## 支持作者

如果您喜欢这个项目，并且想支持作者的工作，请考虑以下方式：

- **直接捐赠**：[https://afdian.com/a/pa001024](https://afdian.com/a/pa001024)
- **购买应用**：[https://apps.microsoft.com/detail/9nk8zw43shb1](https://apps.microsoft.com/detail/9nk8zw43shb1)

## 功能特点

- 🎮 **角色构建系统**：支持角色属性、技能、武器和 MOD 配置
- 🔨 **自动构建**：一键获取当前配置下最大伤害武器+MOD组合
- 📊 **伤害计算引擎**：精确计算技能伤害和武器伤害期望
- ⚙️ **目标函数**：支持自定义表达式
- 🎨 **直观界面**：友好的用户界面，方便快速配置和查看结果
- 🔄 **实时计算**：配置变化时实时更新计算结果
- 🎣 **钓鱼模拟器**：内置钓鱼数据库，支持模拟钓鱼过程
- 🔒 **密函模拟器**：内置密函数据库，支持模拟开核桃
- 📦 **库存管理**：支持武器、MOD 等物品的库存管理
- 🔍 **拼音搜索**：支持中文拼音搜索，快速查找角色、武器、MOD
- 🏆 **成就系统**：支持成就记录
- 🤖 **MCP Server**：提供 Model Context Protocol 支持，可用于 AI 集成

## 技术栈

### 前端

- **框架**：Vue 3 + TypeScript
- **构建工具**：Vite
- **UI 组件库**：Tailwind CSS + daisyui + reka-ui
- **状态管理**：Pinia
- **路由**：Vue Router
- **国际化**：i18next + i18next-http-backend
- **动画**：GSAP
- **工具库**：lodash-es, @vueuse/core
- **其他**：dexie (IndexedDB), vue-flow (流程图), markdown-it (Markdown 渲染)
- **监控**：Sentry (错误追踪和性能监控)
- **PWA**：workbox (离线支持)

### 桌面应用

- **框架**：Tauri 2 (Rust + WebView2)
- **插件**：clipboard-manager, dialog, http, notification, opener, process, updater

### 服务器端（可选）

- **运行时**：Bun
- **框架**：Elysia
- **数据库**：SQLite + Drizzle ORM
- **GraphQL**：graphql-yoga + graphql-mobius + graphql-jit
- **认证**：jsonwebtoken + bcrypt
- **存储**：ali-oss (阿里云 OSS)
- **其他**：canvas (图像处理), rxjs (响应式编程)

### MCP Server (AI 集成)

- **框架**：Rust + tokio
- **协议**：Model Context Protocol SDK

## 多语言支持

目前界面, 角色, MOD, 武器已加入翻译

- **中文(简体/繁体)**：默认语言
- **英文**
- **日本語**
- **한국어**
- **其他语言**：欢迎贡献翻译

## 安装和运行

### 开发环境

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 类型检查和代码规范
pnpm lint

# 运行测试
pnpm test

# 运行测试并生成覆盖率报告
pnpm coverage

# 格式化代码
pnpm format
```

### 桌面应用

```bash
# 开发模式运行桌面应用
pnpm tauri dev

# 构建桌面应用
pnpm tauri build
```

### 服务器端

```bash
# 进入服务器目录
cd server

# 安装依赖
bun install

# 启动开发服务器
bun dev

# 生成数据库迁移
bun run gen

# 执行数据库迁移
bun run migrate
```

### MCP Server

```bash
# 构建 MCP Server
pnpm build:mcp

# 同时构建前端和 MCP Server
pnpm build:all
```

## 项目结构

```
dna-builder/
├── src/                  # 前端源代码
│   ├── App.vue           # 应用入口组件
│   ├── main.ts           # 应用入口文件
│   ├── components/       # Vue 组件
│   ├── data/             # 游戏数据和计算逻辑
│   │   ├── CharBuild.ts  # 核心计算类
│   │   ├── data-types.ts # 数据类型定义
│   │   ├── leveled/      # 等级相关类
│   │   └── tests/        # 单元测试
│   ├── store/            # Pinia 状态管理
│   ├── views/            # 页面组件
│   ├── api/              # API 调用
│   ├── utils/            # 工具函数
│   └── router/           # 路由配置
├── public/               # 静态资源
│   ├── imgs/             # 图片资源
│   └── i18n/             # 翻译文件
├── src-tauri/            # Tauri 桌面应用配置和 Rust 代码
├── server/               # 服务端代码（Bun + Elysia）
├── mcp_server/           # MCP Server (Rust)
├── externals/            # 外部依赖
│   └── dna-api/          # DNA API 包
├── tools/                # 开发工具
│   ├── i18n_tool.ts      # 国际化管理工具
│   └── icon_tool.ts      # 图标管理工具
├── .github/              # GitHub Actions 工作流
├── package.json          # 前端项目配置
├── tsconfig.json         # TypeScript 配置
├── vite.config.ts        # Vite 构建配置
└── vitest.config.ts      # 测试配置
```

## 核心功能

### 角色构建

- **角色选择**：选择游戏中的角色
- **等级配置**：设置角色等级
- **技能选择**：配置角色技能和等级
- **武器装备**：选择近战和远程武器
- **MOD 配置**：装备和管理 MOD
- **BUFF 设置**：添加和配置 BUFF

### 伤害计算

- **属性计算**：计算角色的基础属性和战斗属性
- **技能伤害**：精确计算技能的伤害期望
- **武器伤害**：计算武器的单次伤害和触发效果
- **目标函数: 自定义表达式**：
    - 支持数据的自定义表达式
    - 例如：`(伤害 + 神智) * 范围`

### 敌方配置

- **敌方类型**：小型、大型、首领
- **敌方等级**：设置敌方等级
- **敌方抗性**：配置敌方抗性
- **敌方血量类型**：生命、护盾、战姿

## dna-api

皎皎角API组件 [dna-api](https://www.npmjs.com/package/dna-api) 提供了与游戏数据交互的 API 接口, 已发布到 NPM, 可以直接在项目中引入使用

```bash
npm install dna-api
# pnpm
pnpm install dna-api
# bun
bun install dna-api
```

## dna-builder-data

核心计算组件 [dna-builder-data](https://www.npmjs.com/package/dna-builder-data) 已发布到 NPM, 可以直接在项目中引入使用

```
npm install dna-builder-data
```

```typescript
// 创建角色构建实例
import { CharBuild, LeveledChar, LeveledWeapon, LeveledMod, LeveledBuff } from "dna-builder-data"

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

// 计算伤害
const cb = new CharBuild(options)
const damage = cb.calculate() // 获取计算结果
```

## 属性计算规则

### 基础属性

- 攻击、生命、护盾、防御受等级影响
- 神智属性为固定值
- 所有属性都可以通过武器、MOD 和 BUFF 获得加成

### 战斗属性

- 威力、耐久、效益、范围起始值为 1
- 其他属性起始值为 0
- 部分属性有上限限制

### 伤害计算

#### 技能伤害

```
技能伤害期望 = 技能基础伤害 * (1 - 敌方抗性 + 属性穿透) * 昂扬乘区 * 背水乘区 * 防御乘区 * (1 + 增伤 + 技能伤害) * (1 + 独立增伤)
```

#### 武器伤害

```
武器伤害期望 = 武器攻击倍率 * (角色攻击 * (1 - 敌方抗性 + 属性穿透) + 武器伤害物理部分 * (1 + 触发伤害倍率 * 武器触发)) * (1 + 暴击率 * (暴击伤害 - 1)) * 昂扬乘区 * 背水乘区 * 防御乘区 * (1 + 增伤 + 武器伤害) * (1 + 独立增伤) * (1 + 追加伤害)
```

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 联系方式

如有问题或建议，请通过以下方式联系：

- Issue：在 GitHub 仓库提交 Issue

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=pa001024/dna-builder&type=date&legend=top-left)](https://www.star-history.com/#pa001024/dna-builder&type=date&legend=top-left)
