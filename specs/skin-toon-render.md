# 皮肤模型二次元渲染（Skin Toon Rendering）

> 类型：目标规格（to-be）。当前实现是 PBR 近似预览，本规格定义「对标游戏截图」的判定口径与实现契约。
> 范围：`apps/web/src/utils/skin-model-renderer.ts` 及其材质/着色器链路，以及 `tools/skin-model/` 中产出渲染所需数据的导出步骤。
> 不在范围：染色色板解析（已实现）、剪影/公告板几何还原（已实现）、模型下载与压缩管线（已实现）。
>
> 参考图（本地 `.docs/` 工作目录，`.docs/` 已被 gitignore，不入库）：
> - 目标：`.docs/skin-toon-render/ref-game-feina01.png`（子不语·菲娜，游戏内展示）
> - 现状：`.docs/skin-toon-render/baseline/`（4 类皮肤 × 4 机位的当前实现基准图）
> - 卡通 ramp LUT：`.docs/skin-toon-render/T_CharacterRampCurve.png`（256×256 行式图集，见 §3 第 5 条）
> - 旁证：`.tmp/ref-char.png`（芙罗拉，含 UI，用于核对高光/描边口径；`.tmp/` 不入库）
>
> 调研证据（本地 `.docs/` 工作目录，不入库；本规格的事实来源）：
> - `.docs/skin-toon-render/shader-facts.md` — shader 侧：GBuffer 语义、延迟光照 PS、ramp atlas、描边
> - `.docs/skin-toon-render/renderer-gap.md` — 差距侧：逐项差异、代码盘点、路线评估、量化基线

## 1. 问题陈述

染色页的 3D 预览要回答「这套配色穿在角色身上是什么样」，因此**颜色可信**与**观感可信**同等重要。
染色数值已按反编译还原（色带 `x = G * (5 + 量化)`、`染色1..6` 依次混合），颜色本身基本正确；
但渲染器走 Three.js 的 PBR 正向渲染，而游戏走 **GBuffer + 延迟卡通光照**。两者在观感上差在：

| 维度 | 游戏 | 当前实现 |
|---|---|---|
| 明暗过渡 | 硬边阶跃（ramp LUT 量化） | 物理 N·L 软过渡 |
| 暗部色 | `Dark Tint` 着色（默认 `#918F93`） | 环境光/半球光的灰蓝 |
| 高光 | 硬边高光斑（ramp 行控制） | 各向异性/GGX 连续高光 |
| 轮廓 | 屏幕空间描边 | 无 |
| 皮肤 | 亮/暗两色 + 菲涅尔透光 | 单一 albedo × 光照 |

结果是「塑料感 / 灰暗 / 没有二次元味道」，与截图差距肉眼可见。

## 2. 领域术语

| 术语 | 本文口径 |
|---|---|
| GBuffer pass | 材质自身的像素着色器，只写 GBuffer（法线/基础色/粗糙度/shading model id 等），不做光照 |
| 卡通光照 pass | 延迟光照阶段，按 GBuffer 的 shading model id 选择卡通分支，输出亮/暗两色 tint |
| ramp LUT | `T_CharacterRampCurve`（256×256 图集），每行一条亮度曲线，横轴 = 光照量，纵轴 = 亮度缩放 |
| shading model id | GBuffer 中标识光照模型的整数（`T1.w * 255 & 15`）；角色皮肤/布料用其中的卡通档 |
| 阶跃数 | 明暗过渡被量化成几段。游戏皮肤为 2–3 段 |
| 亮/暗 tint | 卡通光照的两个乘子：`Light Tint`（默认白）、`Dark Tint`（默认 `#918F93`） |
| kind | 渲染器内部的材质分类：`packed` / `stocking` / `hair` / `hairPart` / `weapon` / `base` / `shadow` / `eye` |

## 3. 已确认的既有事实

这些是反编译与实测结论，实现时不得推翻；若新证据与此冲突，先改本节再改代码。

1. `M_Player_Skin`（`EM/Content/Asset/TA/Char/Materials/Player/Body/M_Player_Skin`，resourceHash `5DD34D398C5481962CF31DFB61B128CDAC736A0F`）的主 PS 是 GBuffer 写出，输出 6 个 `SV_Target`。实测语义（证据：`M_Player_Skin` 主 PS `2383_f3`，重建命令见 §9；另见 `.docs/skin-toon-render/shader-facts.md` §2）：

   | RT | 内容 | 证据 |
   |---|---|---|
   | `SV_Target`（RT0） | 基色 × 间接光（SH/体积光照图）+ 自发光，末尾乘 `CB0[143].y`（曝光） | L451–453 |
   | `SV_Target_1`（RT1） | `.xy` 法线 `mad(n, 0.5, 0.5)`；`.z` 抖动 + `log2` 亮度打包；`.w = CB1[20].y`（材质级开关，**延迟 PS 不读**） | L448–450, L455 |
   | `SV_Target_2`（RT2） | `.x` = **ramp 行号源**（默认 `6.5/256`）；`.y` 次表面/金属；`.z` 粗糙度；`.w` = **shading model id**（`0.996078` = 254/255 → **14**） | L456–459, L188 |
   | `SV_Target_3`（RT3） | **未光照打包基色** + `.w` 亮度曲线 `_913`。**不是**卡通光照的 albedo 输入（见下） | L460–463 |
   | `SV_Target_4`（RT4） | `.x/.z` 不透明度；`.y = clamp(COLOR.w * 0.4)`；`.w = clamp(CB3[8].z)` 描边浓度（材质默认 0.7） | L192–193, L213–214 |
   | `SV_Target_5`（RT5） | `.x` 受 `CB1[20].z` 开关的 `T24` 采样，`.yzw = 1` | L464–467 |

   结论：**基色 pass 里没有直接光照的 N·L**，直接光与卡通阶跃发生在延迟阶段。因此卡通光照必须由我们在渲染器里补，不能指望材质 pass 给出。
2. **角色卡通光照 PS 已找到**：`EM/Content/ShaderArchive-Global-PCD3D_SM5.ushaderbytecode` 索引 **1701**（81KB，反编译 2010 行），是覆盖 shading model 1–14 的通用 `DeferredLightPixelShader`，`switch` 有 15 个 case。产物在 `.tmp/shader-probe/lighting/01701_f3.hlsl`。
3. **shading model id 来自 `RT2.w`，不是 RT1.w**（这一条修正了早期推测）：延迟 PS 用 `round(GBufferB.w * 255) & 15` 取 id，`RT1.w` 从未被读取。高 4 位是材质 flags（`&16`/`&32`/`&64` 各有分支）。跨材质实测：

   | id | 含义 | 材质 |
   |---|---|---|
   | **14** | 角色通用 toon（走 ramp atlas） | 皮肤、身体、丝绸、怪物、武器、兜帽、`M_Toon` |
   | 5 | 皮肤专用（次表面 + 皮肤专用 LUT `T11`） | **无角色材质引用**（见 Q22） |
   | 9 | 各向异性 | **无角色材质引用**（见 Q22） |
   | 12 | **完全无光照**（只保留法线） | 眼睛、表情 |
   | 13 | 头发（直通：`ramp(0.5,row) × GBuffer2.y`，形状全在 GBuffer pass 里） | 头发 |

   注意：这是**本作改写的枚举**，不能套 UE 原生 `MSM_*`。
   **易混淆点**：`MM_PP_ToonShading`（简化后处理）里写的是 `round(T1.w*255)&15`，那是**该 PS 自己的纹理槽位**（`T1` 在那张 shader 里绑的是 GBufferB），与角色材质 RT 编号无关。真正的权威定义在 `01701_f3`（`T4` = GBufferB）。
