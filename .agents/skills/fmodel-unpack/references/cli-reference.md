# fmodel-cli — detailed reference

All subcommands print a **single JSON object** to stdout and exit `0` on success, `2` on a
usage error (missing arg / unknown subcommand), or `1` on an exception. The MCP server
(`server.py`) captures stdout, parses the JSON, and returns it as the tool result.

Invocation:
```pwsh
# self-contained exe (preferred)
D:\dev\fmodel-mcp\Cli\bin\publish\fmodel-cli.exe <subcommand> [args...]

# framework-dependent dll
dotnet exec D:\dev\fmodel-mcp\Cli\bin\publish\fmodel-cli.dll <subcommand> [args...]
```
The process runs with its working directory set to the exe's folder so the Oodle DLL
(dropped next to the exe) is found. `InitProvider()` (and thus Oodle download, AES submit,
mappings load) runs for every subcommand **except `list`**.

## `status`
No args.
```json
{ "ok": true, "paksDir": "...", "outputDir": "...", "ueVersion": "GAME_UE4_27",
  "mappings": "....usmap", "mappingsLoaded": true, "files": 123456 }
```
`files` = `provider.Files.Count` (indexed package entries).

## `search <pattern> [limit=200]`
Glob over `provider.Files.Keys`. Translates to a regex: `**`→`.*`, `*`→`[^/]*`, `?`→`[^/]`.
```json
{ "ok": true, "pattern": "**/MI_*", "count": 42, "truncated": false,
  "matches": ["EM/Content/.../MI_Foo", "..."] }
```
`truncated` is `true` when `count == limit`.

## `read <path>`
Loads the package and serializes **all** UObjects (Newtonsoft, compact). Returns
`{ ok, path, objects:[...] }` — the same shape FModel's "Save Properties (.json)" produces.

## `inspect <path>`
Material-focused summary. For each export object:
```json
{ "ok": true, "path": "...", "objects": [
  { "name": "...", "type": "UMaterialInstanceConstant", "exportType": "MaterialInstanceConstant",
    "parent": "EM/Content/.../M_Parent", "blendMode": "BLEND_Opaque", "twoSided": false,
    "opacityMaskClipValue": 0.333,
    "textures": [ { "name": "BaseColor", "objectName": "T_Albedo", "objectPath": "EM/Content/.../T_Albedo" } ],
    "scalars":   [ { "name": "Roughness", "value": 0.5 } ],
    "vectors":   [ { "name": "Tint", "r": 1.0, "g": 0.0, "b": 0.0, "a": 1.0 } ] }
] }
```

## `export-tex <path>`
`UTexture2D.Decode()` → SkiaSharp bitmap → PNG.
```json
{ "ok": true, "path": "...", "outputPath": "D:/.../Output/Exports/EM/Content/.../T_Albedo.png",
  "width": 2048, "height": 2048, "format": "png" }
```

## `export-mesh <path>`
First export whose type contains `SkeletalMesh` or `StaticMesh` → ActorX `.psk`/`.pskx`.
```json
{ "ok": true, "path": "...", "outputPath": "D:/.../Output/Exports/EM/Content/.../SK_Foo.psk",
  "label": "PSK" }
```

## `export-mesh-uf <path>`
Same mesh selection, but exported as **UEFormat `.uemodel`**. Pair with `export-anim` for a
consistent bind pose in Blender. `label` reflects the UEFormat writer output.

## `export-anim <path>`
First export whose type contains `AnimSequence` or `AnimMontage` → UEFormat `.ueanim`
(carries translation + rotation + **scale** per bone). `label` reflects the UEFormat writer.

## `export-raw <path>`
Full indented Newtonsoft JSON of all exports written to
`OutputDir/<mirrored-package-path>.json`.
```json
{ "ok": true, "path": "...", "outputPath": "D:/.../Output/Exports/EM/Content/.../Foo.json",
  "bytes": 123456 }
```

## `list [prefix]`
Does **not** init the provider. Lists files already on disk under `OutputDir` (prefix optional,
matches a path fragment; caps at 500 entries).
```json
{ "ok": true, "root": "D:/.../Output/Exports", "prefix": "EM/Content/Characters",
  "count": 17, "files": ["EM/Content/Characters/Foo.png", "..."] }
```

## Path normalization rules (`NormalizePath`)
1. `\` → `/`.
2. Strip a trailing `.N` index (FModel ObjectPath form, e.g. `Asset.0`).
3. Strip trailing `.uasset` / `.umap` / `.uexp` / `.ubulk`.
4. If the path starts with `/Game/`, rewrite to `<MountPoint>/Content/<rest>`.
   (`MountPoint` from config; defaults to `Sandfall` if unset — so Duet Night Abyss **must**
   set `MountPoint: "EM"`.)

## Output path resolution (`ResolveOutputPath`)
`OutputDir` + packagePath (slashes → OS separators), with the extension changed to the
export's extension (`.png`, `.psk`, `.uemodel`, `.ueanim`, `.json`). The package directory
structure is therefore reproduced under `OutputDir`.

## `UeVersion` parsing (`ParseGame`)
Explicitly handled: `GAME_UE5_4/5_3/5_2/5_1/5_0`, `GAME_UE4_27`. Anything else falls through
to `Enum.TryParse<EGame>` (so other `GAME_*` enum names work too) or throws
`unknown UE version: <s>`.
