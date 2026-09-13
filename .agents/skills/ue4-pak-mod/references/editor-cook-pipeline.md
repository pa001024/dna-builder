# 编辑器烘焙路线（自由编辑模型）

用 UE4.27 编辑器把「Blender 改完的网格」烘成游戏能加载的包。这是**能自由编辑模型**的路线：
任意拓扑、加删顶点、重做 UV、重算蒙皮权重都由编辑器和 Blender 保证正确。

## 为什么必须开编辑器

把改完的网格变回**烘焙态**的包，没有编辑器免开的开源实现：

- FModel / CUE4Parse / umodel 全是**只读**的，只做「已烘焙包 → glTF/PSK」。
- UEFormat 的 Blender 插件只有 `import_*` operator（清单自己写着 "Importer for UEFormat Files"），
  反方向要它的 UE 插件，也就是还是得开编辑器。
- 剩下唯一的免编辑器选择是自己写二进制 codec（见 SKILL.md 里的对比），代价大一个数量级。

另外 **UE4.27 的 glTF 导入器不支持蒙皮网格**，日志会报
`Mesh has joint weights which are not supported`，只产出 StaticMesh。所以中间格式一律用 **FBX**。

## 一键构建

```bash
.agents/skills/ue4-pak-mod/scripts/editor/build-mod-editor.sh \
    <输入.glb> \
    <游戏内相对路径(不含扩展名)> \
    <输出.pak>

# 例：
.agents/skills/ue4-pak-mod/scripts/editor/build-mod-editor.sh \
    Eve_Part01_SM.glb \
    EM/Content/Asset/Char/Player/Char035_Eve/Mesh/Eve_Part01_SM \
    EveRoundtripTest_P.pak
```

工程不存在时会自动调用 `setup-project.sh` 创建。四个阶段：

1. **Blender**（`blender_glb_to_fbx.py`）：glb → FBX，按 UE 约定设轴/骨骼，自动判单位（米→厘米 ×100），
   并删掉没有蒙皮权重的垃圾网格（FModel 导出的 glb 里会夹带一个 `Icosphere`，不删会被 UE 合并进骨架网格）。
2. **UE 导入**（`import_mesh.py`）：FBX → SkeletalMesh，并把自动生成的骨架、材质**改名/建档到游戏的真实路径**上。
3. **cook**：`-CookAll -Unversioned -SKIPEDITORCONTENT -NoGameAlwaysCook`。
4. **打包**：只挑网格包（`<DEST>.uasset/.uexp`）丢进 repak，挂载点 `../../../`。

## 工程名必须是 EM ★

UE 烘焙时按**工程名**生成输出目录。工程叫 `EM`，产物才落在
`Saved/Cooked/WindowsNoEditor/EM/Content/Asset/...` —— 正好等于游戏 pak 的内部路径
（`EM/Content/...`），也正好和 `../../../` 挂载点规则对上。改成别的名字，pak 里路径全错。

## `-Unversioned` 是关键 ★

游戏自己的资产是**不带版本号**烘焙的（`IsUnversioned: true`）。cook 命令必须带
`-Unversioned`（CookCommandlet 的开关，源码注释：*"Save all cooked packages without versions.
These are then assumed to be current version on load."*），否则烘出来是带版本号的形态，和游戏不一致。
对照验证烘焙产物：

| 项 | 我们的产物 | 游戏资产 |
| --- | --- | --- |
| `IsUnversioned` | `true` | `true` |
| `FileVersionLicenseeUE` | `0` | `0` |
| `PackageFlags` | `PKG_FilterEditorOnly` | `PKG_FilterEditorOnly` |
| 导出名 | 等于文件名 | 等于文件名 |
| 骨架引用 | `/Game/Asset/Char/Player/Skeleton/Biped_Skeleton` | 同 |
| 材质引用类 | `MaterialInstanceConstant` | `MaterialInstanceConstant` |

## 骨架与材质的「占位」机制 ★

烘焙包的引用是**按路径**解析的，所以网格必须引用游戏里真实存在的骨架和材质：