4. **ramp 行号 = `round(GBufferB.x * 256)`**，即材质写入的 `SV_Target_2.x`；皮肤默认 `6.5/256` → 行 6。不是顶点色、不是材质标量、不是 shading model 单独决定。`case 14` 再用行区间（11–15 / 16–20 / 41–45 / 46–50 / 51–55）叠加权重。
5. `T_CharacterRampCurve` 是 **`UCurveLinearColorAtlas`**（`DefaultEngine.ini` 的 `ToonRenderingSettings.RuntimeColorAtlas` 指向它），内含 **16 条曲线**（`CV_Skin01` / `CV_Hair_Blue` / `CV_Face01` / `CV_Stock01` …），每行一条。
   **引擎自带的同名贴图（`Engine/Content/EngineMaterials/T_CharacterRampCurve`）是全白**，游戏在 `EM/Content/Asset/Char/Player/Common/Texture/` 下覆盖了一份真正在用的 LUT。实测：

   | 行 | x=0 | x=128 | x=255 | 形状 |
   |---|---|---|---|---|
   | 0 | 191 | 223 | 255 | 柔和线性 |
   | 1 / 6 | 164–204 | 197–225 | 255 | 暖肤色、略陡 |
   | 2/3/5/7/8/9/10/14/15/17–20/23–25/33–40/51–55 | 0 | 0 | 253 | **硬阶跃**（x≈160 才起步） |
   | 4 | 255 | 255 | 255 | 全亮 |
   | 11/12/13/41–50 | 121 | 121 | 255 | 阶跃但暗部抬高 |
   | 16 | 127 | 191 | 255 | 线性 |
   | 21/22/26–32 | 彩色 | 127 | 0 | 装饰行 |
   | 56–255 | 255 | 255 | 255 | 未用填充 |

   采样方式：`T0.Load(uint2(0, row)).w` 取该行起点 `x0`，再 `T0.SampleLevel(float2(x, row/255))` 取色。**横轴是 Lambert 派生值**（精确式被编译器内联，见 Q7）。
6. 眼睛是 unlit（id 12，`case 12` 把 diffuse/specular 全部置 0，只留法线），已按 `M_Player_Eye_V14` 反编译单独拟合（见 `.tmp/eye-shader-spec.md`，七区残差 RMS ≈ 9.6 级 sRGB）。**眼睛不走卡通光照分支**，改动时不得回归。
7. 当前渲染器的光照配置（`skin-model-renderer.ts`，行号随格式化漂移，按符号搜索）：
   - `renderer.outputColorSpace = SRGBColorSpace`，**未设置 `toneMapping`**（Three.js 默认 `NoToneMapping`）。
   - `HemisphereLight(0xe8edff, 0x555044, 2)`、key `DirectionalLight(0xfff5e8, 2.8)` @ (-3,5,4)、rim `DirectionalLight(0xc7e2ff, 1.2)` @ (3,3,-4)。
   - 程序化 128×64 等距柱状环境球经 PMREM，`scene.environmentIntensity = 0.55`。
   - 丝绸走 `MeshPhysicalMaterial`（`roughness 0.5` / `sheen 0.2` / `anisotropyMap`），其余 `MeshStandardMaterial`（皮肤 `roughness 0.8`、丝袜 `0.55`）。
   - Three 版本 0.182.0（`apps/web/node_modules/three`）。

## 4. 目标（可判定）

每条都必须能用脚本量出来，不允许「看起来对了」。

| ID | 目标 | 判定方法 | 阈值 |
|---|---|---|---|
| T1 | 明暗阶跃 | 取脸部/大腿/白裙三块纯色区域，沿光照方向采样亮度，统计过渡带占 N·L 全域的比例 | 过渡带 ≤ 8%，阶跃段数 2–3 |
| T2 | 暗部着色 | 同一材质在暗部区域的平均色相相对亮部偏移 | 命中游戏实测方向：暗部比亮部**更暖更饱和**（皮肤暗/亮逐通道比 ≈ `(0.97, 0.42, 0.36)`），且暗部亮度比 ≥ 0.35 |
| T3 | 轮廓描边 | 固定机位渲染，统计角色轮廓内侧 1–3px 环带的平均亮度 | 比背景亮、比本体暗，宽度 1.5–2.5px（1080p 等效） |
| T4 | ramp LUT | 反编译证据链完整：哪个 shader、哪一行、行号如何选择 | 报告中给出可复现命令与行号 |
| T5 | 区域色准 | 脸/大腿皮肤/白裙/头发/蓝飘带五区平均 sRGB 与参考图比较 | ΔE2000 ≤ 5（区域平均，排除背景） |
| T6 | 亮度分布 | 角色像素的亮度直方图峰数 | 与参考图峰数差 ≤ 1 |
| T7 | 无回归 | 染色、剪影、公告板、丝袜、薄纱、羽翼、眼睛七项既有验收 | 全部通过（`.tmp/skin-accept/ACCEPTANCE.md` 的 T/M/S/V 与眼睛视觉比对） |

## 5. 实现契约

### 5.1 着色阶段划分

渲染器必须明确分成两层，不能把卡通逻辑散落进每种 `kind` 的分支里：

1. **表面层**（每材质）：沿用现有 `onBeforeCompile` 替换，负责 albedo（染色）、alpha/剪影、法线、自发光、公告板展开。**这部分不动。**
2. **光照层**（新增，统一）：把 Three.js 的 PBR 光照结果替换为卡通结果。必须对除 `eye` / `shadow` 外的所有 `kind` 生效，且不依赖具体 kind。

**架构约束：我们是前向单 pass，游戏是 6 张 RT 的延迟管线。** 由此产生三处必须近似的差异，实现时不要试图逐像素复刻：

| 游戏能力 | 我们的近似 |
|---|---|
| RT2.w 的 shading model id 决定分支（14/5/9/12） | 按 `kind` 映射：`stocking`/`base` → 皮肤档，`hair`/`hairPart` → 头发档，`eye` → 无光照，其余 → 通用 toon |
| RT2.x 逐材质 ramp 行号（默认 6） | 材质元数据给 `rampRow`，缺省 6；不新增 GBuffer 通道 |
| RT2.z 逐像素粗糙度 | 保留 `roughness` 标量，不做逐像素 |
| RT4.w 逐材质描边浓度（默认 0.7） | **当前 build 无消费者（Q9）**，暂不实现 |
| RT3 未光照基色 与 RT0 已乘间接光 分离 | 我们只有 `diffuseColor`，必须**显式决定**间接光是否参与：卡通层下按 §5.3 衰减到接近 0 |

**这意味着「与截图逐像素一致」不可达，规格 §4 的 ΔE ≤ 5 是区域平均口径，不是逐像素。**

### 5.2 卡通光照公式（契约形式）

注入点（Three 0.182.0 实测）：替换 `meshphysical.glsl.js` 第 198 行的
`vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;`。
眼睛分支已经在用同一手法（`skin-model-renderer.ts` 第 881 行，随格式化会漂移，按字符串搜索定位），属于已验证路径，不需要新 pass、不需要改 ShaderLib。

