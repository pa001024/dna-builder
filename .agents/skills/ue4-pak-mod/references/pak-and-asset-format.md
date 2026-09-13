# pak 与 .uasset 格式要点

做替换类 mod 真正会踩的东西。分三块：**pak 容器**、**挂载点语义**、**.uasset/.uexp 结构**。

---

## 1. pak 容器

UE4 的 `.pak` 结构：文件头 + 一堆文件数据 + 索引 + 尾部 `FPakInfo`（文件末尾，
magic `0x5A6F12E1`）。`repak info` 读的就是尾部这块。

### 版本

`FPakInfo::Version` 是单调递增的枚举，**必须落在游戏引擎支持的范围内**：

| repak 名 | UE 枚举 | 含义 |
| --- | --- | --- |
| `V8A` / `V8B` | 8 | `FNameBasedCompressionMethod`（压缩方法名写进尾部） |
| `V9` | 9 | `FrozenIndex` |
| `V10` | 10 | `PathHashIndex` |
| `V11` | 11 | `Fnv64BugFix` |

**UE4.27 用 `V11`。** repak 默认是 `V8B`，**不显式传 `--version V11` 会打出一个引擎不认的包**。
（V8 及以上的包尾部会记录压缩方法名，所以老版本包也能被新引擎读，但反过来不行。）

猜版本的最快办法：`repak info` 一个已知能用的包（游戏自带的，或本机现成的 mod），
它会报出 `version: V11 / version major: Fnv64BugFix`。repak 甚至会把「试了哪些版本、
为什么失败」打出来，很有用。

### 加密

- **索引加密**（`encrypted index`）由 pak 自己声明。官方 pak 加密了，**mod pak 可以不加密**，
  引擎对每个 pak 独立判断，未加密的 mod pak 照样能挂载（本机现成 mod 就是 `encrypted index: false`）。
- **不需要 AES key 也能做 mod。** 只有要 `repak unpack` 官方加密 pak 时才需要 key。
- 官方 pak 带 `.sig` 签名文件。签名校验不阻止未签名的 mod pak 挂载（本机能用的 mod 就没签名）。

### 压缩

`--compression` 不传就是**不压缩**，最省事、零解压风险，但 pak 会大（本机 Eve→Aida 的
43 MB 载荷不压缩就是 43 MB）。传 `Zlib`（引擎内置，永远可用）能压到约 20 MB。
`Oodle` 需要引擎带 Oodle 且本机有 `oo2core_9_win64.dll`，不确定就别用。

### path hash seed

`FPakInfo::PathHashSeed`，`repak pack -p`，**只收十进制的 u64**。
它只用于 pak 内部索引与查表，**只要包内自洽，取任何值都能正常挂载**；
对齐一个已知能用的值最省心（本机现成 mod 与官方 pak 都是 `0xB233321C` = `2989699612`）。

---

## 2. 挂载点语义 ★最容易搞错的地方

pak 内部路径怎么映射到游戏内路径，由**挂载点**决定。UE 的判定逻辑是**前缀比对**：

```cpp
// FPakFile::NormalizeFilename —— 简化
FString Result = Filename;
FPaths::MakeStandardFilename(Result);      // 绝对路径 → "../../../EM/Content/..."
if (Result.StartsWith(MountPoint))         // 挂载点是前缀就截掉，剩下的就是包内路径
    Result = Result.RightChop(MountPoint.Len());
```

`MakeStandardFilename` 会把绝对路径转成**以 `../../../` 开头**的形式。
所以挂载点必须是**带 `../../../` 前缀的字符串**，且要是该路径的前缀。

于是有两种**完全等价**的写法：

| 写法 | `-m` 挂载点 | 包内放什么 | 备注 |
| --- | --- | --- | --- |
| A（推荐） | `../../../` | `EM/Content/Asset/.../Eve_Body_SM.uasset` | repak 默认，不用算路径，`build-mod.sh` 用这个 |
| B | `../../../EM/Content/Asset/.../Mesh/` | `Eve_Body_SM.uasset` | 本机现成 mod 用的写法；pak 列表更干净 |