- **骨架**：glb/FBX 导入时 UE 会自己造一个 `<MeshName>_Skeleton`，把它**改名**到
  `/Game/Asset/Char/Player/Skeleton/Biped_Skeleton`。改名会被 UE 自动修引用，网格就指过去了。
  这个骨架占位**不能进 pak**（游戏自己有一份）。
- **材质**：在游戏的 MI 路径（`<角色目录>/Materials/<MI名>`）上建**占位材质**。
  占位材质也不进 pak，它只是让烘焙产物的引用路径与类型正确，运行时自然命中游戏自己的 MI。

## 踩过的坑（都是实测踩出来的，按重要性排）

1. **git-bash 的 MSYS 路径转换会把 `/Game/...` 改写成 `C:/Program Files/Git/Game/...`**，
   UE 收到后判定为非法包名，报 `DoesPackageExist FAILED: ... is not a standard unreal filename`。
   症状看起来完全像 UE 的问题，其实不是。**必须 `export MSYS_NO_PATHCONV=1`**。
2. **UE4.27 没有 `-ExecutePythonScript`**（那是 UE5 的参数）。无头跑的可靠入口是
   `UE4Editor-Cmd.exe <proj> -run=PythonScript -Script=<文件>`（commandlet），能跑完并干净退出。
   （`StartupScripts` 设置项在 `-nullrhi` 下不触发，别指望它。）
3. **`unreal.EditorAssetLibrary` 来自 `EditorScriptingUtilities` 插件**，不在 `.uproject` 里启用就是
   `AttributeError: module 'unreal' has no attribute 'EditorAssetLibrary'`。
   引擎自带的 Python API stub（`<proj>/Intermediate/PythonStub/unreal.py`）是查 API 是否有、名字叫什么的权威依据。
4. **`AssetImportTask` / `FbxImportUI` 会被 GC 回收**，导致 `ImportAssetTasks` 在
   `SharedPointer.h` 的 `IsValid()` 断言上崩掉。用模块级变量保住引用。
5. **`import_as_skeletal` 单独设不够**，还要设 `mesh_type_to_import = FBXIT_SKELETAL_MESH`。
   （日志里那行 `FactoryCreateFile: StaticMesh with FbxFactory` 是 UE 的日志串写错了，
   要看最终产物的类，别看这行。）
6. **材质槽赋值不落盘**：`material_interface` 虽然标着 Read-Write，但就地改结构体副本、
   或只 set 单个字段，烘出来的包里都只剩槽名、没有引用（imports 里查不到 MI）。
   **必须新建 `unreal.SkeletalMaterial()` 结构体、把字段设好、整体赋回 `mesh.materials`。**
7. **占位材质的类必须是 `MaterialInstanceConstant`**，不能图省事用 `UMaterial`：
   烘焙包把引用按「导入类」写进 import 表，UE 运行时解析导入会拿类做过滤，类对不上 → 空材质 → 模型变默认灰。
8. **重复烘焙会累积材质槽**：只靠 `replace_existing` 替换，槽数会一直涨（实测 1 → 2）。
   导入前先把目标网格资产删掉，从零导入，才能保证槽数与 FBX 一致。

## 限制与未验证项

- **只烘 LOD0**（`import_mesh_lo_ds=False`）。游戏原网格有 4 级 LOD，产物只有 1 级，远处不会自动降面。
  要保留多级 LOD，得让 FBX 里带 LOD 组并打开该开关。
- **实机验证是唯一无法离线证明的环节。** 本路线已完成的离线验证：
  UAssetCLI 核对烘焙包的版本/标记/导出名/引用路径/引用类全部与游戏资产一致；
  repak 解包后与烘焙产物逐字节一致；不同工程目录烘出的网格载荷一致（可复现）。
  **但「游戏能不能加载这个包」必须进游戏看。**
  推荐先用**自检包**验证管线：把游戏原本的网格（如 `Eve_Part01_SM.glb`）原样走一遍，
  装上去角色外观应当**毫无变化**；若隐身或变灰，说明引用/版本仍有问题。
- 装 pak 时注意**别和已有的同目标 mod pak 冲突**（两个包都改同一资产时，
  谁生效取决于挂载顺序，`~mods` 里按名字排序）。
