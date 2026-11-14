# Dev Tools（tools/ 脚本明细）

AGENTS.md 只列命令，这里是每个脚本的用途、输入输出与注意事项。

## i18n

统一 CLI `bun i18n`（= `bun tools/i18n.ts`，取代旧的 `tools/i18n-tool.ts` 与 `tools/i18n-check.ts`）：

- `bun i18n add <key> [语言参数…]` — 插入或覆盖翻译。语言参数用短名
  （`-cn/-en/-jp/-ja/-kr/-ko/-fr/-tw`），别名见 `bun i18n langs`；未指定的语言不写入，运行期回落 zh-CN。
  key 含 `.` 时按嵌套命名空间写入，`--flat` 强制顶层，`--dry-run` 只预览。
  **新增文案默认补齐 6 种语言、每种用自己的语言书写**；命令结束按实际文件内容检查，
  缺语言时输出 `⚠ warning`（只改一门译文、文件本就齐全时不误报）。
- `bun i18n get <key> [--lang cn,en] [--json]` — 读取某键各语言的值（默认全部 6 种）。
- `bun i18n find <文本> [--lang cn,en] [--exact] [--limit N] [--json]`（`search` 同义）— 按译文反查 key，默认 6 语言大小写不敏感子串匹配。
- `bun i18n rm <key>` — 删除某键（所有语言）。
- `bun i18n export|import` — 导出缺失翻译到 `tools/i18n-diff.json`、导入后删除该文件。
- `bun i18n check [--json] [--locale-gap]` — 扫描代码中静态引用（`t("x")` 系列）但 zh-CN 未配置的键。
- 不允许并发写, 如果需要添加多条 请用`&&`或`;`来分隔多条指令串行添加!!!

add 的完整示例（6 种语言各用自己的语言书写，不要漏、不要 6 个都填中文）：

```bash
bun i18n add setting.generative_ai \
  -cn "生成式AI" -tw "生成式AI" -en "Generative AI" -jp "生成AI" -kr "생성형 AI" -fr "IA générative"
```

## 图标

`bun tools/icon-tool.ts add|check|clean|list` — 管理 `apps/web/src/components/Icon.vue` 里的图标；
lint 报「icon not found」时用它。

## API 生成

`pnpm gen` — 由 `tools/generate-api-calls.ts` 生成 API 调用。

## 称号框（title frames）

`pnpm itf`（`bun tools/import-title-frame.ts`）— 通过 fmodel-cli 读取游戏 pak，重新生成称号框渲染数据：

- 产物：`apps/web/src/utils/title-frame/title-frame.generated.ts`、
  `apps/web/src/utils/title-frame/title-frame-textures.json`（webp 文件名 → 游戏内包路径的清单）、
  `public/imgs/titleframe/*.webp`；
- 预览：dev server 上打开 `tools/title-frame-preview.html`（`?frames=07_1,09_1` 可缩小范围）。

贴图同名冲突：遇到冲突会改写成带父目录前缀的名字（如 `13_T_PersonalInfo_Title_13_08.webp`），
basename 与源 PNG 对不上。`tools/webp-import.ts` 会读上面那份清单，按包路径补齐这些贴图，
因此 `bun tools/webp-import.ts` 也能覆盖它们，不会误报缺失。

新客户端资源滞后（补充包）：`TitleFrame.lua` 先行、本地游戏 pak 还没有对应 WBP（如 15_x）时：

1. 用 FModel 把缺的资产导出到 `D:/dev/dna-unpack/Fmodel/Output/Exports/`；
2. 收集 `.uasset/.uexp`（及 `.ubulk`）按 `EM/Content/...` 原结构打补充包：
   `repak pack <暂存目录> -q` 后改名 `*_P.pak` 放进 `D:/dev/dna-unpack/SupplementPaks/`
   （如 `Title15_P.pak`；fmodel-cli 配置的 `PatchPaksDirs` 已含该目录）；
3. 直接跑全量 `pnpm itf`（**不要用 `--frames`，它会按选中子集重写生成文件并删掉其余贴图**）。

脚本侧对新客户端做了两处兼容（`tools/import-title-frame.ts`）：

