---
name: fmodel-unpack
description: This skill documents how to use the fmodel-mcp toolkit (a CUE4Parse-based .NET CLI plus a thin Python MCP server) to inspect and export Unreal Engine game assets — pak files, textures, meshes, animations, materials, and raw package JSON. Use it when unpacking/extracting assets from a UE game (e.g. Duet Night Abyss / "Duet: Night Abyss"), writing or troubleshooting config.json for a new title, or driving the fmodel-cli subcommands / fmodel_* MCP tools.
---

# fmodel-unpack

## Overview

`fmodel-mcp` is a minimal, headless alternative to the FModel GUI for ripping assets out of
Unreal Engine games. It is **not a fork of FModel** — it wraps the underlying CUE4Parse library
directly so an assistant (or a script) can search, read, and export UE assets without clicking
through the FModel window.

It is split into two layers on purpose:

- **`Cli/`** — the only component that links to CUE4Parse. A single self-contained
  `fmodel-cli.exe` exposing subcommands (`status`, `search`, `read`, `inspect`,
  `export-tex`, `export-mesh`, `export-mesh-uf`, `export-anim`, `export-raw`, `list`)
  that all print one JSON object to stdout. Usable standalone for ad-hoc scripts.
- **`Server/`** — a thin FastMCP (Python, stdio) server that invokes the CLI as a subprocess
  and exposes each subcommand as an MCP tool (`fmodel_*`).

All asset knowledge lives in CUE4Parse; this toolkit only marshals arguments and parses JSON.
That means the CLI can be evolved independently of any LLM integration.

The repo checkout used here is `..\fmodel-mcp`. The CLI is **already built** at
`..\fmodel-mcp\Cli\bin\publish\fmodel-cli.exe`.

## When to use this skill

Trigger this skill when any of the following appear:

- "Extract / unpack / rip assets from <UE game>" (e.g. Duet Night Abyss, Expedition 33).
- "Set up config.json for a game so I can read its paks."
- "Export this texture / mesh / animation / material from the game files."
- Driving the `fmodel_*` MCP tools, or invoking `fmodel-cli.exe` directly.
- Troubleshooting "paks dir not found", mount-point mismatches, Oodle download, AES, or
  `.usmap` mapping errors.

## Prerequisites

- **.NET runtime** — not needed for the self-contained `fmodel-cli.exe` (runtime is embedded).
  Only needed if running the framework-dependent `.dll` via `dotnet exec`.
- **Internet on first run** — `fmodel-cli` downloads the Oodle decompression DLL
  (`oo2core_9_win64.dll` on Windows) on demand from the OodleUE GitHub release. The DLL is
  **not** redistributable and is gitignored. After the first successful run it sits next to the
  exe and is reused.
- **For the MCP server**: Python ≥ 3.11 and `uv` (`uv sync` in `Server/`).
- **The game's paks** present on disk (`.pak` / `.utoc` / `.ucas`).

> Note on versions: `Cli/FModelCli.csproj` targets `net10.0`. The README still mentions
> `net9.0` in places (and `Server/src/server.py` defaults its fallback DLL path to
> `Debug/net9.0/...`). This mismatch is harmless — the server prefers the published
> `bin/publish/fmodel-cli.exe` first. Always prefer the published exe; only fall back to a
> Debug `.dll` build if you deliberately made one.

## Step 1 — Configure for the game (the central step)

Copy `config.json.example` to `config.json` **next to the CLI binary**
(`Cli/bin/publish/config.json`) or point the `FMODEL_MCP_CONFIG` env var at an absolute path.
Config lookup order inside the CLI: `FMODEL_MCP_CONFIG` → `<baseDir>/config.json` →
`<repoRoot>/config.json` → a fake `<EDIT-ME>` placeholder (which surfaces a "paks dir not found"
error if nothing is set).

Config keys:

| Key            | Meaning                                                                                                                                                    | Nullable |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `PaksDir`      | Directory holding the game's `*.pak` / `*.utoc` / `*.ucas`                                                                                                 | No       |
| `OutputDir`    | Where exports land (mirrors FModel's `Output/Exports/` role)                                                                                               | No       |
| `UeVersion`    | CUE4Parse enum, e.g. `GAME_UE4_27`, `GAME_UE5_4`                                                                                                           | No       |
| `MappingsFile` | Path to a `.usmap` file (often required for correct property names)                                                                                        | Yes      |
| `AesKey`       | Encryption key as hex string (omit for unencrypted games)                                                                                                  | Yes      |
| `MountPoint`   | Content mount, e.g. `EM` for Duet Night Abyss, `Sandfall` for E33. Used to rewrite `/Game/X` → `<MountPoint>/Content/X`. Defaults to `Sandfall` if absent. | Yes      |

Detailed, copy-paste configs (Duet Night Abyss, Expedition 33) and **where each value comes
from** (FModel AppSettings.json) are in `references/game-configs.md`.

## Step 2 — Verify the provider

Run `status` first. If it errors, almost everything else will too.

```pwsh
# via the MCP tool
fmodel_status()

# or directly
..\fmodel-mcp\Cli\bin\publish\fmodel-cli.exe status
```

Expected shape:

```json
{
    "ok": true,
    "paksDir": "...",
    "outputDir": "...",
    "ueVersion": "GAME_UE4_27",
    "mappings": "....usmap",
    "mappingsLoaded": true,
    "files": 123456
}
```

`files` is the number of indexed package entries — a non-zero count means paks mounted and
Oodle + AES + mappings all applied.

## Step 3 — Locate the asset (search)

`search` takes a **glob over package paths** (the same keys CUE4Parse indexes). Rules:
`**` matches any number of path components, `*` matches a single component, `?` matches one
character. Case-insensitive.

```pwsh
fmodel-cli.exe search "**/MI_*"            # material instances
fmodel-cli.exe search "**/MI_Curator*"     # exact-ish
fmodel-cli.exe search "EM/Content/Characters/**/*" 1000
```

Returns `{ ok, pattern, count, truncated, matches:[...] }`. `truncated` is true when the
optional `limit` (default 200) was hit.

## Step 4 — Inspect before exporting (read / inspect)

- `read <path>` → full FModel-style JSON of every UObject in the package. Verbose; good for
  blueprints / mesh metadata.
- `inspect <path>` → a compressed material view: `parent`, `blendMode`, `twoSided`,
  `opacityMaskClipValue`, plus `textures` / `scalars` / `vectors` parameter lists. Use this to
  discover which texture assets a material wires up before exporting them.

## Step 5 — Export

| Subcommand              | Produces                   | Notes                                    |
| ----------------------- | -------------------------- | ---------------------------------------- |
| `export-tex <path>`     | `OutputDir/.../<name>.png` | `UTexture2D` decoded via SkiaSharp       |
| `export-mesh <path>`    | `...psk` / `...pskx`       | Skeletal/StaticMesh as ActorX            |
| `export-mesh-uf <path>` | `....uemodel`              | UEFormat mesh                            |
| `export-anim <path>`    | `....ueanim`               | UEFormat anim (keeps per-bone **scale**) |
| `export-raw <path>`     | `....json`                 | Full indented JSON dump to disk          |

Export paths **mirror the package path** under `OutputDir` (slashes become separators). For
Blender rigging, pair `export-mesh-uf` (`.uemodel`) with `export-anim` (`.ueanim`) — both are
UEFormat and share a consistent bind pose when imported via the UEFormat Blender addon. The
plain `export-mesh` (PSK) + `export-anim` (UEFormat) combo can drift on bone-scale animations
(e.g. the giant Paintress in E33).

Verify with `list [prefix]` (does not need the provider):

```pwsh
fmodel-cli.exe list "EM/Content/Characters"
```

Full subcommand signatures, return JSON shapes, and the path-normalization rules are in
`references/cli-reference.md`. A convenience wrapper (`scripts/fmodel.py`) locates the published
exe and runs any subcommand from a plain shell.

## Step 6 — (Optional) Expose as MCP tools

```pwsh
cd ..\fmodel-mcp\Server
uv sync
```

Then register the server in your MCP client config (WorkBuddy `~/.workbuddy/mcp.json` or
Claude Code `~/.claude.json`):

```json
{
    "mcpServers": {
        "fmodel": {
            "command": "uv",
            "args": ["run", "--project", "D:\\dev\\fmodel-mcp\\Server", "python", "src/server.py"]
        }
    }
}
```

Override the CLI binary with `FMODEL_CLI_BIN=/abs/path/fmodel-cli.exe` if needed. Tool names map
1:1: `fmodel_status`, `fmodel_search`, `fmodel_read`, `fmodel_inspect_material`,
`fmodel_export_texture`, `fmodel_export_mesh`, `fmodel_export_mesh_uf`, `fmodel_export_anim`,
`fmodel_export_raw`, `fmodel_list_exports`.

## Path normalization (critical gotcha)

`NormalizePath` accepts several input forms and always returns a mount-relative package path
**without extension and without the FModel `.0` index**:

- `EM/Content/Characters/Foo` ✔
- `EM/Content/Characters/Foo.uasset` ✔ (extension stripped)
- `EM/Content/Characters/Foo.0` ✔ (trailing index stripped)
- `/Game/Characters/Foo` → rewrites to `<MountPoint>/Content/Characters/Foo` ✔

So a `/Game/...` path **only resolves correctly if `MountPoint` is set** in config. For Duet
Night Abyss, `MountPoint` **must** be `"EM"` — without it, `/Game/...` paths wrongly resolve to
`Sandfall/Content/...` and `read`/`export` will fail to find the package.

## Troubleshooting

- **"paks dir not found" / 0 files** → `PaksDir` wrong, or no `config.json` resolved (set
  `FMODEL_MCP_CONFIG`). Check `status` output.
- **Oodle error on first run** → no internet to fetch `oo2core_9_win64.dll`. Manually drop the
  matching Oodle DLL next to `fmodel-cli.exe` (from OodleUE).
- **Empty / wrong property names** → game needs `MappingsFile` (`.usmap`). Point `MappingsFile`
  at the correct version-specific usmap; confirm `mappingsLoaded: true` in `status`.
- **Decryption failures** → encrypted paks need `AesKey` (hex). Duet Night Abyss ships one;
  leave `AesKey: null` only for unencrypted titles.
- **`read`/`export` "package not found"** → path used the `/Game/` form but `MountPoint` is
  wrong/unset, or the path still has an extension/`.0` index. Use the mount-relative form or fix
  `MountPoint`.