两者截出来的结果是同一个路径，**装上去效果一样**。
（B 写法看似「多算了一层目录」，实际上 `../../../` 在标准形式里代表的是
「引擎根」，不是「pak 所在目录」—— 这就是为什么 pak 放在 `Paks/` 还是 `Paks/~mods/`
对挂载点写法没有影响。）

**写错的后果**：不报错、不崩溃，只是这个 pak 里的文件永远匹配不上，表现为
「pak 装进去了但游戏毫无变化」。所以 `verify-mod.sh` 第一件事就是把挂载点打出来核对。

---

## 3. 安装位置与生效顺序

```
<游戏>/<项目名>/Content/Paks/            # UE 递归扫描这里的所有 *.pak
└── ~mods/                               # 约定俗成的 mod 目录
```

- **扩展名必须是 `.pak`。** UE 只找 `*.pak`（`FindFilesRecursive(..., TEXT("*.pak"))`）。
  本机那个 `SP12_ZNF01_P.kap` 就是因此不会被加载。
- **递归扫描**：`~mods` 这种子目录里的 pak 一样会被挂载。
- **`~` 排序靠后**，所以 `~mods` 里的 pak 后挂载、在冲突时优先（UE 查文件时倒序遍历已挂载的 pak）。
  同理，`pakchunk999-*` 比 `pakchunk0-*` 后挂载。两种做法都能让 mod 覆盖官方内容。
- **协议默认不会热加载**：在游戏启动时挂载，装完要重启游戏。

---

## 4. `.uasset` / `.uexp` 结构

一个烘焙包拆成两个文件：

| 文件 | 内容 |
| --- | --- |
| `.uasset` | 包头：`FPackageFileSummary`（版本、`TotalHeaderSize`、`FolderName`、`PackageFlags`…）+ **名字表 NameMap** + 导入表 + 导出表 |
| `.uexp` | 各个导出的序列化数据：**带 tag 的属性** + **类自定义序列化的原始数据** |

网格（`USkeletalMesh`）的**渲染数据（LOD 顶点/索引/蒙皮权重/材质槽）在 `.uexp` 里**，
以类自定义序列化形式存在，**不是带 tag 的属性** —— 所以 UAssetCLI 导出的 JSON 里看不到它们。
`UAssetAPI` 把它们当不透明字节原样保留，往返因此能逐字节还原。

### `SerialOffset` 与 `.uasset` 大小的关系 ★

导出表里每个导出有个 `SerialOffset`，指向「包文件」内的绝对位置。拆分成 `.uexp` 后
UE 是这样定位的：

```
.uexp 内的偏移 = SerialOffset - PackageFileSummary.TotalHeaderSize
```

也就是说 **`SerialOffset` 必须等于 `TotalHeaderSize` + uexp 内偏移**。
对我们的网格包，导出数据就在 `.uexp` 开头，所以 `SerialOffset` 应当**等于 `.uasset` 的文件大小**：

```
Npc_Aida_SM:  .uasset 11343  →  SerialOffset 11343   ✓
改名后:       .uasset 11363  →  SerialOffset 11363   ✓（+20 字节来自新增的名字）
```

**这就是为什么改名字之后一定要重算 `SerialOffset`**：`.uasset` 因为多了个名字串变大，
偏移不同步，UE 读 `.uexp` 就整体错位，表现是莫名其妙的读盘错误或崩溃。
`UAssetAPI.Write()` 会自动处理，自己改二进制时这是头号坑。

### 导出名规则 ★

UE 解析硬引用的流程：

1. 导入表里是一条 `Package: /Game/Asset/Char/Player/Char035_Eve/Mesh/Eve_Body_SM` +
   `ObjectName: Eve_Body_SM` 的记录；
