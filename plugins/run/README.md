# run.program

Desktop-only: launches a local program when a rule fires, via the existing
`launchNormal` / `launchExe` app commands (`apps/web/src/api/app.ts`).
In a browser there is no Tauri runtime, so `execute` returns `{ok:false}`.

- id: `run.program`
- fields:
    - `mode` (`normal` | `exe`, def `normal`): 普通启动 / 管理员启动
    - `path` (text, required, supports `{{label}}` / `{{data.*}}`)
    - `params` (text, def `""`, supports placeholders)

## Config example

```json
{
    "mode": "normal",
    "path": "C:\\Tools\\notifier.exe",
    "params": "--event {{label}}"
}
```