- 引用路径归一：新资产内部用 `/Game/` 挂载前缀，`objectPathToPackage` 统一改写回 `EM/Content/`；
- 烘焙 PNG 兜底：某贴图缺 `.uasset`、只有 FModel 烘焙 PNG 时，`exportTexture` 改用
  `status.outputDir` 下同名 PNG（宽高从 IHDR 头读取），不再直接抛错中断。

## 图片（webp）

`bun tools/webp-import.ts` — 把 FModel 导出的纹理 PNG 转成 WebP 落到 `public/imgs/`（增量，`--force` 重转、`--dry-run` 只统计）。

引用来源为两者合并：`src/{data,components,utils,views}` 里的 `/imgs/**` 字面量扫描，以及 `evaluateDataUrls()` 的数据评估。
**数据里不含 `/imgs/` 前缀的字段（如线索板 / 剧情回顾的 `pic1` / `pic2`、百科条目的 `img` 与页签 `icon`、活动拍照 `photoView`）
必须在 `evaluateDataUrls()` 里枚举**，否则整批贴图不会被导入，只会静默缺失。

## 属性 i18n

`pnpm iattr`（`bun tools/import-attr-i18n.ts`）— 把上游 `out/AttrConfig.json` + `out/TextMap_I18n.json` 里的：

- 属性名（`Attr_*_Name`，如 `Attr_ATK_Fire_Name`）→ 补进根命名空间；
- 属性说明（`ATTR_DESC_*`，如 `ATTR_DESC_ATK_Fire`）→ 写入 `attrDesc` 命名空间。

规则与落地位置：

- 键均为属性在 zh-CN 下的展示名（攻击行按元素/伤害类型区分，如 `火属性攻击`、`切割攻击`）；
- **只补缺失键，不覆盖已有译文**；
- 读取入口 `apps/web/src/composables/useAttrI18n.ts`，展示在角色属性面板（`CharAttrShow.vue`）与武器面板
  （`WeaponTab.vue`）的属性来源 tooltip 标题与说明里；
- 上游目录默认取同级 `DuetNightAbyssData2`，缺失时回退 `D:/dev/DuetNightAbyssData2`，
  可用 `--upstream <dir>` 或 `DNA_UPSTREAM` 覆盖；`--check` 只比对不落盘。

## 游戏文本包

`pnpm importdata`（`bun tools/import-i18n-data.ts`）是数据层主导入脚本：把上游各模块文本表写进
`packages/data/d/<stem>.data.ts`，并额外产出 `packages/data/d/translations.data.ts` —— 把上游
`final/i18n/<locale>/translation.json`（本身就是「简体中文原文 → 译文」扁平表）压成 tc/en/jp/kr/fr
五份对照表，随数据包下发。

- **取数直读上游 Lua，不依赖上游 `out/`**：`out/*.json` 是上游 `bun out export-raw` 对
  `Script/Datas/*.lua` 的原样导出（属上游本地生成物，被其 `.gitignore` 忽略）。本脚本改为用
  `pathToFileURL` 动态 import 上游 `src/lua/LuaDataManager.ts` + `deepSort.ts`，直接执行 Lua 表并
  按 `deepSortJson` 排序，产物与旧 `out/<name>.json` 逐键一致；`final/i18n/**` 一侧仍照读（它是 i18n
  渲染产物，不是 raw 表）。
- **上游根目录从 `.env` 读，默认同级 `../DuetNightAbyssData2`**：项目根 `.env` 可设
  `DNA_UPSTREAM=<DuetNightAbyssData2 仓库根>`（Bun 自动加载 `.env`），也可用 `--upstream <dir>` 覆盖；
  优先级 `--upstream` > `.env` > 同级默认。`final/i18n` 一侧默认取 `<仓库根>/final/i18n`，可用
  `DNA_UPSTREAM_I18N=<目录>` 单独指向别处（如只拿到 final 产物的机器）。
- 前端由 `apps/web/src/utils/data-pack/translations-pack.ts` 在读包后注入 i18next（走 `data-pack.ts` 的激活钩子，
  **禁止反向 import 以免循环依赖**）；
- 检索层的反向索引（译文 → 原文）优先查这份表；
- `pnpm prune-i18n`（`bun tools/prune-migrated-i18n.ts`）据此把 `public/i18n` 里已迁移的中文键条目删掉，
  `--check` 只报告；
