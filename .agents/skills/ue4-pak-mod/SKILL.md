---
name: ue4-pak-mod
description: 制作与调试 Unreal Engine 4.27 游戏的 pak 模组（模型/网格/资产换皮，如《二重螺旋》Duet Night Abyss）。两条路线：编辑器烘焙（Blender 自由改模型 → UE4.27 cook → pak）与二进制替换（改写已烘焙 .uasset 的导出名/载荷）。当需要「把 A 的模型换成 B 的模型」「让模型能自由导入 Blender 编辑再放回游戏」「生成可用的 mod pak」「改写 .uasset 导出名」「排查替换后角色隐身/拿到空网格」「确定 pak 挂载点与版本」「用 repak 打包并校验」时使用。含 repak / UAssetCLI / UAssetGUI / UAssetAPI / UE4Editor-Cmd / Blender 的工具位置与用法、映射表格式、一键构建与校验脚本。
---

# UE4.27 模型 Mod

## 两条路线怎么选

| | **编辑器烘焙**（推荐） | **二进制替换** |
| --- | --- | --- |
| 能做什么 | 任意编辑：改形状、加删顶点、重拓扑、重做 UV/权重 | 只能换整张网格 / 改包身份 |
| 怎么做 | Blender 导 glb → 改 → FBX → UE4.27 工程 cook → pak | 拿现成的包改名，`modtool` 改写导出名 → repak |
| 代价 | 需要装 UE4.27 编辑器；单次构建几分钟 | 秒级 |
| 前提 | 引擎大版本要和游戏一致（4.27） | 无 |
| 文档 | `references/editor-cook-pipeline.md` | 本文件下面的 Workflow |

**默认选编辑器烘焙**——它才是「自由做 mod」的正解。二进制替换适合「拿游戏里已有的另一张网格
顶上」这种不需要编辑的快速换皮：不用开编辑器、不用 cook、秒出结果，而且完全保留游戏原始包结构。
（没有编辑器免开的开源方案能写出烘焙态的包：FModel / CUE4Parse / umodel 全是只读，
UEFormat 的反向也要 UE 插件。详见 `references/editor-cook-pipeline.md` 开头。）

## Overview（二进制替换路线）

把游戏里某个资产换成另一个资产（最典型：把角色 A 的网格换成角色 B 的网格），做成一个
`.pak` 放进游戏的 `~mods` 目录生效。

**这件事不能靠「把文件改名复制过去」完成。** 有两条铁律，任何一条错了表现都是
「角色直接隐身 / 部件消失」，而且游戏日志里通常看不到明确报错：

1. **导出对象名必须等于文件名。** UE 解析 `Eve_Body_SM.Eve_Body_SM` 这类引用是
   「按文件路径加载包 → 再按名字在导出表里查对象」。你把 `Npc_Aida_SM.uasset` 改名成
   `Eve_Body_SM.uasset` 放到目标路径后，包里导出的对象名还是 `Npc_Aida_SM`，
   按名查找落空 → 引用解析成 null → 那个网格组件什么都不画。
   **必须用 `modtool build` 把导出名也改掉。**
2. **pak 挂载点必须是 `../../../` 前缀的标准形式。** UE 的 `FPakFile::NormalizeFilename`
   先用 `FPaths::MakeStandardFilename` 把绝对路径变成 `../../../EM/Content/...`，
   再用挂载点做**前缀比对**去截取包内路径。挂载点写错（比如少一层 `..`）不会报错，
   只是这个 pak 里的文件永远匹配不上。
   本技能默认用 `-m ../../../` + 包内放 `EM/Content/...` 全路径（repak 默认，见
   `references/pak-and-asset-format.md`）。

打包之外还有一步**同样关键**的前置判断：**源网格和目标网格必须共用同一套骨架（USkeleton）**，
否则动画/骨骼对不上，模型会扭曲或无法受力。判断方法见下面第 2 步。

## When to use