主光方向通过自建 uniform 传入（视图空间），不依赖 `directionalLights[0]` 的结构——
后者会随 Three 版本变动，且我们要显式控制「哪盏灯是卡通主光」。

**游戏 `case 14` 的真实公式**（`.tmp/shader-probe/lighting/01701_f3.hlsl` L1519–1531, L1732–1745）：

```
id      = round(GBufferB.w * 255) & 15        // 14 = 角色通用 toon
row256  = round(GBufferB.x * 256)             // 材质写入的行号，皮肤默认 6
lambert = saturate(dot(N, L))
x0      = min(T0.Load(uint2(0, row256)).w, bandWidth)   // 第 0 列 alpha = 行起点
x       = mad(rampX, bandWidth - x0, x0)
ramp    = T0.SampleLevel(float2(x, row256 / 255))       // RGB 缩放
lit     = min(albedo * ramp.rgb, 0.86)                  // 硬 clamp 0.86
out     = (lit + rim) * exposure
```

注意两点与直觉不同的地方：

1. **不是 `mix(darkTint, lightTint, tone)` 的二色插值**，而是 **`albedo × ramp` 的乘性缩放**，再硬 clamp 到 0.86。`MM_PP_ToonShading` 那套 Light/Dark Tint 是并存的另一套简化后处理，不产生硬阶跃。
2. **albedo 来自 GBufferC（即材质 RT0 的基色），不是 RT3**。RT3 是给描边 prepass 用的未光照基色，延迟 PS 完全不读它。

我们的等价实现（前向单 pass，无 GBuffer）：

```
nDotL   = saturate(dot(N, L))
row     = dnaRampRow                       // 材质元数据给出，默认 6
tone    = rampSample(row, nDotL)           // 从入库的 atlas 采样，0..1
color   = min(albedo * tone, 0.86)         // 乘性缩放 + 硬 clamp
color  += rim * rimColor * rimStrength     // 轮廓光，皮肤/可选
```

**`rampSample` 的形状已由 LUT 实测确定**（不是 `smoothstep`）：

| LUT 行类型 | x=0 | x=128 | x=160 | x=192 | x=224 | x=255 | 用在哪 |
|---|---|---|---|---|---|---|---|
| 硬阶跃（29 行） | 0 | 0 | 63 | 127 | 191 | 253 | 主体材质 |
| 阶跃 + 暗部抬高（13 行） | 121 | 121 | 177 | 233 | 255 | 255 | 暗部不压死的材质 |
| 柔和（行 0/1/6/16） | 164–191 | 191–223 | 212–231 | 223–239 | 239–247 | 255 | 皮肤/脸等需要软过渡的 |
| 全亮（行 4 起） | 255 | 255 | 255 | 255 | 255 | 255 | 装饰行 |

即：**前 50% 恒为 0，后 50% 线性上升到 253**，转折点 `x≈128`。

**横轴口径（Q7）——已从反编译直接解出，不用实测反推**

`01701_f3.hlsl` L1688（`case 14`，同一表达式在 L1703 `case 13` 复用）：

```
// _241.._243 = 解包后的世界空间法线 N
// CB2[5].xyz = 主方向光方向 L
// _416.._418 = 归一化的视线方向 V（由 TEXCOORD_1 即视图射线方向给出，V 指向相机）
_4544 = _4543 * min( clamp(dot(N, L) * 0.5 + 0.5, 0, 1),
                     clamp(dot(N, V) * 0.5 + 0.5, 0, 1) )
```

即横轴是 **`min(halfLambert(N·L), halfLambert(N·V))`**——不是 `N·L`，也不是单纯重映射，而是**半兰伯特与「朝向相机程度」取较小值**。

这解释了为什么游戏的背光面不会全黑：即使 `N·L < 0`，`N·V` 项仍能把它抬起来。这是二次元渲染里典型的「视向兜底」做法。

随后 `_3207 = CB2[8].x * (1 - T10.x²) + T10.x²`（`T10` 是各向异性/遮罩图）作为斜率缩放，最终：

```
x0    = min(T0.Load(uint2(0, row)).w, rampInput)   // 行起点
x     = x0 + _3207 * (rampInput - x0)              // 映射到该行有效区间
ramp  = T0.SampleLevel(float2(x, row/255))
lit   = min(albedo * ramp.rgb, 0.86)
```

我们前向 pass 的等价实现（不需要 GBuffer）：

```glsl
float halfL = dot(N, L) * 0.5 + 0.5;
float halfV = dot(N, V) * 0.5 + 0.5;      // V = normalize(cameraPos - worldPos)
// 布料走 saturate(N·L)（L1523-1531 的 lambert 口径，2026-11-15 用白羽直方图标定确认）；
// 皮肤/头发沿用 min(halfL, halfV)——同一 PS 里两种口径并存，皮肤那条来自 case 5 分支。
float band  = kind == "packed" || kind == "weapon"
    ? saturate(dot(N, L))
    : min(saturate(halfL), saturate(halfV));
```

**收尾曲线（此前漏实现，是白羽过曝的根因）**：`lit` 不是直接输出，`L1738-1755` 还有一步：

```
a     = min(albedo * ramp, 0.86)                          // 逐通道
shape = 0.35 + 0.6a + 1.5a³ - 0.35a²
spec  = (59a + sqrt(9 - 10127a² + 13702a) - 3) / (502 - 486a)
out   = (0.5 * shape * sqrt(a) + 0.5 * spec) / π * 光色 * 主光强度 * 受光增益
```

注意 `mad(a*0.6, 1.5a²-0.35a, ...)` 展开后是 **`1.5a³ − 0.35a²`**（不是 `1.15a`），
shape 与 spec 各取一半、再乘公式自带的 `0.3184713`（1/π）。
**受光增益 `_5403 = 1 + 1.2 · _3207 · smoothstep(受光量)`**（L1670-1672、L1745）：暗部 ×1、亮部 ×2.2。
它是参考图 171→248 那 77 级的来源；把它换成常数会把整片布料压成一条窄带。
`_3207 = lerp(_745², 1, CB2[8].x)`、`_3209 = lerp(1, _747², _302)`，`_745/_747` 是 GBufferD 的逐像素遮蔽项，
展示场景无投射阴影时取 1，于是只剩 `smoothstep(受光量)`。
`dnaToneScale` 是「1/π × 主光强度」的合并值（受光增益已单独乘），按参考图子不语外套标定 **1.7**。

**行内映射按整行采样**：`x = x0 + _3207·(_5249 − min(x0,_5249))`，展示场景 `_3207=1`、`_5249`=受光量，
式子塌成 **`x = band`**（不再从 `x0=0.70` 起映射）。之前的地板等于把布料暗端夹在 0.73，
整片布被压成窄带；改成整行采样后才能吃到 0.475，暗面压得下去——这是参考图 171→248 那种对比的来源。

**天空项**：`_1442` 里还有 `_5913 = 天空色 × 强度 × 可见度` 直接加在漫反射上（不乘 albedo，
所以暗布料也会被提亮），可见度取光轴 → `dnaToonSky(0.08,0.08,0.09) * saturate(N·L)`。
取值必须小：它把每个通道一起抬，给大了会把深蓝滚边冲成灰白。

漏掉收尾时白色布料在 `albedo*ramp=0.86` 之后一路顶到 255：实测白羽区域 13.1% 像素贴顶、
mean 222。现在参考图那套染色的外套实测 p25/p50/p75/p90 = **169/201/236/247**（参考图 171/209/239/248），贴顶 0%。

