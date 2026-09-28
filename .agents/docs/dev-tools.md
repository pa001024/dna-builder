# Dev Tools（tools/ 脚本明细）

AGENTS.md 只列命令，这里是每个脚本的用途、输入输出与注意事项。

## i18n

`bun tools/i18n-tool.ts export|import` — 导出缺失的翻译、导入翻译好的结果。

## 图标

`bun tools/icon-tool.ts add|check|clean|list` — 管理 `src/components/Icon.vue` 里的图标；
lint 报「icon not found」时用它。

## API 生成

`pnpm gen` — 由 `tools/generate-api-calls.ts` 生成 API 调用。

## 称号框（title frames）

`pnpm itf`（`bun tools/import-title-frame.ts`）— 通过 fmodel-cli 读取游戏 pak，重新生成称号框渲染数据：

- 产物：`src/data/generated/title-frame.generated.ts`、
  `src/data/generated/title-frame-textures.json`（webp 文件名 → 游戏内包路径的清单）、
  `public/imgs/titleframe/*.webp`；
- 预览：dev server 上打开 `tools/title-frame-preview.html`（`?frames=07_1,09_1` 可缩小范围）。

贴图同名冲突：遇到冲突会改写成带父目录前缀的名字（如 `13_T_PersonalInfo_Title_13_08.webp`），
basename 与源 PNG 对不上。`tools/webp-import.ts` 会读上面那份清单，按包路径补齐这些贴图，
因此 `bun tools/webp-import.ts` 也能覆盖它们，不会误报缺失。

## 属性 i18n

`pnpm iattr`（`bun tools/import-attr-i18n.ts`）— 把上游 `out/AttrConfig.json` + `out/TextMap_I18n.json` 里的：

- 属性名（`Attr_*_Name`，如 `Attr_ATK_Fire_Name`）→ 补进根命名空间；
- 属性说明（`ATTR_DESC_*`，如 `ATTR_DESC_ATK_Fire`）→ 写入 `attrDesc` 命名空间。

规则与落地位置：

- 键均为属性在 zh-CN 下的展示名（攻击行按元素/伤害类型区分，如 `火属性攻击`、`切割攻击`）；
- **只补缺失键，不覆盖已有译文**；
- 读取入口 `src/composables/useAttrI18n.ts`，展示在角色属性面板（`CharAttrShow.vue`）与武器面板
  （`WeaponTab.vue`）的属性来源 tooltip 标题与说明里；
- 上游目录默认取同级 `DuetNightAbyssData2`，缺失时回退 `D:/dev/DuetNightAbyssData2`，
  可用 `--upstream <dir>` 或 `DNA_UPSTREAM` 覆盖；`--check` 只比对不落盘。

## 游戏文本包

`pnpm importdata` 会额外产出 `src/data/d/translations.data.ts` —— 把上游
`final/i18n/<locale>/translation.json`（本身就是「简体中文原文 → 译文」扁平表）压成 tc/en/jp/kr/fr
五份对照表，随数据包下发。

- 前端由 `src/data/translations-pack.ts` 在读包后注入 i18next（走 `data-pack.ts` 的激活钩子，
  **禁止反向 import 以免循环依赖**）；
- 检索层的反向索引（译文 → 原文）优先查这份表；
- `pnpm prune-i18n`（`bun tools/prune-migrated-i18n.ts`）据此把 `public/i18n` 里已迁移的中文键条目删掉，
  `--check` 只报告；
- **保留项**：英文点号键的界面文案、角色特质、属性名与 `attrDesc`（上游没有这些文案）；
  zh-CN 整体不动（fallbackLng，不进包）；
- 数据包未安装时界面显示中文原文，属预期降级。

## 数据包与图片包

- `pnpm dp`（`bun tools/data-pack.ts build|upload`）— 打包 `src/data/d/**/*.data.ts` 为 msgpack
  数据包并（可选）上传 OSS/CDN，同时写 `mock/data-pack/versions.json`；
- `pnpm ip`（`bun tools/imgs-pack.ts build`）— 图片包；
- dev 环境数据包基址是 `/mock/data-pack`（本地仓库目录），无需联网即可安装。