- 「把 X 的模型替换成 Y 的模型」「做一个换模型 mod」「生成 mod pak」。
- 「把模型导出到 Blender 改完再导回游戏」——走编辑器烘焙路线。
- 需要改写已烘焙 `.uasset` 的内容（改名、换引用、替换载荷）。
- 排查「替换后角色隐身 / 部件不见了 / 拿到空网格」「装上去毫无变化」「模型变默认灰」。
- 确定某个 UE4.27 游戏该用哪个 pak 版本、挂载点、压缩、加密。
- 已经解包过资产，想直接把改好的资产重新打回 pak。

## Prerequisites

**二进制替换**只需要：

1. `repak.exe`、`UAssetCLI.exe`、以及可用的 `dotnet` SDK 10（`modtool` 需要）。
2. 游戏已解包（解包树同时是「源资产」和「目标资产原样」的来源）。
3. 首次构建 `modtool` 需要联网（从 NuGet 还原 UAssetAPI 1.1.0）。

**编辑器烘焙**额外需要：

4. **UE4.27 编辑器**，且版本要和游戏一致（大版本必须相同，否则烘焙产物的序列化版本对不上）。
   本机在 `D:\soft\UE_4.27`（已由 launcher 注册，`.uproject` 里 `EngineAssociation: "4.27"` 可用）。
5. **Blender**（本机 5.2 LTS）——glb ⇄ FBX 互转，可无头跑。
6. 引擎源码（`D:\soft\UE_4.27\Engine\Source`）——排查序列化/烘焙行为时的权威依据，有它就不用猜。

路线无关：清楚**目标游戏 pak 的版本**。UE4.27 用 `V11`；不确定就看游戏自带的 pak 或
本机已有的现成 mod（`repak info`）。

## Workflow（二进制替换路线）

### 1. 找到源资产与目标路径

在解包树里定位。网格源通常是
`.../Asset/Char/<阵营>/<角色>/Mesh/*.uasset`，目标就是你要覆盖的那个包路径。

一个网格资产是 **`.uasset` + `.uexp` 成对**出现的，两个都要处理（`modtool` 会自动输出 `.uexp`）。

### 2. 判断能不能换：比对骨架  ★最容易忽略的一步

用名字表里的字符串就能判断，不用解析二进制：

```bash
cd <解包树>/Asset/Char/Player/Char035_Eve/Mesh
for f in *_SM.uasset; do
    printf "%-28s %s\n" "$f" "$(grep -a -o -E "[A-Za-z0-9_]*_Skeleton" "$f" | sort -u | tr '\n' ',')"
done
```

**只换骨架与被替换目标同款的网格。** 骨架不同意味着骨骼层级/命名不一致，
换上之后要么不受动画驱动（停在绑定姿势），要么直接错位。

同时注意：**一个角色往往不是一个网格，而是 Body + Face + Hair 等好几个组件拼的**
（见第 3 步）。如果目标角色的网格是一张「整合了全身」的网格，那就要把 Body/Face/Hair
都指向它 —— 只要它们共用骨架、且挂载点在同一个节点上（`RelativeLocation` 为 0），
这几份几何体就是完全重合的，合成结果仍是单个角色，不会穿帮。

### 3. 确认角色的组件是怎么拼起来的

角色的装配不在 `Asset/Char/...` 里，而在 **`AssetDesign`**：

```
AssetDesign/Char/Player/<角色>/BP_<角色>.uasset        # 玩家角色
AssetDesign/Char/Npc/CharacterNpc/<角色>/BP_NPC_*.uasset # NPC
AssetDesign/Char/Monster/<怪物>/BP_Mon_*.uasset
```

想知道「谁引用了这个网格」，直接对解包树做字符串搜索最快（`.uasset` 的名字表是明文）：

```bash
cd <解包树>
grep -rl -a --exclude-dir=Animation --exclude-dir=Cinematics "Eve_Body_SM" .
```

拿到 BP 的 JSON 导出（UAssetCLI `export`）后重点看三件事：