约束：

- `rampRow` 的选择依据必须来自反编译证据；**未确认前**允许用常量行 + 参数化，但必须在代码里标注 `TODO(ramp-row)` 并写进未解问题。
- **收尾曲线只属于丝绸类布料**（`M_Player_Silk/SilkTran/Energy_ShopSkin`）；羽片 `M_Player_Wing`、
  公告板 `M_Player_Billboard` 是独立着色器，套上去会把白羽压成一片平白（实测 p50 顶到 249）。
- **曲线只在亮度域套、再按比例回乘色度**：`+0.35` 常数项逐通道套等于给每个通道加一层灰，
  白布发灰、深蓝滚边被冲淡；参考图里滚边仍是很饱和的宝蓝。
- `lightTint` / `darkTint` 默认取 `#FFFFFF` / `#918F93`，可按 `kind` 覆写（例如头发暗部可偏冷）。
- 眼睛、`shadow` 材质**不进**该公式。
- 公式必须能在 `MeshStandardMaterial` 的 `onBeforeCompile` 内完成，不引入额外渲染 pass（除非 §5.4 的描边需要）。
- **`albedo` 必须是「未光照的基色」**：对应游戏 RT3（`_686/_688/_690`），不是 Three.js 里被环境光乘过的 `diffuseColor`。现有渲染器在 `map_fragment` 里算出的 `diffuseColor` 正好就是这个量，可直接复用；但**不能**让它再乘 `scene.environment` 或半球光，否则等于把间接光算两遍。
- 直接光强度必须显式给出（游戏里由延迟光照 pass 的 `CB0[143].y` 曝光与光颜色决定），不允许继续沿用当前 `DirectionalLight` 的 2.8 / 1.2 这些为 PBR 调的数值而不重新标定。

### 5.3 环境光与高光

- 卡通层启用后，`scene.environmentIntensity` 与 HemisphereLight 的贡献必须可关或大幅衰减，否则暗部会被 IBL 抬成灰色。
  **实测基线**：当前环境光占受光面 36.5% / 39.4% / 45.3%（R/G/B），环境色 B/R = 1.19。P1 目标是把这组比例压到 15% 以下，并把残余环境色改成暖色（暗部乘子约线性 `(1.00, 0.45, 0.40)`，等价 sRGB `#ffb9a9`）。
- **高光必须保留**（2026-11-14 修正）。反编译 `01701_f3.hlsl` case 14 的收尾是
  `min(albedo*ramp, 0.86) + spec(光色 × BRDF) + spec(天空)`——`lit` 只是漫反射部分，高光是加在它上面的。
  早先把 `directSpecular` 归零、`indirectSpecular` 压到 0.15，结果丝绸/银饰/金属扣只剩漫反射，布面变成平塑料。
  现在的取法：`directSpecular *= dnaToonSpec`、`indirectSpecular *= dnaToonSpec`，其中
  `dnaToonSpec` 皮肤 0.35、其余 1.0。衣料的「银色反光」靠这条通路 + 材质自带的 `Anisotropy` 各向异性贴图。
- 高光的形状仍由 PBR（GGX / 各向异性）给定，ramp 不参与量化；这与游戏一致（游戏的 spec 也在 ramp 之外单独计算）。
- **头发专项（2026-11-15 重新按 shader 对齐，推翻上一版做法）**。发色与高光都在 GBuffer pass 里算完，
  延迟侧（`01701_f3` `case 13`）只做 `diffuse = ramp(0.5,row) × GBuffer2.y`：
  - **基色是两段式，交界是硬的**：`19813_f3` L147-160
    `_483 = CB2[2].x·_450 + (_462·CB2[4].x)·CB2[10].z`，其中
    `_462 = saturate(1 − N·L − CB2[10].y)` 是 wrap 背光项，`_450` 由贴图阈值 `_402` 与
    `_422 = lerp(CB2[9].y, CB2[9].x, CB2[8].w) + CB2[9].z` 比较得到 **0/1 硬掩码**。
    对应实现：`smoothstep(0.42, 0.58, band)` 做 0.42→1.35 的两段缩放，明暗交界保持硬边。
  - **发色还过一次幂曲线**：`_538 = exp2(log2(色)×CB2[11].x)`、`_612 = _538·CB2[7].x`。
  - **"高光"是环境/天空反射，不是平行光的 GGX 斑点**：L403-433 用 `T1.Load(0..24)` 的结构化缓冲
    （逐发簇 SH，CPU 每帧算，**不在 pak 里**）乘以 `CB0[215]/[222]`，再在 L481 里以
    `_1089·_1627·(2.7552r³−4.7951r²+2.0404r−0.3324+1.332)` 加到基色上，`_1089` 是被 `CB0[144]` 调色过的发色。
  - **已试过并否决的两种做法**（都会变成塑料感，与参考图不符）：
    ① 用 `EmissiveColor` 做菲涅尔亮边——`EmissiveColor` 是给上面那条反射项用的 HDR 色（菲娜 `(0.469,4.773,15)`），
    止流主体头发根本没声明它，回退到 `Fresnel_TintColor=(1,1,1)` 就成了整头白边；
    ② 压低粗糙度 + 抬 `envMapIntensity` 让 IBL 出反射、或按切线补 Kajiya-Kay 亮带——
    两者都在发片上铺一层均匀/带状光泽，实测观感是塑料，参考图上并没有这层光泽。
  - 因此我们的头发 = `albedo × ramp(0.5,row) × 两段硬掩码`，**不加任何额外的镜面项**；
    参考图 p25/p50/p75/p90 = 180/191/221/247，我们 190/212/220/224，差距全在 p90（逐发簇 SH 的运行时数据，无法从资产还原）。
- `toneMapping` 的选择必须显式写出（不再依赖默认值），并记录理由。**现状已确认是 `NoToneMapping`**（Three r182 默认），线性值 > 1 直接硬裁，是整体偏暗 1.55× 的直接原因之一。

### 5.4 描边

**已确认游戏有描边，且是后处理**（`M_PP_Outline` 主 PS `97765_f3`，`MM_PP_ToonOutilnes` 是同族变体）：

- 深度 + 法线 **4 邻域边缘检测**：`_512 = length(Σ(normalCenter - normalNeighbor))`，`_741 = Σ 4 邻域深度差`，`_755 = 1 - max(pow(_512, exp), pow(_741, exp))`，最后 `lerp(base, base * _755, depthEdge)` 压暗。
- 材质参数：`outLineWidth=2`、`depthExp=2`、`normalexp=2`、`深度阈值=5000`、`Outline Color=000000`。
- **不是 inverted hull**：`skin/vs_main.hlsl` 的 `gl_Position` 只有 MVP，无 `position + normal*width` 外扩；材质标量 `Width=0.05` 只参与 discard。
- 视觉实测：2–3px、`#565468`（去饱和深蓝紫）、比主体暗 5.7×。

**对我们的启示**：后处理方案与游戏架构一致，且屏幕空间不需要外壳网格，不会与公告板/剪影冲突。但它需要 `EffectComposer` + depth/normal 读取，与「透明背景 + alphaToCoverage」冲突（见 §8.2）。**单独作为一个改动做，不要和卡通光照混在一起。**

注：材质里的 `SV_Target_4.w`（描边浓度 0.7）在当前 build 的后处理描边里**未被消费**（Q9），实现时不必为它加数据通道。