- **对照表全新生成、不读存量**：`translations.data.ts` = 当期模块位置配对（数组行按 id 配对，
  术语字典`奖励/术语解释/字段`按索引配对键与值）+ 别名表（`TRANSLATION_ALIASES`，前端展示名→官方中文正典，
  按正典查 TextMap 现场解析，强制覆盖）+ 前端自造展示名（`SUPPLEMENTAL_*`，强制覆盖），每次完整重写。
  上游各语言的 `translation.json`（本地生成物、不进版本库，生成脚本只读旧合并从不删除）
  不再参与合并，旧键自然消失；必须保留的新条目手工补进 `TRANSLATION_ALIASES` 或 `SUPPLEMENTAL_*`
  （显式、可 review）。`-f <模块>` 局部导入不碰 translations 表，改名后跑一次全量 `pnpm importdata` 生效。
- **特质文案不进 public/i18n**：角色特质名/描述（`CharTrait`）是结构化数据，对照表按 id 自动配对，
  界面 `$t(特质名/描述)` 经数据包注入表解析；不要再往 `public/i18n/*/translation.json` 顶层手补特质串
  （A类自创公式键如 DPS 系列只留 public，不进对照表）。
- **属性名能进对照表的不进 public/i18n**：`昂扬/暴击/背水`等 11 个属性名数据包表逐字复现
  （`tools/import-attr-i18n.ts` 的 `DATA_PACK_COVERED_ATTR_NAMES` 跳过写入，防复活），
  同名不同义的（如`副本/委托密函商店/远程武器`）仍留 public（`$t` 优先 public，语境为准）。
- **保留项**：英文点号键的界面文案、角色特质、属性名与 `attrDesc`（上游没有这些文案）；
  zh-CN 整体不动（fallbackLng，不进包）；
- 数据包未安装时界面显示中文原文，属预期降级。

## 数据包与图片包

- `pnpm dp`（`bun tools/data-pack.ts build|upload`）— 打包 `packages/data/d/**/*.data.ts` 为 msgpack
  数据包并（可选）上传 OSS/CDN，同时写 `apps/web/mock/data-pack/versions.json`；
  包内 `manifest.json` 与版本列表条目都带 `major`（`apps/web/src/utils/data-pack/data-pack-format.ts` 的
  `DATA_PACK_FORMAT_MAJOR`，改动包格式、老读包侧会崩时加一；抓取侧只收 `major <= 当前值` 的包）。
  `bun tools/data-pack.ts backfill` 给本地版本列表回填缺失的 major；缺 major 的老条目按
  `1.6.208.7` 分割线推断（之前为 1，自 MOD 数值挪进 `加成` 起为 2）；
