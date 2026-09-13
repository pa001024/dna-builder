// modtool — UE4.27 烘焙资产（.uasset/.uexp）改名与构建工具
//
// 为什么需要它：把一个包的模型替换到另一个包路径下时，光把文件改名复制过去是不够的。
// UE 解析 `Eve_Body_SM.Eve_Body_SM` 这种引用是「按文件路径加载包 → 再按名字在导出表里找对象」，
// 若包里导出的对象名仍是被替换者的原名（如 Npc_Aida_SM），查找失败 → 拿到空网格 → 角色身体消失。
// 所以必须把导出对象名改成目标名。本工具就是做这件事，并顺带做完整性校验。
//
// 用法：
//   modtool roundtrip <in.uasset> <out.uasset>   读改写一遍，用于验证往返是否会破坏资产
//   modtool info <uasset>                        打印包内导出名 / 名字表大小
//   modtool build <mapping.tsv> <pakRoot>        按映射表批量构建
//   modtool check <mapping.tsv> <pakRoot>        校验构建结果（导出名 + 载荷字节一致）
//
// 映射表 mapping.tsv（制表符分隔，# 开头为注释）：
//   列1 = 源 uasset 绝对路径
//   列2 = 目标「游戏内相对路径」，不含扩展名，正斜杠，如
//         EM/Content/Asset/Char/Player/Char035_Eve/Mesh/Eve_Body_SM
//   列3 = 新导出名（必须等于列2 的文件名，否则 UE 找不到该对象）
//
// 产物写到 <pakRoot>/<列2>.uasset（含同名 .uexp），pakRoot 就是后面交给 repak 的目录。

using System.Security.Cryptography;
using UAssetAPI;
using UAssetAPI.UnrealTypes;

if (args.Length < 2)
{
    Console.Error.WriteLine("usage: modtool <roundtrip|info|build|check> ...");
    return 1;
}

var cmd = args[0];

switch (cmd)
{
    // 读一遍再写一遍。对已烘焙资产应当逐字节还原，用它来判断某个游戏的资产能不能安全改写。
    case "roundtrip":
    {
        var asset = new UAsset(args[1], EngineVersion.VER_UE4_27);
        // UAssetAPI 的 Write 不会创建目录，传一个不存在的目录会直接 FileNotFound
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(args[2]))!);
        asset.Write(args[2]);
        Console.WriteLine($"written {args[2]} (exports={asset.Exports.Count})");
        return 0;
    }

    // 看一眼包里有什么。UE 的 .uexp 里是渲染数据（顶点/索引/蒙皮/材质槽），
    // 属性 JSON 里看不到，所以判断一个包对不对主要看导出名。
    case "info":
    {
        var asset = new UAsset(args[1], EngineVersion.VER_UE4_27);
        Console.WriteLine($"folder={asset.FolderName} names={asset.GetNameMapIndexList().Count} exports={asset.Exports.Count}");
        foreach (var e in asset.Exports)
            Console.WriteLine($"  EXPORT {e.ObjectName} (class index {e.ClassIndex})");
        return 0;
    }

    case "build":
    {
        if (args.Length < 3) { Console.Error.WriteLine("usage: modtool build <mapping.tsv> <pakRoot>"); return 1; }
        var lines = ReadMapping(args[1]);
        var pakRoot = args[2];

        foreach (var (src, destRel, newName) in lines)
        {
            var asset = new UAsset(src, EngineVersion.VER_UE4_27);
            if (asset.Exports.Count != 1)
                throw new Exception($"{src}: 期望恰好 1 个导出，实际 {asset.Exports.Count}；多导出包需要先确认改哪个");

            // 名字表里补一个新名字，再把导出指向它。
            // 旧名字留在名字表里不用，无副作用（烘焙包对冗余名字不敏感）。
            asset.Exports[0].ObjectName = FName.FromString(asset, newName);

            var destFile = Path.Combine(pakRoot, destRel.Replace('/', Path.DirectorySeparatorChar) + ".uasset");
            Directory.CreateDirectory(Path.GetDirectoryName(destFile)!);
            // UAssetAPI 会顺带写出同名 .uexp，并自动把导出的 SerialOffset 调整到新的
            // .uasset 头长度上（这一步错了 UE 就会读不到 .uexp）
            asset.Write(destFile);
            Console.WriteLine($"OK  {Path.GetFileName(src)} -> {destRel}  (export={newName})");
        }
        Console.WriteLine($"done: {lines.Count} 个包 -> {pakRoot}");
        return 0;
    }

    // 校验：导出名是否已改成目标名；.uexp（几何/蒙皮/材质槽）是否与源文件逐字节一致。
    // 后者是关键 —— 它证明我们只改了「包的身份」，没有动模型数据本身。
    case "check":
    {
        if (args.Length < 3) { Console.Error.WriteLine("usage: modtool check <mapping.tsv> <pakRoot>"); return 1; }
        var lines = ReadMapping(args[1]);
        var pakRoot = args[2];
        var failures = 0;

        foreach (var (src, destRel, newName) in lines)
        {
            var destFile = Path.Combine(pakRoot, destRel.Replace('/', Path.DirectorySeparatorChar) + ".uasset");
            if (!File.Exists(destFile)) { Console.WriteLine($"FAIL  缺文件 {destFile}"); failures++; continue; }

            var asset = new UAsset(destFile, EngineVersion.VER_UE4_27);
            var actualName = asset.Exports.Count == 1 ? asset.Exports[0].ObjectName.ToString() : "<多导出>";
            var nameOk = actualName == newName;

            var srcUexp = Path.ChangeExtension(src, ".uexp");
            var dstUexp = Path.ChangeExtension(destFile, ".uexp");
            var payloadOk = File.Exists(srcUexp) && File.Exists(dstUexp) && Sha256(srcUexp) == Sha256(dstUexp);
            // 包名必须等于文件名，否则 UE 按路径加载后按名查对象会落空
            var stemOk = Path.GetFileNameWithoutExtension(destFile) == newName;

            if (nameOk && payloadOk && stemOk)
                Console.WriteLine($"PASS  {destRel}  export={newName}  uexp==源文件");
            else
            {
                Console.WriteLine($"FAIL  {destRel}  export={actualName}(期望 {newName})  载荷{(payloadOk ? "一致" : "不一致")}  文件名匹配={stemOk}");
                failures++;
            }
        }
        Console.WriteLine(failures == 0 ? $"all {lines.Count} OK" : $"{failures}/{lines.Count} 失败");
        return failures == 0 ? 0 : 2;
    }
}

Console.Error.WriteLine("unknown cmd " + cmd);
return 1;

// 解析映射表，跳过空行与 # 注释行
static List<(string Src, string DestRel, string NewName)> ReadMapping(string path)
{
    var result = new List<(string, string, string)>();
    foreach (var raw in File.ReadAllLines(path))
    {
        var line = raw.Trim();
        if (line.Length == 0 || line.StartsWith('#')) continue;
        var parts = line.Split('\t');
        if (parts.Length != 3)
            throw new Exception($"映射表格式错误（需要 3 个制表符分隔的列）: {line}");
        result.Add((parts[0].Trim(), parts[1].Trim().TrimEnd('/'), parts[2].Trim()));
    }
    return result;
}

// 大文件用流式 SHA256，避免一次性读进内存
static string Sha256(string file)
{
    using var stream = File.OpenRead(file);
    return Convert.ToHexString(SHA256.HashData(stream));
}