**当前实现的取舍（与上文的差异，均已在任务书 `.docs/skin-toon-render/tasks.md` 的 P3/P3.2 记录）**：

| 游戏做法 | 我们的实现 | 原因 |
|---|---|---|
| 深度 + 法线联合边缘 | **只用深度，4 邻域线性深度差之和**（`_741` 同构） | 法线要第二遍 render 或 MRT；MSAA 的深度在 renderbuffer 里读不到，两者互斥。**二阶差分不行**：它把圆柱/球面的正常曲率也当折角，整条腿被描出一圈宽带（实测平均带宽 4.8px） |
| `_755 = 1 - max(saturate(pow(normalDiff, normalexp)), saturate(pow(depthSum, depthExp)))` | `edge = clamp(pow(diff / (深度 × 5%), 2), 0, 1)` | 指数 2 让响应接近二值。分母取**当前深度的一个比例**而不是固定厘米数：固定阈值下斜看的脸/腿在一个采样间隔内就有几厘米落差，整片被判成边缘，表现成「侧面糊上一层阴影」 |
| 采样偏移 = `outLineWidth=2` 个渲染像素（固定 UV） | 世界宽度投影，再按 **1.5 CSS px（= pixelRatio 个 device px）封顶** | 固定 UV 就是「远近一样粗」。只做世界投影的话怼脸时会涨到十几像素；封顶后画面上约 2–3px（实测可见带宽 ≈ 上限 + 边缘 AA 的 1px，不是 2× 偏移） |
| `lerp(base, base * _755, depthEdge)` + `Outline Color=000000` + 浓度 0.7 | 同构：`color = mix(color, 0, edge * 0.7)` | 与游戏一致是**乘性压暗**；固定灰线在深色时装上会比衣服更亮 |
| 延迟 PS 末尾乘 exposure | 合成阶段先乘 exposure，再过**带高光肩部**的线性曲线 | 硬 saturate 让白羽时装 38% 前景像素贴顶（参考图 5.2%）；肩部拐点 0.72，实测贴顶降到 0% |
| MSAA | **2× 超采样后降采样** | 同上：要读深度就不能用 MSAA 的 RT |

实测（`bun .tmp/outline-metric.ts 180101`，640×960，阈值 25 级）：

| 机位距离 | 描边带宽 | 边缘覆盖 | 内部阴影像素 | 观感 |
|---|---|---|---|---|
| `distance * 0.62`（参考图同尺度） | **1.25px** | 96% | 4.2% | 贴合参考图的 1–2px 细线 |
| `distance * 1.2` | 0.76px | 61% | 1.9% | 开始消退 |
| `distance * 2.0` | 0.17px | 13% | 0.1% | 目视完全看不见 |

世界宽度 = `radius * 0.003`（带宽 ≈ 角色高度的 0.15%，从参考图实测）；采样偏移按 1.5 CSS px 封顶
（`uMaxWidthPx = 1.5 * pixelRatio`）。「内部阴影像素」= 离轮廓 >5px 仍被压暗的面积占比，
用来盯「描边变成阴影」的回归。怼脸（相机 0.45m）时带宽约 1.7 device px ≈ 0.9 CSS px，不会涨成灰块。

**踩过的坑**：`uNear/uFar` 必须在每次绘制时从相机同步。`frameModel` 会按模型尺度把近远裁剪面改成 `radius/1000` / `radius*40`，
而 uniform 只在构造时取过一次默认值（0.01/10000）——深度反解会把 3.7m 算成 37m，距离淡出直接把描边关死（表现为「描边完全消失」）。

已知缺口：没有法线 → 同一物体内的折角（裙褶、发丝内部）不会被描边，只有轮廓与前后遮挡边。

### 5.4.1 表情层（`M_Player_FaceExpres`）

脸部有一层叠在脸壳上的卡片：眉毛 / 上睫毛 / 眼窝杯 / 下眼睑 / 鼻 / 嘴袋，共 27 个连通块
（`Feina_Face_SM_3`，1514 三角形）。**整层原样渲染，不做任何连通块裁剪**：游戏就是这个网格。

- **取 UV：UV0 原样采，不乘 `UVScale`**。脸贴图 `T_*Face_D` 的 v>0.85 那条带（脸壳 UV 只用到 v≤0.744）
  是**纯色色板**，卡片 UV0 正落在上面：眉 →(82,111,134) 蓝灰、上睫毛 →(10,9,8) 近黑、
  唇袋 →(68,45,41) 深棕、眼窝杯 →(244,228,222) 近白。乘 `UVScale(2,1.3)` 会把坐标推出
  [0,1] 后 wrap 到皮肤区，整层变成肉色——这正是先前“眉毛肉色 / 眼白肉色”的根因。
- **UV1 不能用来取色**：27 个岛的 UV1 全部退化成长条/细线（唇袋是 0.004 宽的竖条、
  下唇卡是 0.003 高的横条），按 UV1 采样得到的就是被拉伸的几根线，视觉上是
  “嘴角白星 / 嘴上一道白条”。UV1 是每岛一个查找坐标，不是色板布局。
- **材质数据**：`颜色贴图` = `T_*Face_D`（与脸壳同一张），`FaceLightMap` = 公共 SDF
  `T_QNF02_LM`，`本地空间法线贴图` = `T_*Face_N`；`BlendMode=Masked`、clip 0.3333、
  `UVScale=(2,1.3)`。该材质只绑定这 5 个贴图参数（t0 `None`/t1 法线/t2 颜色/t3 SDF/t4 噪声），
  没有任何独立表情图集：全库 `**/T_*Expres*` 只有 NPC/宠物的漫画表情（`T_BaiTXEx_Eye/Mouth`，
  由 `M_Expression` 使用），所有 `MI_*_FaceExpres` 的 `颜色贴图` 都指向角色自己的脸贴图。
  所以“色板就是素材”：颜色不是编造的，是贴图里就有的纯色块。
- 眼白：脸壳眼窝开口 39mm，眼球（蒙皮后）23.5mm，中间那圈由**眼窝杯卡片**盖住；
  按 UV0 采到色板的近白色块，就是游戏里的眼白。
- **口腔内部件与“唇下白条”**：`Feina_Face_SM_3` 除五官卡片外还带口腔内部（上/下牙、舌头），共 324 顶点，
  绑 `M_TeethUpper_SK` / `M_TeethLower_SK` / `M_Tongue_SK`（父级均为 `mouth_control`）；颜色同样来自
  上面的色板（牙 `(219,219,219)` 灰白、舌 `(208,137,140)` 粉）。这几根骨在游戏里由 Kawaii 面部 ABP
  （`ABP_*_Face_Kawaii`）每帧驱动，**身体 idle 里只有单帧常数轨道**，值是导出残留姿势：相对绑定把
  下颌/牙往前推约 4mm、下移约 3.4mm。按上去后下牙比脸皮凸出约 1.5mm、从嘴缝顶出（表现为唇下一道
  白条），舌头从下巴缝露出。处理：加载时丢掉 `face_control` / `mouth_control` 子树里的**单帧常数**
  轨道，让这些骨保持绑定姿势；多帧的表情轨道仍然保留。证据：射线拾取白条命中 `Feina_Face_SM_3`
  三角 379、顶点 100% 绑 `M_TeethLower_SK`；把这几根骨按回绑定后白条与舌头同时消失，而绑定姿势本就干净。

