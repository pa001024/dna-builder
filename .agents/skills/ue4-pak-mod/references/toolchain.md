# 工具与资料位置

本机（Windows + git-bash）上做 UE4.27 mod 要用到的全部东西，以及各自的调用方式。
**路径是绝对路径，换机器需要改。** git-bash 里 `/d/...` == `D:\...`。

## 一览

| 工具 | 路径 | 能做什么 | 只读? |
| --- | --- | --- | --- |
| repak | `D:\dev\dna-unpack\repak.exe` (`repak_cli 0.2.3`) | pak 打包/解包/查看 | 否 |
| UAssetCLI | `E:\dev\DuetNightAbyssData2\tools\UAssetCLI\UAssetCLI.exe` | 读 .uasset、导出 JSON | **是** |
| UAssetGUI | `D:\dev\dna-unpack\UAssetGUI.exe` | 图形化编辑 + CLI 读写 | 否 |
| UAssetAPI | NuGet 包 `UAssetAPI` 1.1.0 | 读写 .uasset 的库（modtool 用） | 否 |
| **UE4.27 编辑器** | `D:\soft\UE_4.27\Engine\Binaries\Win64\UE4Editor-Cmd.exe` | cook 烘焙（编辑器烘焙路线） | 否 |
| **UE4.27 源码** | `D:\soft\UE_4.27\Engine\Source\` | 序列化格式的**权威依据**，别猜 | 是 |
| **Blender** | `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` | glb ⇄ FBX 互转（无头可跑） | 否 |
| UEFormat 插件 | `D:\dev\dna-unpack\tools\ueformat-v9` | Blender 侧 .uemodel **导入**（v9 无导出） | 是 |
| FModel | `D:\dev\dna-unpack\Fmodel\FModel.exe` | 解包游戏（已有现成解包树） | — |
| fmodel-cli | `D:\dev\fmodel-mcp\Cli\bin\publish\fmodel-cli.exe` | 命令行解包/搜索/导出，**带 AES key** | 是 |
| 解包树（源资产） | `D:\dev\dna-unpack\Fmodel\Output\Exports\` | 全量游戏内容 | — |
| 游戏本体 | `E:\game\Duet Night Abyss\DNA Game\` | 装 mod 的地方 | — |
| 烘焙工程 | `D:\dev\ue-modkit\EM\` | 编辑器烘焙路线的工作工程 | — |
| usmap | `D:\dev\dna-unpack\4.27.2-0+++UE4+Release-4.27-EM.usmap` | 属性名映射 | — |
| Oodle | `D:\dev\dna-unpack\oo2core_9_win64.dll` | Oodle 解压（打包压缩用得到） | — |

> `D:\dev\DuetNightAbyssData2` 是指向 `E:\dev\DuetNightAbyssData2` 的符号链接，两种写法等价。
> `D:\dev\dna-builder`（本仓库）也是指向 `E:\dev\dna-builder` 的符号链接。

## repak — 打包/解包

```bash
REPAK="D:/dev/dna-unpack/repak.exe"

# 看一个 pak（需要 AES key 的话，-a 是全局选项，放在子命令之前）
"$REPAK" info <file.pak>
"$REPAK" list <file.pak>
"$REPAK" unpack <file.pak> -o <outDir>
"$REPAK" get <file.pak> <内部路径>      # 读单个文件到 stdout
"$REPAK" pack -h                        # 看全部选项
```

`pack` 的关键选项：

| 选项 | 说明 |
| --- | --- |
| `-m, --mount-point` | 挂载点，默认 `../../../`。写错不会报错，只是 pak 永远匹配不上，见 `pak-and-asset-format.md` |
| `--version` | `V0..V11`，默认 `V8B`。**UE4.27 要显式传 `V11`** |
| `--compression` | `Zlib` / `Gzip` / `Oodle` / `Zstd` / `LZ4`；不传则不压缩 |
| `-p, --path-hash-seed` | **只收十进制**。`0xB233321C` 要写成 `2989699612` |

**坑**：`-p` 传 `0xB233321C` 会报 `invalid digit found in string`；传十进制不行也要试 `0`。
值本身只要 pak 内部自洽即可（索引和查表用的是同一个种子），对齐已知能用的值是省事的做法。

**坑**：传给 repak 的路径用 Windows 形式（`D:/...` 或 `D:\...`）。git-bash 的 `/d/...`
在多数情况下能被正确解析，但用 `build-mod.sh` 里的 `cygpath -w` 转换最稳。

## UAssetCLI — 读 .uasset（只读）

只读工具，**不能写**。两种用法：

```bash
UACLI="E:/dev/DuetNightAbyssData2/tools/UAssetCLI/UAssetCLI.exe"

