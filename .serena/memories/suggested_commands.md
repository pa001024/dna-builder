# Suggested Commands (Windows)
## Frontend
- `pnpm lint`
- `pnpm test`
- `pnpm test src/data/tests/foo.test.ts`
- `pnpm coverage`
- `pnpm format`
## Desktop (Tauri)
- `pnpm tauri dev`
- `pnpm tauri build`
## Server (Bun + Elysia)
- `cd server && bun run dev`
- `bun run gen`
- `bun run migrate`
## Rust MCP server
- `cd mcp_server && cargo build --release`
## Utility commands
- List files: `Get-ChildItem`
- Recursive search text: `rg "pattern"`
- Recursive file list: `rg --files`
- Git status/log: `git status`, `git log --oneline -n 20`
- Change dir: `Set-Location <path>`