### 5.5 数据契约

若卡通光照需要新数据（ramp 图、描边浓度、shading model 分组），必须：

- 优先从**现有** `dnaColorize` 元数据扩展（`SkinMaterialMetadata` 加字段，`version` 递增到 2 并保持向后兼容读取）。
- ramp 图属于全局常量，**不进**模型包（与色板表同理），放 `packages/data/d/` 或前端常量表。**已确认必须入库**：引擎版是全白，游戏在 `EM/Content/Asset/Char/Player/Common/Texture/` 下覆盖了真正在用的 LUT。该图已内联进 `apps/web/src/utils/skin-toon-ramp.ts`（`SKIN_TOON_RAMP_PNG`，base64），源图在 `.docs/skin-toon-render/T_CharacterRampCurve.png`。
- 导出器（`tools/skin-model/export-skin.ts`）的改动必须可增量重跑，不得要求重导全部 202 个皮肤。

## 6. 验收协议

1. 先跑数据层：`.tmp/skin-accept/acceptance.ts`（T/M/S/V 全绿）。
2. 再跑视觉层：固定机位（front / side / back + 一张脸部特写）截图，与参考图比 T1–T6。
3. 至少覆盖 **4 个不同体型/材质组合**的皮肤（含：普通 SP、带丝袜 SP、带羽翼 BodyDN、带薄纱 SilkTran），不能只对菲娜一个皮肤调参。
4. 基准图冻结前，任何「看起来像了」都不算通过；冻结后每次改动都必须复跑。
5. 参考图冻结后不得替换；若游戏版本更新导致外观变化，另开一版基准目录并注明版本号。

## 7. 非目标

- 不做实时 PBR 与卡通的双模式切换（除非用户明确要求）。
- 不追求与游戏逐像素一致：目标是与截图**同一种视觉语言**，区域色准 ΔE ≤ 5。
- 不重做染色/剪影算法；这两块的既有反编译结论视为正确。
- 不为卡通效果引入体积光、屏幕空间反射、SSAO 等额外效果。

## 8. 未解问题（实现前必须收敛）

**已全部收敛的（从早期猜测修正）**：

| # | 原问题 | 结论 |
|---|---|---|
| Q1 | shading model id 是几？ | **RT2.w**，角色材质 = **14**；眼睛/表情 = 12（无光照）；5 = 皮肤；9 = 头发 |
| Q2 | 角色卡通光照 PS 在哪？ | **Global 归档索引 1701**，`switch` 15 个 case，产物在 `.tmp/shader-probe/lighting/` |
| Q3 | ramp 行号由什么选择？ | **`round(GBufferB.x * 256)`** = 材质 `SV_Target_2.x`，皮肤默认行 6 |
| Q4 | 描边是后处理还是 inverted hull？ | **后处理**：深度 + 法线 4 邻域边缘检测（`97765_f3`）；皮肤 VS 无任何法线外扩 |
| Q6 | 自阴影是否存在？ | **存在**（帽檐投在发顶 L 0.25→0.85，垂发贴脸 L 0.32→0.03） |

**仍未收敛**：

| # | 问题 | 影响 | 证据强度 |
|---|---|---|---|
| Q5 | 亮/暗 tint 是场景级还是逐材质？ | 决定是否按 kind 覆写。当前已知 `MM_PP_ToonShading` 有全局 `Light Tint`/`Dark Tint`，但硬阶跃实际来自 ramp atlas | ★★ |
| Q7 | ~~`rampX` 的精确派生式~~ | **已解**：`min(halfLambert(N·L), halfLambert(N·V))`，见 §5.2 | ★★★ |
| Q8 | `T0` 与 `T11` 是否同一张图集？ | 皮肤（id 5）用 `T11` 的整数列 3/4/5；`T0` 用连续 x。大概率是两张不同 LUT | ★ |
| Q9 | `SV_Target_4.w`（描边浓度 0.7）的消费者？ | 后处理描边 PS 不读 GBufferE，当前 build 未找到消费点 | ★ |
| Q10 | 16 条曲线如何映射到 256 行？ | 实测 56–255 全白，只用了前 ~56 行；每曲线占几行未确认 | ★ |
| Q11 | `RT1.w`（`CB1[20].y`）的实际值？ | **不影响卡通光照**（延迟 PS 不读），可忽略 | ★ |
| Q12 | 头发为什么比参考图低饱和？ | `MI_Feina_Hair` 的父材质是 `M_Player_Hair_V10`，导出器按名字把 `Hair_Tint` 判成 `hair`、其余落到 `base`，于是走「贴图直乘」而非「染色遮罩 × 3 色」。反编译 `M_Player_Hair_V10` 主 PS（归档 map 1608 → `106992_f3`，510 行）确认：`SV_Target_2.w = 0.992` → **shading id 13（固定色）**，ramp 行号 `clamp((RampRow + 0.5) / 256)` 用的就是材质的 27；但图集第 27 行在 x>0.5 后是「黑→亮青→黑」的窄带，游戏靠 `x = mad(rampX, bandWidth - x0, x0)` 把它压进窄带内采样，`bandWidth` 是场景级 CB，未解。我们的实现用全区间采样，直接套行 27 会得到大片纯黑，故退回中性行 0；贴图本身饱和度 0.51，渲染后 0.40（参考 0.67），差距来自 RT0 里我们还缺的 `EmissiveColor`/Fresnel 项。**已加 `dnaHairSaturation=1.35` 补偿**（在 map 之后按亮度线性外扩饱和度，实测 0.37→0.49），剩余差距仍在 RT0 合成 | ★★★ |
| Q13 | 参考图与本地渲染的染色不同？ | **已解**：参考图对应染色码 `C0000003UYTRUSGRURVSFRTRUSG00` → 皮肤 180101、`colorIds=[1002,1024,1002,1003,1023,1001,1002,1024,0]`。带上该方案后我们的外套/蓝袖/靴子配色与参考图一致（靴子区域 ΔE2000 = 4.7），说明**色号分配是对的**。默认 `setColors([])` 用的是材质自带配色，与参考图不是同一件衣服——对比时必须带染色码 | ★★★ |
| Q14 | 参考图外套为什么比我们亮近一倍？ | 参考图外套是一层 **240 → 157 的缎面渐变**（同一件衣服内区域 ΔE 就有 ~20），我们是一片 126–131 的平灰。游戏 silk 材质用**渐变贴图 T0** 按光照/视角坐标采样做这层渐变（见 `silk/main.hlsl` L370-400 `_1731` 的 T0 采样与 `_1812` 的色号派生），我们的 ramp 是单行常量曲线，做不出面内渐变。**这是「银色反光」差距的真正来源**，需要在材质里补一层渐变采样 | ★★ |