2. 按**包路径加载文件**（即文件名决定包名）；
3. 在加载出来的包里**按 `ObjectName` 在导出表里查对象**。

所以文件放在 `Eve_Body_SM.uasset`、但导出对象叫 `Npc_Aida_SM` 时，第 3 步落空 →
引用解析为 `null` → 网格组件什么都不画 → **角色隐身**。日志里通常没有明确报错。

**结论：目标包的文件名、导出对象名，必须都等于原来的名字。**
`modtool build` 做这件事，`modtool check` 守这条线。

旧名字留在 NameMap 里不用是安全的（烘焙包对冗余名字不敏感），
所以实现上是「名字表追加新名 + 导出指向新名」，而不是去改原名字串。

---

## 5. 怎么确认动手前是安全的

**先做往返测试**，再决定要不要用这个库/工具链改这批资产：

```bash
cd .agents/skills/ue4-pak-mod/scripts/modtool
dotnet run -- roundtrip "D:/.../Npc_Aida_SM.uasset" /tmp/rt.uasset
cmp "D:/.../Npc_Aida_SM.uasset" /tmp/rt.uasset && cmp "D:/.../Npc_Aida_SM.uexp" /tmp/rt.uexp
```

逐字节相同 ⇒ 库里没有丢失/改写的字段，可以放心做「改名」这种小改动。
不一致 ⇒ 别继续，换工具（UAssetGUI）或换库版本，否则会静默损坏模型数据。

**本机这批 DNA 4.27 烘焙资产已验证往返逐字节一致。**

改完之后再验一次「只有身份变了、载荷没动」：把产物和源包都导出 JSON 对比，
应当只有 `ObjectName` 和 NameMap 不同，`Imports` / `Export.Data` / `SerialSize` 完全一致。
`.uexp` 必须与源文件逐字节相同（`modtool check` 就是在比这个）。

---

## 6. UAssetAPI 用法与坑

```csharp
using UAssetAPI;
using UAssetAPI.UnrealTypes;

var asset = new UAsset(path, EngineVersion.VER_UE4_27);   // 4.27 用这个枚举
asset.Exports[0].ObjectName = FName.FromString(asset, "Eve_Body_SM");  // 追加名字并改指向
asset.Write(outPath);   // 自动同时写 .uasset + .uexp，并重算 SerialOffset
```

坑：

- **路径**：`new UAsset("/d/dev/...")` 会被 .NET 当成 `D:\d\dev\...`（git-bash 路径前缀问题）。
  传给 .NET / 原生 exe 的路径一律用 `D:\...` 或 `D:/...`。
- `FName.FromString(INameMap, string)` 是静态方法，需要 asset 作为名字表；直接用
  `asset.Exports[i].ObjectName.Value = ...` 只改字符串、不入名字表，写出时可能抛
  `DummyFNameSerializationException`。
- 多导出包（如骨架包里塞了上百个 `SkeletalMeshSocket`）**不要**盲改 `Exports[0]`。
  `modtool build` 遇到非单导出包会直接报错，这是故意的。
- `EngineVersion` 传错会解析出错误的属性表；4.27 就是 `VER_UE4_27`。

---

## 7. 拿到一个新游戏怎么起步

1. `repak info` 游戏自带的 pak（或在 `~mods`/`Paks` 下找现成 mod）→ 得到
   **版本（V11）、是否加密、压缩方法、path hash seed**。
2. 有 AES key 的话 `repak list` 一个官方 pak → 看**官方 pak 的挂载点**和内部路径形式，
   这直接决定了你的 `-m` 该写什么。
3. 没有 key（本机情况）就靠本机现成 mod 反推，或按第 2 节的规则推导：
   内部路径 = 游戏内容目录相对「引擎根」的路径。
4. 解包 → 找资产 → 按本技能 Workflow 做。