- `pnpm ip`（`bun tools/imgs-pack.ts build`）— 图片包；
- `pnpm mp`（`bun tools/models-pack.ts`）— 3D 皮肤模型，参数 `[--force] [--only <id>] [--src <dir>] [--max-size <MiB>] [--texture cutout=0.45:lossless,…] [upload]`。
  源 GLB 放在 `models-src/`（git 忽略，`tools/skin-model/export-flora.ts` 的默认输出目录），
  压缩后写 `apps/web/mock/models/`，并按 `models/` 前缀上传对象存储。
  **按部件发布，不是按皮肤**：202 个可染色皮肤一共引用 669 个网格，去重后只有 177 个不同网格
  （另有 3 个皮肤各带效果生物网格，见下），逐皮肤各存一份会重复打包 492 次（实测 175.6 MiB → 2426.8 MiB）。
  工具把每个皮肤拆成部件（`apps/web/src/utils/skin-model-parts.ts`），同名的只存一份，
  清单 `manifest.json` 只记录「皮肤 → 部件名顺序」；运行期再按顺序合并回去。
  皮肤级染色元数据（部件名、丝袜白名单）从部件里摘出，只存在清单里；
  **色板表不进模型也不进清单**：它是全局数据，已随数据包下发（`packages/data/d/skin-colorize.data.ts`
  的 `linear` / `fresnel` 字段），渲染器加载时从数据包补。202 个皮肤各存一份色表会凭空多出半兆。
  展示动画单独成 `<id>.anim.glb`，通道按骨骼名记录，合并完成后再绑回节点索引。
  实测 6 个皮肤：逐皮肤 55.1 MiB → 部件化 12.9 MiB（单皮肤 3.2–6.0 MiB）。
  模型不进 `public/`、不随前端打包：前端打开染色页时才按皮肤清单下载缺的部件。
  下载进度由 `skin-model-runtime.ts` 的进度泵驱动：显示值取「真实字节」与「缓动曲线」的较小值，
  并保证至少展示 900ms（`MIN_PROGRESS_MS`）——本地 mock 与 Cache Storage 命中时数据瞬间到齐，
  不铺节奏的话进度条会在同一帧从 0 跳到 100%，用户只能看到画面突然出现。
  浮层必须锚在画布容器（`.relative` 只包画布）上，包含说明文字的外层不能当定位父级，
  否则 `bottom-0` 会盖住下方的提示文案。
  增量口径是部件内容哈希，没变的部件不会重压重传。`models-src` 只允许平铺的 `<id>.glb`，
  同一 id 出现在两个路径会直接报错。
  压缩由 `tools/skin-model/compress.ts` 完成：剔除武器、贴图按材质槽语义分四档
  （剪影/遮罩无损、法线/颜色有损降采样）、顶点属性收窄 + `EXT_meshopt_compression`。
  **剪影档（cutout）固定原分辨率、q95 有损**：剪影是腿上的荆棘/蛛网细线，降采样后 alphaTest 一裁就成断线锯齿
  （SP15 结丝夜行大腿最典型），无损 WebP 每张 2~4 MiB 又放不下，所以只压质量不压尺寸。
  默认按 `--max-size 5`（MiB）做体积上限：不同皮肤贴图张数差别大，固定档位压出来会飘，
  超限时先按 `BUDGET_LADDER` 只缩遮罩/法线/颜色，仍超限才按 `CUTOUT_LADDER` 动剪影分辨率。
  注意：染色着色器用的贴图（混合/丝绸混合/法线/自发光）**只登记在 `dnaColorize.textures` 里**，
  glTF 材质字段只引用底图；拆分与压缩都必须按元数据把这些贴图一起带上，否则丝袜会缺遮罩贴图。
  染色色号与亮度取贴图的**原始字节**（游戏按 sRGB 采样后又用 `1.055*c^(1/2.4)-0.055` 编码回去，
  两者相消），色带 `x = G * (5 + 量化)`，`染色1..6` 依次按 `clamp(x-0..4)` 混合。
  两类着色器取色号的位置不同：
  - `M_Player_Silk_ShopSkin`（BodyUP 贴身衣）走 `dnaPacked`：底图 UV0 的 G 是色号、R 是亮度，
    染色覆盖权重取法线 XY 重建的 Z（法线贴图 B 存的是几何 Z，不是遮罩）；`丝绸混合贴图` 是各向异性贴图
    （渲染器按 RG=方向、B=强度喂给 three 的 anisotropyMap，sheen 只留少量布面柔光），底图 B 才是丝绸层剪影（进 alphaTest）。
    **帽子网格例外**：帽子的底图 B 是花边/各向异性装饰遮罩而不是剪影，按剪影裁 alpha 会把帽檐挖出大片空洞。
  - `M_Player_SilkTran_ShopSkin`（贴身薄纱、纱裙）底图 B 同样是布料覆盖率，但这层只比皮肤高 0.2~0.6mm，
    游戏里是透明度混合的薄纱。渲染器按 alpha 混合处理（alpha = B×0.55，关 alphaTest、不写深度、加多边形偏移）：
    按剪影硬裁会让整片纱压住皮肤和白色衬衣（染色后远看只剩一片色块），掠射角还会和皮肤互相遮挡闪成噪点。
    薄纱的染色覆盖取**混合贴图 G**（花纹/花边遮罩），花纹外保留白色底布（亮度取底图 R）：
    底图 RGB 只是色号/亮度的编码载体，整片按染色铺满会让白纱远看变成一片色块（SP15 白/红染色最明显）。
    注意这条只限薄纱：贴身衣（Silk）如果也按花纹遮罩染色，会把 SP14 这类袖子上的彩色花纹洗成白色。
  - `M_Player_Energy_ShopSkin`（SP13 这类贴身纹身/能量层）没有丝绸贴图，但底图 B 同样是剪影：
    B=0 处透空露出皮肤。这层走 alpha 混合而不是 alphaTest——底图 B 与 `混合贴图` R 直接相乘作 alpha，
    细线条在 mip 平均后保留为半透明墨迹；按阈值二值化会把细线整段裁掉，远景还会闪。
  - `M_Player_Skin`（皮肤/丝袜）的暗部染色：覆盖范围取**混合贴图 B**（与其它材质 B=剪影同一约定），
    G 只是覆盖区内的编织/花纹权重。只看 G 会在 G 饱和的皮肤上把裸露皮肤整片压成暗部色
    （逐光追雪 B=0、G≈0.98，原先整只模型发黑）。R 是编织层 AO，同样只在覆盖区内相乘：
    裸皮区的 R 可能为 0（领口、拼接缝），无条件相乘会把脖子、胸口压成纯黑。
  - `M_Player_Wing_ShopSkin`（BodyDN、羽翼/垂饰）走 `dnaWing`：色号在 `时装BaseClor_2U` 遮罩的 G、
    覆盖权重在同贴图 R，按 **UV1** 采样，底图只提供亮度（R）和剪影（B）。底图 G 在这里恒为 0，
    拿它当色号会把整片羽毛压成 1 号色。材质没覆盖 2U 槽时游戏用父材质默认白图
    （R=1 全覆盖、G=1 → 6 号色），渲染器同样退回白图。
  导出必须保留 UV1（`optimizeGlb` 的 `dropExtraUvs: false`）：丢掉 UV1 就等于丢掉 Wing 的分区；
  旧缓存模型没有 UV1 时渲染器退回底图算法，避免整片压成 1 号色。
  - `M_Player_Billboard`（珍珠链、帽子上的花）是**卡片网格**：同一张卡的四角顶点位置完全重合，
    只有 UV 落在图集里的一小块 sprite 上，游戏在顶点着色器里按 UV 把卡片展开成朝向相机的四边形。
    不展开就是一堆重合点，整条链子直接消失。渲染器按位置聚类出卡片（不能按索引两两配对：
    SP07/SP14 的四边形不共享对角线），把 UV 相对 sprite 矩形中心的偏移写进 `dnaCardCorner` 顶点属性，
    顶点着色器里 `mvPosition.xy += dnaCardCorner * (顶点色 R × 尺寸)` 在视图空间展开；
    顶点色 R 是每张卡的半径，卡片尺寸按最近邻间距中位数反推（跨皮肤自适应，写死米数换皮肤就会错）。
    卡片朝向相机，法线贴图直接按视图空间采样；必须 `DoubleSide`（否则背面卡片被剔除）。
    剪影通道看版本：`kind: packed`（SP07/SP11/SP14）写在底图 **B**，`kind: base`（SP15）才在 alpha。
    取错通道会渲染成整块不透明方片或整条消失。
  远景抗闪烁：染色贴图统一开最大各向异性过滤；alphaTest 材质在 MSAA 画布上开 alphaToCoverage
  （覆盖率平滑），否则细花纹（纹身、蕾丝、发片）随镜头移动会闪成噪点。