| Q15 | 非菲娜角色头发整片不显示？ | **已解（2026-11-15）**：`kind==="hair"` 的分支和后面统一的饱和补偿块**各自声明了一次 `float dnaHairLum`**，同一作用域重复定义 → GLSL 编译失败（控制台 `WebGLProgram: Shader Error 1282 - VALIDATE_STATUS false`），three 直接跳过这些节点，所以不是「黑」而是**没画**。只有 `kind==="hair"` 的角色（如 `Splise`／`Fuluo`）同时命中两段；菲娜/黑桃的头发材质被判成 `base`，只命中后一段，所以一直是好的。修复：第二处改名 `dnaHairLum2` | ★★★ |
| Q16 | 哪些 ramp 行可以全区间采样？ | **判据：行右端（x=1）是纯黑的是「装饰行」**，游戏只在一条窄带里采样、永远碰不到右端；我们按全区间采样会把最受光的区域乘成黑色。图集实测：20/21/25/26/27/28/29/30/31 右端为黑，0–19 全部收在 253/255。`INVALID_RAMP_ROWS` 已按此补全（原来只挡了 21/27/29/30/31，`Fuluo` 的 26 漏网 → 头发全黑） | ★★★ |
| Q17 | 哪些角色的模型整只加载失败？ | **已解（2026-11-15）**：`atlas?.center[0]` 假定 `eyeAtlas.center` 一定存在，但导出器对「虹膜图集量不出」的皮肤（左右眼合图、虹膜不居中：`Baiheng`＝扶疏、`Yeer`＝耶尔与奥利弗）只写 `{ channel }` → `createMaterial` 抛 `Cannot read properties of undefined (reading '0')`，整个 `Promise.all` 失败，染色页显示「模型加载失败」。修复：`EyeAtlas.center/radius` 改可选，渲染器改 `atlas?.center?.[0] ?? 0.5` | ★★★ |
| Q18 | 五官卡片取 UV0 还是 UV1？ | **逐材质实测**：`M_Player_FaceExpres_V11` 的五官画在脸贴图**下缘色板**、按 UV0 原样取色（乘 `UVScale` 会推出 [0,1] 采到皮肤区）；`M_Player_Face_V14` 画在 **UV1** 指向的区域。导出包不带这个信息，渲染器按「蒙皮骨含眉/眼睑/牙/舌/下颌 ≥50% 判为五官层 + UV1 平均亮度明显低于 UV0 → 取 UV1」逐网格判定（`pickFaceOverlayUv`）。伊薇/法露茜的眉毛缺失就是被误判成 UV0 采到皮肤色 | ★★★ |
| Q19 | 法露茜头发「中间有空隙」？ | **已解（2026-11-15）**：头发遮挡**不能用底图 alpha**。反编译 `M_Player_Hair_V10` 主 PS（`106992_f3` L163-193）：底图 `T26.w` 只进 `_598` 当着色混合权重，真正决定 discard 的是另一张贴图 `T25` 的 **R 通道**（`_403` → `_440` → `mad(..., -1.0), 1.0), -0.3333) < 0`，且 `T25` 有自己的 UV 集/缩放（`CB3[8].y`）。底图 alpha 是发丝深度/长度图，`T_Falu_SP01_Hair_D` 有 38% 低于 0.3333，拿它裁就是头顶成片空洞（游戏内是实心）。材质没有覆盖混合贴图时父材质给白图 → 阈值恒过。修复：`isHairMaterial` 的 alpha 一律取 `dnaMaskMap.r`（缺图时是 1×1 白图 → 完全不透明）。实测 菲娜（`Hair_V10`）底图 alpha 恒 255，改动前后无差异；法露茜头顶缝隙消失 | ★★★ |
| Q20 | 芙罗拉胸口几块青色？ | **已解（2026-11-15）**：自发光贴图是**带颜色**的发光图，不是灰度遮罩——实测亮像素里 100% 有彩度，芙罗拉 `QNF_SP10_Body_SM_2` 那两处槽位的贴图是红色 `(90,5,6)`，而材质 `自发光颜色`（染 7 号位）是青色 `(0,0.81,1)`。旧实现只取贴图 `.r` 当标量、直接乘 7 号色，等于丢掉贴图颜色让青色铺满 → 整块青色。修复：改取 `.rgb`（灰底遮罩式贴图结果不变，染 7 号色仍然生效）。回归：16 张基准图里只有 `wing-bodydn`（就是 110201）4 张变化（0.75%~1.79% 像素），其余 12 张逐像素一致（meanAbs ≤ 0.01） | ★★★ |
| Q21 | 白色羽翼/时装过曝、实机有灰阶？ | **已解（2026-11-15 更新）**：① `case 14` 收尾曲线（`01701_f3` L1738-1755），shape 展开是 `1.5a³−0.35a²`、两段各取一半再乘 1/π（旧写法 `1.15a` 且漏了均分）；② ramp 采样按 `x = x0 + rampX(1-x0)` 映射到行尾；③ 布料横轴用 `saturate(N·L)`；④ 收尾乘主光颜色；⑤ `_5913` 天空项按可见度加到漫反射（不乘 albedo）。**实现取舍**：曲线只在亮度域套再回乘色度（逐通道等于加灰）；只对丝绸类布料生效（Wing/Billboard 排除）。`dnaToneScale=2.4`、`dnaToonSky≈0.08`、光色 `(0.90,0.94,1.10)`、曝光 1.2。实测参考图那套染色的外套 p25/p50/p75/p90 = 195/216/231/248、贴顶 0%（参考图 171/209/239/248）。同轮修掉两个材质分类 bug：头发被导出器兜底成 `base` 而吃了皮肤散射并砍掉 65% 高光；头发照抄材质 `RampRow=1`（脸的肉色曲线）把蓝发压灰。 | ★★★ |
| Q22 | 每种材质到底走哪个 deferred case？ | **已解（2026-11-15）**：从各 GBuffer 着色器写出的 `SV_Target_2.w` 反查（`round(w*255) & 15`）：`body`/`silk`/`skin`/`M_Weapon` = 254 → **case 14**；`hair`（`19813`/`106992`）= 253 → **case 13**（直通：延迟通道只按 `ramp(0.5, row)` 乘一次，头发形状全靠它自己 GBuffer pass 里的高光）；`face`/`Eye`/`Expression` = 252 → **case 12**（unlit）。**`case 5` 不被任何角色材质引用**。另：GBufferD 的逐像素遮蔽 `_745/_747` 在这套材质里恒为 1（`SV_Target_5 = (_835,1,1,1)`，`_835` 缺 T24 时兜底 1），所以 `_3207=_3209=_3215=1`、`_576=1`，case 14 的 `x` 塌成 `max(band, x0)`。**头发的方向性来自运行时数据，不在 pak 里**：`19813_f3` L403-433 用 `T1.Load(0..24)` 取一个**结构化缓冲**的二次型系数（`max(c0 + c1·d + dᵀCd, 0)`，即逐发簇 SH 光照），再用 `CB0[215]/[222]` 加权、`frac(...)` 做色相旋转。这个缓冲由 CPU 每帧按发簇算，不是资产，所以头发的明暗变化无法从解包数据还原；我们的头发只能做到 `albedo × ramp(0.5,row)` 的平铺（实测 212/224/229/231，参考 180/191/221/247）。**遗留**：头发的 `directSpecular` 在本渲染器里测不出贡献（粗糙度 0.05 与 0.32 出图逐像素一致）；改用硬两段掩码后我们 190/212/220/224，参考 180/191/221/247——p25/p50/p75 已对齐，缺的是 p90 那一截，只能来自上面那条逐发簇 SH（运行时数据）。**ramp 行**：`19813_f3` L174 `_622 = clamp((CB2[12].z + 0.5) × 1/256, 0, 1)`、`SV_Target_2.x = _906 = mad(_622, _850, _845.x)`，即行号就是材质声明的 `RampRow`（菲娜 27、止流 28、奥忒/伊芙 31）；`(row+0.5)/256` 是 V 坐标，`_850/_845.x` 是开启逐实例覆盖时才生效的附加项。因 `case 13` 固定采 u=0.5，而 26–31 行在 x=0.5 全是 127，行号对头发几乎没有影响 | ★★★ |
| Q23 | 止流背后两条飘带渲染成不透明灰面？ | **已解（2026-11-15）**：那不是布料，是特效拖尾。`Zhiliu_SP01_Body_SM_2` 的材质父级是 `.../Effect/Materials/SkeletalMesh/M_SimpleEffectTrail_SK`，没有底图/法线（`textures: []`），颜色全来自材质 `自发光颜色 = (1, 0.331, 0.221)`；原实现按普通材质走 → 保留 GLTF 平色，渲染成一块不透明灰面。现在 `/Effect/Materials/` 下的材质单独走：不受光、`AdditiveBlending`、双面、不写深度，并按 UV 两端做衰减（根部实、末端散）。注意材质里的 `AddTexStrength=200` 是给 HDR 特效管线的，不能直接当亮度用 | ★★★ |