- **`SkeletalMesh`**：哪个组件用了哪个网格。
- **`RelativeLocation` / `AttachParent`**：组件挂在根节点还是某个 socket 上。
  挂在 socket 上的组件**不能**塞全身网格进去（会把整张身体画在那个骨骼位置）。
- **`OverrideMaterials`**：是否逐组件覆盖了材质。值全是 `0` 表示是空槽（用网格自带材质），
  这种情况才可以把多个组件指向同一张网格而不串色。

### 4. 写映射表

制表符分隔，`#` 开头为注释，三列：

```
<源 uasset 绝对路径>	<游戏内相对路径，不含扩展名>	<新导出名>
```

**第三列必须等于第二列的文件名**，否则违反铁律 1。

可直接复制 `examples/eve-to-aida.tsv` 改。

### 5. 一键构建

```bash
.agents/skills/ue4-pak-mod/scripts/build-mod.sh <mapping.tsv> <out.pak>
```

脚本会依次：编译 `modtool` → 按映射表生成改名后的包到 `<workDir>/pakroot`
→ **自校验**（导出名是否等于目标名、`.uexp` 是否与源文件逐字节一致）
→ `repak pack` → 打印 pak 元数据。

`workDir` 默认是 `<skill>/.tmp`（已被 `.gitignore` 忽略），用 `WORK_DIR=...` 覆盖。

任何一步不过就直接失败，不会产出一个「看起来成功但装上去没用」的 pak。

### 6. 校验并安装

```bash
# 第二个参数是 build-mod.sh 的中间目录，默认 <skill>/.tmp/pakroot
.agents/skills/ue4-pak-mod/scripts/verify-mod.sh <out.pak> \
    .agents/skills/ue4-pak-mod/.tmp/pakroot
```

会打印元数据、包内路径列表，并把 pak 解包后与构建产物**逐字节比对**。

安装（放到游戏 paks 目录下的 `~mods`，UE 会递归扫描该目录下的 `*.pak`）：

```bash
cp <out.pak> "<游戏>/<项目名>/Content/Paks/~mods/"
```

装完**重启游戏**。UE 在启动时挂载 pak，不会热加载。

## 编辑器烘焙路线（自由编辑模型）

需要真正改模型（改形状、加删顶点、重拓扑、重做 UV/权重）时走这条。完整原理与踩坑记录见
`references/editor-cook-pipeline.md`，这里只给操作顺序：

```bash
# 1) 建工程（只需一次；build 时也会自动建）
.agents/skills/ue4-pak-mod/scripts/editor/setup-project.sh          # 默认建在 D:\dev\ue-modkit

# 2) 拿游戏模型给 Blender 改
#    解包树里已有 FModel 导出的 .glb（带 skin/权重/UV），Blender 直接打开即可

# 3) 改完一键构建
.agents/skills/ue4-pak-mod/scripts/editor/build-mod-editor.sh \
    <改完的.glb> \
    EM/Content/Asset/Char/Player/<角色>/Mesh/<网格名> \
    <输出.pak>
```

四个阶段：Blender 转 FBX → UE 导入为骨骼网格（骨架/材质占位到游戏真实路径）→
`cook -Unversioned` → 只挑网格包 repak。

三个必须记住的点（细节见 reference）：

- **工程名必须是 `EM`**：UE 按工程名生成烘焙输出目录，叫 `EM` 才落在 `EM/Content/...`。
- **cook 必须带 `-Unversioned`**：游戏资产是 `IsUnversioned: true`，不带这个开关形态就对不上。
- **骨架和材质是「占位」**：在游戏的真实路径上建同名资产，让烘焙产物的引用正确；
  它们**不能进 pak**（游戏自己有），所以打包时只挑网格包。

**改完先用自检包验证管线**：把游戏原本的网格原样走一遍烘焙，装上去外观应当毫无变化。
这一路线唯一无法离线证明的就是「游戏能不能加载烘出来的包」，必须进游戏看。

## Guidelines

