# 二重螺旋构筑模拟器 Duet Night Abyss Builder

<p align="center">
  <a href="https://dna-builder.edgeone.dev/"><img alt="Website" src="https://img.shields.io/website/https/dna-builder.edgeone.dev"></a>
  <a href="https://github.com/pa001024/dna-builder/actions/workflows/alpha.yml"><img src="https://img.shields.io/github/actions/workflow/status/pa001024/dna-builder/alpha.yml" alt="Build Status"></a>
  <a href="https://github.com/pa001024/dna-builder"><img src="https://img.shields.io/github/license/pa001024/dna-builder" alt="License"></a>
  <img alt="GitHub code size in bytes" src="https://img.shields.io/github/languages/code-size/pa001024/dna-builder">
</p>

**DNA Builder** （二重螺旋构筑模拟器）简称DOB，是一个用于游戏《Duet Night Abyss》的角色构建和伤害计算工具，帮助玩家优化角色配置和计算战斗输出。

## 网页版

支持 PWA( Progressive Web App ), 可以在浏览器中安装为应用(支持断网访问), 无需下载安装

- **国内服务器**: [https://xn--chq26veyq.icu/](https://xn--chq26veyq.icu/)
- **EdgeOne(国内访问不了)**：[https://dna-builder.edgeone.dev/](https://dna-builder.edgeone.dev/)
- **Vercel(国内访问不了)**：[https://dna-builder.vercel.app/](https://dna-builder.vercel.app/)

## 桌面应用

- **Windows**：[https://github.com/pa001024/dna-builder/releases/latest](https://github.com/pa001024/dna-builder/releases/latest)
- **无法运行**? 请确保已安装 [Microsoft Edge WebView2](https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/)。

## 功能特点

- 🎮 **角色构建系统**：支持角色属性、技能、武器和 MOD 配置
- 📊 **伤害计算引擎**：精确计算技能伤害和武器伤害期望
- ⚙️ **多种计算模式**：支持伤害 (DPA)、每秒伤害 (DPS)、每神智伤害 (DPAPM) 等多种目标函数
- 🎨 **直观界面**：友好的用户界面，方便快速配置和查看结果
- 🔄 **实时计算**：配置变化时实时更新计算结果

## 技术栈

### 前端

- **框架**：Vue 3 + TypeScript
- **构建工具**：Vite
- **UI 组件库**：Tailwind CSS + daisyui + radix-vue
- **状态管理**：Pinia
- **路由**：Vue Router
- **国际化**：i18next
- **动画**：GSAP
- **工具库**：lodash-es, @vueuse/core

### 桌面应用

- **框架**：Tauri (Rust + WebView2)
- **插件**：clipboard-manager, opener, process, updater

### 服务器端（可选）

- **运行时**：Bun
- **框架**：Elysia
- **数据库**：SQLite + Drizzle ORM
- **GraphQL**：graphql-yoga + graphql-mobius

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
```

### 桌面应用

```bash
# 开发模式运行桌面应用
pnpm tauri dev

# 构建桌面应用
pnpm tauri build
```

## 项目结构

```
dna-builder/
├── src/                  # 源代码
│   ├── App.vue           # 应用入口组件
│   ├── main.ts           # 应用入口文件
│   ├── components/       # 组件目录
│   ├── data/             # 数据和计算相关
│   │   ├── AI.md         # 系统文档
│   │   ├── CharBuild.ts  # 核心计算类
│   │   ├── data-types.ts # 数据类型定义
│   │   └── leveled/      # 等级相关类
│   ├── store/            # 状态管理
│   └── views/            # 页面组件
├── public/               # 静态资源
│   ├── imgs/             # 图片资源
│   └── i18n/             # 国际化资源
├── src-tauri/            # Tauri 配置和代码
└── package.json          # 项目配置
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
- **多种目标函数**：
    - 伤害 (DPA)：单次攻击/技能的伤害期望
    - 每秒伤害 (DPS)：单位时间内的伤害期望
    - 每神智伤害 (DPAPM)：消耗单位神智的伤害期望
    - 其他进阶目标函数

### 敌方配置

- **敌方类型**：小型、大型、首领
- **敌方等级**：设置敌方等级
- **敌方抗性**：配置敌方抗性
- **敌方血量类型**：生命、护盾、战姿

## 使用示例

`dna-builder-data`已发布到 NPM, 可以直接在项目中引入使用

```
npm install dna-builder-data
```

```typescript
// 创建角色构建实例
import { CharBuild, LeveledChar, LeveledWeapon, LeveledMod, LeveledBuff } from "dna-builder-data"

const options = {
    char: new LeveledChar("黎瑟"),
    hpPercent: 0.5,
    resonanceGain: 2,
    mods: [new LeveledMod(41324)],
    buffs: [new LeveledBuff("助战50攻", 1)],
    melee: new LeveledWeapon("铸铁者"),
    ranged: new LeveledWeapon("烈焰孤沙"),
    skillLevel: 10,
    baseName: "铸铁者",
    enemyType: "小型",
    enemyLevel: 80,
    enemyResistance: 0.5,
    enemyHpType: "生命",
    targetFunction: "伤害",
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