**收敛策略**：Q8/Q10 用「固定机位截图 + 已知 albedo 反推」的实测方式收敛；Q5/Q9/Q11 对实现无阻塞，按默认值实现并在代码标注。**Q7 已解，P1 不再阻塞。**

## 8.1 差距侧实测基线（P1 的输入）

来自 `.docs/skin-toon-render/renderer-gap.md`（629 行，含探针脚本）。以下数字可直接作为 P1/P4 的对照基线。

**整体前景（背景已剔除）**

| 指标 | 游戏 | 我们 | 结论 |
|---|---|---|---|
| 线性亮度 p50 | 0.422 | 0.272 | 我们 −36% |
| 线性亮度 p75 | 0.702 | 0.410 | −42% |
| 平均饱和度 | 0.330 | 0.223 | −32% |

**特征区域（中位色）**

| 区域 | 游戏 | 我们 |
|---|---|---|
| 脸（脸颊） | `#fceae4` L0.851 S0.10 | `#e0baae` L0.540 S0.22 |
| 大腿皮肤 | `#ffbca7` L0.600 S0.35 | `#efcfc1` L0.668 S0.19 |
| 白裙/白布 | `#e2e1e7` L0.758 | `#7d7d81` L0.206 |
| 头发（主体） | `#2f77dd` S**0.79** | `#5586a9` S**0.50** |
| 头发（受光顶） | `#61c4fb` L0.490 | `#70b3db` L0.408 |
| 帽檐金属 | `#cdd1df` L0.639 | `#6c7c97` L0.198 |
| 腿部蓝袜 | `#28509f` L0.087 S0.75 | `#5177ab` L0.179 S0.53 |

**关键比值**

| 指标 | 游戏 | 我们 | 结论 |
|---|---|---|---|
| 环境光占受光面（R/G/B） | — | 36.5% / 39.4% / 45.3% | 过强且偏冷，是「灰平」的总根源 |
| 暗/亮逐通道比（皮肤，线性） | (0.97, 0.42, 0.36) | (0.49, 0.50, 0.57) | 游戏暗部**更暖更艳**，我们**更灰更冷** |
| 皮肤暗部饱和度 | 0.38 | 0.16 | 方向相反 |
| 皮肤亮度 p10→p90 跨度 | 1.49× | 2.18× | 游戏是窄亮带，我们是宽带 |
| 皮肤直方图局部峰数 | **1**（平顶） | **4** | PBR 连续 N·L 的特征 |
| 皮肤 R 通道贴顶（=254）比例 | **88.0%** | 10.9% | 游戏暗部偏橙的物理来源 |
| 亮主体边界有暗线比例 | 29% | 16%（全巧合） | 我们无描边 |
| 渲染/albedo 中位比 | 0.97 | 0.77 | 平均丢 23% 的光 |

**测量局限（引用这些数字时必须一起引用）**

1. 游戏截图带 bloom/glow，会抬亮人物边缘——绝对亮度差只能作方向参考，不能当作「曝光乘 1.5 就对了」。
2. 两图分辨率差 2.87×，**梯度统计不可直接比**；可比的是直方图形状与同一肢体横截面的逐通道比值。
3. 背景不同，区域掩码已排除背景，但边缘像素仍可能被抗锯齿混色污染。
4. 「渲染/albedo 0.97 vs 0.77」的两张图不是同一皮肤，只用于量级判断；落地时须在同一皮肤上重测。

## 8.2 实现路线结论

**采用路线 2（材质内改写）+ 灯光重配**，理由已由两份调研量化：

- 注入点：替换 `#include <lights_fragment_end>`，覆写 `reflectedLight` 四个字段；不需要碰 Three 内部函数，`ReflectedLight` 结构体在 `common.glsl.js:48-53`。
- 改动量 60–100 行；对 8 种 kind 全部兼容；**不影响** alphaTest / alphaToCoverage / 透明背景 / 阴影 / toneMapping（这些都排在该 chunk 之后）。
- 与游戏公式的对应：游戏的 `lit = min(albedo * ramp.rgb, 0.86)` 是**乘性缩放**，可以直接在前向 pass 里复刻——我们不需要 GBuffer 也能算出 `N·L`，因为每个像素的法线只取决于它自己。
- 路线 1（后处理）虽然与游戏架构（延迟 + 后处理描边）一致，但被「透明背景 + alphaToCoverage + 移动端 MRT」拖住；**仅描边这一项它更划算**，单独评估。
- 路线 3（全 unlit）不做：会丢掉丝绸/羽翼需要的 IBL，且等于推翻已标定好的 PBR。

## 9. 附录：反编译复现命令

这套链路每个阶段都要用，踩过的坑记在这里，别重复试。

```bash
# 反编译器必须在 PATH 里，否则报「dxbc2dxil.exe 不是内部或外部命令」
export PATH="/d/dev/fmodel-mcp/.tools/HLSLDecompiler-v0.6/extracted:$PATH"

# 1) 拿材质的 shader map（resourceHash + 全部 permutation）
fmodel-cli material-shader "EM/Content/Asset/TA/Char/Materials/Player/Body/M_Player_Skin"

# 2) 按 resourceHash 导出该 map 的全部字节码（归档只读一次）
fmodel-cli export-shader-map \
  "EM/Content/ShaderArchive-EM_Chunk0-PCD3D_SM5.ushaderbytecode" \
  <resourceHash> .tmp/shader-probe/<name>

# 3) 反编译主 PS（文件名 <index>_f3.dxbc，f3 = SF_Pixel）
HLSLDecompiler .tmp/shader-probe/<name>/<index>_f3.dxbc -dxbc .tmp/shader-probe/<name>/<index>_f3.hlsl
```

坑位：

- `EM/ShaderLibs/ShaderArchive-1.7.*` 那些归档**不含**角色材质 map（已试过 `1.7.217.1Char`），角色材质在 `EM/Content/ShaderArchive-EM_Chunk0-*` 里。
- 传本地磁盘路径（如 `F:/test/EM/...`）给 `export-shader-map` 会报 `There is no game file with the path`——它只认 pak 内的虚拟路径。
- CLI 的 JSON 输出含中文槽名（GBK/UTF-8 混杂），用 `bun` 读文件再 `JSON.parse`，**不要用 python**（会 `UnicodeDecodeError`）。
- 反编译产物与探针脚本一律落 `.tmp/`（gitignore），不要进仓库。
