# Task Completion Checklist
- Run `pnpm lint` and ensure it passes.
- Run `pnpm test` (or targeted Vitest file when appropriate).
- Keep consistency with sibling files and existing architecture.
- Avoid adding dependencies unless necessary; prefer native APIs.
- Respect AGENTS rules: do not run `pnpm dev`/`pnpm build` unless explicitly requested.
- Review git diff for unintended changes before finalizing.
- Note: pre-commit hook runs formatting and `git add .`, so verify staging carefully.