- **`.uasset` 头变了，`SerialOffset` 必须跟着变。** 加一个新名字会让 `.uasset` 变大
  20 字节，导出数据在 `.uexp` 里的起始偏移必须同步更新，否则 UE 读 `.uexp` 会错位。
  UAssetAPI 的 `Write()` 会自动处理；自己动手改二进制时这是头号坑。
  `modtool check` / `verify-mod.sh` 就是在守这条线。
- **改名前先做往返测试。** `modtool roundtrip <in> <out>` 读一遍写一遍，然后 `cmp` 原文件。
  逐字节相同才说明这个库能安全改写这批资产；不一致就说明该游戏的资产有库不认识的字段，
  此时不要继续，改用 UAssetGUI 或换库版本。**本机这批 DNA 资产已验证往返逐字节一致。**
- **不要为了「彻底」去换非同骨架的网格。** 少换一个配件，最坏是残留一件原角色的饰件；
  换错了骨架/挂载点，最坏是整张身体画在错位置。前者可接受，后者不可接受。
- **pak 要覆盖游戏自带的包，靠的是挂载顺序。** 放在 `~mods` 子目录（名字 `~` 排序靠后）
  或用一个更大的 chunk 号（`pakchunk999-*`）都能让它后挂载、优先生效。
- **别把大 pak 提交进仓库。** 本仓库的 husky pre-commit 钩子会执行 `git add .`，
  一个 20 MB 的 pak 会被一起暂存。产出物放 `.tmp/`，或先加 `.gitignore` 规则。
- **`modtool` 假设每个包只有 1 个导出**（网格包的常态）。遇到多导出包它会直接报错，
  这是故意的 —— 那种情况必须先人工确认该改哪个导出，不能瞎猜。
- 构建中间产物默认写在 `<skill>/.tmp/`（已被 `.gitignore` 忽略），可用 `WORK_DIR` 覆盖。

## Worked example: Eve → Aida（已实测）

把玩家角色 Eve 的模型换成 NPC Aida 的，产出 `EveToAida_P.pak`。

调研结论：两者**共用 `Biped_Skeleton`**（`/Game/Asset/Char/Player/Skeleton/Biped_Skeleton`），
所以换模型不影响 Eve 的动画与动作蓝图；Aida 的 `Npc_Aida_SM` 是一张整合全身的网格
（9 个材质槽），`NPC_Aida_part01_SM` 是她的配件；Eve 由 Body/Face/Hair 三个组件拼成，
三者都在根节点、无 `RelativeLocation`、`OverrideMaterials` 全空 → 可以都指向同一张 Aida 网格。

映射见 `examples/eve-to-aida.tsv`（7 个包）。**故意没换** `Eve_Part02_SM`、
`Eve_SP01_Part01~04_SM`、`Eve_Sum01~03_SM`：它们的骨架不同（配件/召唤物），
换全身网格进去会整张画在错误的骨骼位置上。

```bash
.agents/skills/ue4-pak-mod/scripts/build-mod.sh \
    .agents/skills/ue4-pak-mod/examples/eve-to-aida.tsv \
    /tmp/EveToAida_P.pak
```