# 一次性模式
"$UACLI" <file.uasset|dir>          # 解析字节码调用（蓝图里调了哪些函数、传了什么常量）
"$UACLI" export <file.uasset|dir>   # 整体 JSON（NameMap / Imports / Exports / 属性）

# server 模式：stdin/stdout 一行一个 JSON
echo '{"cmd":"fmodel","path":"<uasset>","package":"EM/Content/...","mount":"EM/Content"}' | "$UACLI"
echo '{"cmd":"shutdown"}' | "$UACLI"
```

server 模式的命令：`parse` / `parse_dir` / `export` / `export_dir` / `fmodel` / `fmodel_dir` / `shutdown`。
`export_dir` 带 `out` 参数可把每个资产的 JSON 写到磁盘（大目录用它，避免单行 JSON 过大）。
详细说明见该工具自己的 `README.md`（`E:\dev\DuetNightAbyssData2\tools\UAssetCLI\README.md`）。

**注意**：`export` 出的 JSON 里**看不到网格的渲染数据**（顶点/索引/蒙皮/材质槽都在 `.uexp`
的导出数据区，不是带 tag 的属性）。所以判断一个网格包改对了没有，主要看 `ObjectName`，
不要指望从 JSON 里读到几何信息。

**注意**：一次性模式 `export` 一个 8 MB 的网格包会输出 11 MB 的 JSON，别在管道里 `head` 到一半
就以为工具坏了。

## UAssetGUI — 需要手工编辑时用

```bash
cd /d/dev/dna-unpack
./UAssetGUI.exe tojson  <in.uasset> <out.json> <engineVersion>
./UAssetGUI.exe fromjson <in.json>  <out.uasset> <engineVersion>
```

**坑**：不带参数直接运行会弹出 GUI 窗口，在自动化流程里别这么干。

JSON 往返路径对网格包不适用（同上：渲染数据不在 JSON 里）。要批量改名就用 `modtool`。

## UAssetAPI — modtool 的底层库

- NuGet 包 `UAssetAPI` 1.1.0（本机 NuGet 缓存里没有，**首次构建需联网**）。
- `UAssetCLI` 和 `UAssetGUI` 底层也是它，三者对同一批资产的行为一致。
- 关键 API：
  - `new UAsset(path, EngineVersion.VER_UE4_27)`
  - `asset.Exports[i].ObjectName = FName.FromString(asset, "新名字")` ← 改名
  - `asset.Write(outPath)` ← 同时写出 `.uasset` 和同名 `.uexp`，并自动重算 `SerialOffset`
- **先做往返验证**：对一批新资产，先 `roundtrip` 再 `cmp` 原文件。本机这批 DNA 4.27 烘焙资产
  已验证往返**逐字节一致**，可以放心改写。

## 解包树（源资产与「原样备份」）

`D:\dev\dna-unpack\Fmodel\Output\Exports\EM\Content\` 就是完整的游戏内容，
`.uasset` + `.uexp` 成对存在（另有 FModel 额外导出的 `.glb` / `.png` / `.json`，可忽略）。

包路径与游戏内路径的对应关系：

```
<解包树>/EM/Content/Asset/Char/...   ↔   /Game/Asset/Char/...   ↔   pak 内 EM/Content/Asset/Char/...
```

（`EM` 就是本游戏的挂载点，等价于其他游戏的 `Sandfall`、`FortniteGame` 之类。）

**它同时是「原始文件」的来源** —— 要回退或对比时用它。

## 游戏本体

```
E:\game\Duet Night Abyss\DNA Game\
├── EM.exe
├── GameVersion.json                       # {"version": 16001}
└── EM\Content\Paks\
    ├── pakchunk0-WindowsNoEditor.pak      # ~31 GB，V11，AES 加密
    ├── pakchunk0-WindowsNoEditor.sig
    ├── pakchunk0optional-WindowsNoEditor.pak
    └── ~mods\                             # ★ mod 放这里
        └── SP12_ZNF01_P.kap               # 现成参考 mod（注意扩展名是 .kap，见下）
