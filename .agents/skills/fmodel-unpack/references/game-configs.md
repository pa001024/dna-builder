# Game configs for fmodel-mcp

Each game needs its own `config.json`. The values come from **FModel's AppSettings.json** for
that title (the same file FModel reads to mount the game). Open FModel, mount the game once, then
read `AppSettings.json` (per-game, under FModel's config dir) — `Directory`, `UEVersion`,
`AESKey`, `Mappings`/`Usmap`, and the content **mount** are all there.

## Where each key comes from

| Config key | FModel AppSettings source |
|---|---|
| `PaksDir` | `Directory` → the game's `.../Content/Paks` folder |
| `UeVersion` | `UEVersion` enum (translate to `GAME_UE4_27` / `GAME_UE5_4` form) |
| `AesKey` | `AESKey` (hex). `null` if the game is unencrypted |
| `MappingsFile` | `Usmap` / `Mappings` path to the `.usmap`. `null` if none |
| `MountPoint` | the content mount shown at the root of FModel's tree (e.g. `EM`, `Sandfall`) |
| `OutputDir` | your choice — a scratch export folder |

> `MountPoint` is **not** in `config.json.example` (which targets Expedition 33 and relies on the
> `Sandfall` default). Duet Night Abyss needs `MountPoint: "EM"` explicitly, or `/Game/...`
> paths resolve to the wrong mount.

## Duet Night Abyss ("Duet: Night Abyss", DNA)

UE 4.27, **encrypted** (AES required), uses a `.usmap`, mount = `EM`. The live config already
ships at `D:\dev\fmodel-mcp\config.json`:

```json
{
  "_comment": "Duet Night Abyss (EM) - UE 4.27.",
  "PaksDir": "E:\\game\\Duet Night Abyss\\DNA Game\\EM\\Content\\Paks",
  "OutputDir": "D:\\dev\\dna-unpack\\Fmodel\\Output\\Exports",
  "UeVersion": "GAME_UE4_27",
  "MappingsFile": "D:\\dev\\dna-unpack\\4.27.2-0+++UE4+Release-4.27-EM\\Mappings\\4.27.2-0+++UE4+Release-4.27-EM.usmap",
  "AesKey": "0x5B82ACB93E4F7133BE70A989539A8529EB487F59D7F0356D4C40438206158AB2",
  "MountPoint": "EM"
}
```

Notes:
- `AesKey` is real and required — omitting it yields decryption failures on the paks.
- `MappingsFile` is version-specific (4.27.2-EM). If you update the game, get a fresh `.usmap`
  and repoint this path; confirm `mappingsLoaded: true` in `status`.
- `PaksDir` must contain the actual `*.pak`/`*.utoc`/`*.ucas` files for the installed build.

## Expedition 33 (reference / unencrypted example)

Used in `config.json.example`. UE 5.4, **no AES**, mount = `Sandfall` (so `MountPoint` can be
omitted):

```json
{
  "PaksDir": "D:\\SteamLibrary\\steamapps\\common\\Expedition 33\\Sandfall\\Content\\Paks",
  "OutputDir": "D:\\vivify_repo\\Output\\Exports",
  "UeVersion": "GAME_UE5_4",
  "MappingsFile": "D:\\vivify_repo\\fmodel-mcp\\mappings\\Expedition33Mappings-1.5.4.usmap",
  "AesKey": null
}
```

## Adding a new game — checklist

1. Install/locate the game's paks folder → `PaksDir`.
2. Open FModel, mount the game; note `UEVersion`, `AESKey`, `Usmap`, and the **mount** name.
3. Copy `config.json.example` → `config.json` next to `fmodel-cli.exe` (or set
   `FMODEL_MCP_CONFIG`).
4. Fill every key; set `MountPoint` to the game's mount (don't rely on the `Sandfall` default
   unless that *is* the mount).
5. Run `status`. Expect `files > 0` and (if applicable) `mappingsLoaded: true`.
6. `search` a known asset to confirm the mount/path form resolves.