## Troubleshooting

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 替换后角色整个隐身 | 导出名没改，或包路径放错 | 按铁律 1 检查；`modtool check` 会直接报出来 |
| pak 装上去完全没效果 | 挂载点写错 / 放错目录 / 名字不是 `.pak`（UE 只扫 `*.pak`） | `repak info` 看挂载点；确认在 `~mods` 下且扩展名是 `.pak` |
| 某几个部件还在、没换成 | 那些网格骨架不同，未纳入映射 | 先查它的骨架，共用骨架才换 |
| 网格出现在奇怪的位置 | 组件挂在 socket 上，被塞了全身网格 | 查 BP 的 `AttachParent` / `RelativeLocation`，把该条从映射表去掉 |
| 模型扭曲/不受动画驱动 | 用了不同骨架的网格 | 见上 |
| 打包后 UE 报读盘错误 | 版本/加密与游戏不匹配 | `repak info` 对比游戏自带 pak；见 `references/pak-and-asset-format.md` |
| `dotnet` 报找不到文件、路径变成 `D:\d\dev\...` | git-bash 的 `/d/...` 路径被 .NET 当成相对路径 | 传给 `dotnet`/原生 exe 的路径用 `D:\...` 或 `D:/...`；脚本里用 `cygpath -w` 转 |
| UE 报 `DoesPackageExist FAILED: ... is not a standard unreal filename`，路径里出现 `C:/Program Files/Git/...` | **git-bash 的 MSYS 路径转换**把 `/Game/...` 改写成了 Windows 路径 | `export MSYS_NO_PATHCONV=1`（不是 UE 的问题） |
| UE Python 报 `AttributeError: module 'unreal' has no attribute 'EditorAssetLibrary'` | 没启用 `EditorScriptingUtilities` 插件 | 加进 `.uproject` 的 `Plugins`；用 `<proj>/Intermediate/PythonStub/unreal.py` 查 API 是否存在 |
| UE 导入时报 `Mesh has joint weights which are not supported`，只产出 StaticMesh | UE4.27 的 glTF 导入器不支持蒙皮网格 | 中间格式改用 FBX |
| `AssetTools.ImportAssetTasks` 在 `SharedPointer.h` 的 `IsValid()` 断言上崩 | Python 里 new 的 `AssetImportTask`/`FbxImportUI` 被 GC 回收 | 用模块级变量保住引用 |
| 烘焙产物里材质引用丢失（只有槽名，imports 里没有 MI） | 就地改 `material_interface` 不落盘 | 新建 `unreal.SkeletalMaterial()` 结构体整体赋回 `mesh.materials` |
| 进游戏模型变默认灰 | 占位材质类与游戏资产不一致，导入类过滤失败 | 占位材质必须是 `MaterialInstanceConstant`（与游戏的 MI 同类） |
| 重复烘焙后材质槽越来越多 | 只靠 `replace_existing` 替换会累积槽 | 导入前先删掉目标网格资产，从零导入 |

## Resources

### scripts/

**二进制替换路线：**

- `build-mod.sh` — 一键构建：编译 → 生成改名包 → 自校验 → 打包。
- `verify-mod.sh` — 校验 pak 元数据 / 路径 / 解包后与构建产物逐字节比对。
- `modtool/` — C# 工具（UAssetAPI 1.1.0）。子命令：`roundtrip`（往返测试）、
  `info`（看导出名）、`build`（按映射表改名构建）、`check`（校验导出名与载荷）。

**编辑器烘焙路线（`scripts/editor/`）：**

- `setup-project.sh` — 创建 UE4.27 烘焙工程（工程名固定 `EM`）。
- `build-mod-editor.sh` — 一键：glb → FBX → 导入 → cook → pak。工程不存在会自动创建。
- `blender_glb_to_fbx.py` — Blender 侧转换（UE 约定的轴/骨骼、单位自动判定、垃圾网格清理）。
- `import_mesh.py` — UE 侧导入（骨骼网格 + 骨架/材质占位到游戏真实路径）。

### references/

- `toolchain.md` — 各工具的确切位置与调用方式（repak / UAssetCLI / UAssetGUI /
  UAssetAPI / UE4Editor-Cmd / Blender / FModel 解包树 / 游戏安装目录 / AES 与 usmap）。
- `pak-and-asset-format.md` — pak 元数据与挂载点语义、`.uasset`/`.uexp` 结构、
  导出名规则、往返验证方法、UAssetAPI 用法与坑。
- `editor-cook-pipeline.md` — 编辑器烘焙路线：为什么必须开编辑器、`-Unversioned` 与工程名
  为何关键、骨架/材质占位机制、8 个实测踩坑、限制与未验证项。

### examples/

- `eve-to-aida.tsv` — 可直接运行的 Eve→Aida 映射表（二进制替换路线，绝对路径需按本机调整）。