- `bun tools/skin-model/export-flora.ts` — 从游戏资产导出皮肤 GLB。默认导出**全部可染色皮肤**
  （含系列皮肤：没有 `SkinTag`，靠模型表拼「公共体型 + 角色头发」）；`--skin <id>` 只导一个，
  `--skip-existing` 做增量。
  皮肤 → 网格 → 材质的映射全部来自游戏数据表（`tools/skin-model/catalog.ts` 解析
  `Skin.lua` → `Model.lua` → `CharPartModel.lua`，含 `T.RT_N` 复用常量），不硬编码角色。
  材质按名字逐个候选路径试（角色目录、**每个部件网格**的 Materials 目录、公共 Body/Face 目录），
  都失败再全局搜并优先落在角色目录的结果——身体材质躺在身体网格旁，不在头发网格旁。
  展示动画按角色目录实搜 `<Tag>_Armory_Idle`，搜到后**逐个候选试导出**：搜得到不代表解得了
  （Songlu / Zhangyu 等 17 个角色的动画是 ACL 压缩，CUE4Parse 报 `Unsupported compressed data type`），
  一个失败就换 `_Turn90_Idle` / `_Turn180_Idle` / `_Turn90_Start`，全失败才留空动画。
  角色动画里针对默认头饰的 `Sp_headparts*` 轨道与帽子自己的绑定姿态不是一套：帽子和身体在
  游戏里是两个独立组件，帽子只跟随头部骨。渲染器加载后会按帽子网格**实际蒙皮用到的骨骼**
  剔除这些轨道，否则 `_Armory_Idle` 会把帽檐甩到头顶上（SP15 结丝夜行是典型）。
  角色目录优先取模型表的 `MontageFolder`：系列皮肤的脸来自公共体型目录，靠脸网格推不出角色。
  默认染色值以**材质实例自身的参数**为准（那就是游戏里的默认外观），
  `DT_ShopskinTint` / `DT_HairTint` 只补材质没写的槽（`暗部颜色`、部分 `自发光颜色`）。
  表里的行名是网格名（`QNF_SP14_Body_SM`），材质名是另一套写法（`MI_QNF01_SP14_BodyUP`），
  匹配按「套装码 `SP14`/`TP03` + 体型前缀」对齐（`tools/skin-model/tint-row.ts`）——
  只比首段会让所有同体型套装共用 SP01 那一行，整只皮肤套用别人的蓝衣红羽配色。
  数据表里的部件路径也可能在当版本缺失（SP17 / Lilikou 的公共体型没打包，身体被拆成
  `QNF_SP17_Part01/02_SM` 放在角色目录下），按名字搜不到时退到同前缀的 `*Part*_SM` 全部导出。
  材质名与资产名的 `MI_` 前缀也可能对不上（网格写 `Lilikou_SP01_Hair`、资产是 `MI_Lilikou_SP01_Hair`），
  两种写法都要试。特效/水面类材质没有染色底图，退化成扁平色并保留元数据——
  **任何材质都不能缺 `dnaColorize`**，渲染器逐材质重建，缺一个整只模型不渲染。
  皮肤品阶效果生物（`Skin2LevelUpEffectCreature` → `EffectCreature.MeshResourceId` →
  `Model.SkeletonMeshPath`）是**独立骨架**的附加网格（芙洛拉「赦罪者」的翅膀等），不在 `PartModelsId` 里，
  却是展示界面上最显眼的部分。导出时把它的骨架根改名为 `<网格>_Root`（否则合并去重时会被当成角色
  `Root` 并到脚下），绑定后再整体挂到 `spine_03` 并抵消骨骼世界旋转；用角色共享 `Biped` 骨架的效果网格
  不挂接，按普通部件合并。效果网格里没有染色底图的贴片（水面/能量类，如 `m_wave_dh_058`）在预览里只会
  退化成不透明白色整片盖住翅膀，导出时直接剔除；贴片全被剔除的网格不发布（`meshNames` 跳过空网格）。
  `fmodel-cli` 输出是 UTF-8，必须按严格 UTF-8 解码、失败才回退 GBK；早先无条件按 GBK 解，
  中文槽名（`时装BaseClor`、`染色1`…）全变乱码，材质取不到底图、染色拿到错误默认色。
  **走常驻 `batch` 子命令**（`fmodel-cli batch`，一次建 pak 索引、stdin 逐行收命令）：
  单次启动要 ~13 秒重建 60 万文件索引，一个皮肤 30+ 次调用就会多花 7 分钟；
  批处理后一个皮肤从 7 分钟降到 1 分钟出头。`--no-batch` 可退回逐次调用排查问题。
  `/Engine/EngineResources/*` 是引擎内置纯色贴图，不在内容 pak 里，脚本按名字合成 2×2 PNG 顶替。
- dev 环境数据包基址是 `/mock/data-pack`，模型基址是 `/mock/models`，无需联网即可安装；
  vite 用一条通用中间件服务整个 `mock/<子目录>/`（白名单见 `MOCK_DEFAULT_FILES`）。