```

- `E:\game\DNA 1.6\`、`E:\game\Duet Night AbyssL\` 等是其他/旧安装，别装错目录。
- **UE 只扫描 `*.pak`**。上面那个 `.kap` 不会被加载（大概率是故意改名禁用的，
  也可能是被启动器接管的）。**我们的产出必须是 `.pak`。**
- `~mods` 子目录会被递归扫描；`~` 在 ASCII 里排在字母之后，因此天然后挂载、优先生效。
- 游戏 pak 是加密的（`repak info` 报 `pak is encrypted but no key was provided`），
  本机没有存 AES key（FModel 配置里只有 `AesReload`，说明它是联网取的）。
  **做 mod 不需要这个 key** —— mod pak 的索引不加密也能被引擎正常挂载，
  参考 mod 就是未加密的。只有想 `repak unpack` 官方 pak 时才需要。

## UE4.27 编辑器 — 无头跑 Python（编辑器烘焙路线）

```bash
UE_CMD="D:/soft/UE_4.27/Engine/Binaries/Win64/UE4Editor-Cmd.exe"
PROJ="D:/dev/ue-modkit/EM/EM.uproject"

# 跑一段 Python（commandlet 模式）—— 这是 4.27 唯一可靠的入口
"$UE_CMD" "$PROJ" -run=PythonScript -Script="D:/.../import_mesh.py" \
    -unattended -nullrhi -nosplash -nosound -NoLogTimes -abslog="D:/.../import.log"

# 烘焙
"$UE_CMD" "$PROJ" -run=Cook -targetplatform=WindowsNoEditor \
    -CookAll -Unversioned -SKIPEDITORCONTENT -NoGameAlwaysCook \
    -unattended -nullrhi -nosplash -nosound -stdout -abslog="D:/.../cook.log"
```

要点：

- **`MSYS_NO_PATHCONV=1` 必须设**，否则 git-bash 会把参数里的 `/Game/...` 改写成
  `C:/Program Files/Git/Game/...`，UE 判定为非法包名。
- 引擎装在 `D:\soft\UE_4.27`，已由 launcher 注册（`AppVersion 4.27.2-18319896+++UE4+Release-4.27-2023.1-Windows`），
  所以 `.uproject` 里 `EngineAssociation: "4.27"` 直接可用。
- **UE4.27 没有 `-ExecutePythonScript`**（UE5 才有）。`StartupScripts` 设置项在 `-nullrhi` 下不触发。
- `engine/Source/` 是全套源码 —— 序列化格式有疑问时**读源码**，比猜快得多。
  例：`Engine/Source/Runtime/Engine/Private/SkeletalMeshRenderData.cpp`、
  `.../SkeletalMeshLODRenderData.cpp`；cook 的参数在
  `Engine/Source/Editor/UnrealEd/Private/Commandlets/CookCommandlet.cpp`。
- 引擎会生成一份 Python API 清单：`<proj>/Intermediate/PythonStub/unreal.py`。
  **查某个类/属性是否存在、名字叫什么，看它**，别凭记忆写（实测踩过
  `EditorAssetLibrary` 不存在、`import_as_skeletal` 不够等坑）。
- 日志用 `-abslog=<绝对路径>` 指定，否则在 `Saved/Logs/` 下。

## Blender — 无头转格式

```bash
BLENDER="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"
MODKIT_GLB=... MODKIT_FBX=... "$BLENDER" --background --factory-startup --python blender_glb_to_fbx.py
```

- `--background --factory-startup` 即可无头运行，`bpy.ops.import_scene.gltf` /
  `bpy.ops.export_scene.fbx` 都可用（Blender 5.2 LTS 实测）。
- 导出 FBX 给 UE 的关键参数：`axis_forward=-Z`、`axis_up=Y`、`add_leaf_bones=False`（UE 不要叶骨）、
  `armature_nodetype=ROOT`、`primary/secondary_bone_axis=X/Y`。
- Blender 的日志走 stderr/stdout，脚本里自己 `print` 并 flush，外层 grep 即可。

## AES / usmap 怎么来的（换机器时）

- AES key：FModel 的 `AesReload` 会联网取；或 `D:\dev\dna-unpack\AES_finder.exe`、
  `ue_aes_finder.exe` 现场从游戏进程里找。
- usmap：`D:\dev\dna-unpack\4.27.2-0+++UE4+Release-4.27-EM.usmap`
  （由 `Dumper-7` / `UnrealMappingsDumper.dll` 生成）。
