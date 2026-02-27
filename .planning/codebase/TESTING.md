# TESTING

## Scope
- This map is based on test and tool evidence from `vitest.config.ts`, `package.json`, `src/data/tests/*.test.ts`, `src/utils/*.test.ts`, `server/package.json`, `server/src/**/*.test.ts`, and `AGENTS.md`.

## Frameworks in use
- Frontend/data-layer tests use Vitest (`import { describe, expect, it } from "vitest"`) in `src/data/tests/CharBuild.test.ts`, `src/data/tests/evaluateAST.test.ts`, and `src/utils/pinyin-utils.test.ts`.
- Server tests use Bun's test runner (`import ... from "bun:test"`) in `server/src/api/dna-auth.test.ts`, `server/src/db/mod/guide.test.ts`, and `server/src/util/html.test.ts`.
- Frontend Vitest config is minimal and centralized in `vitest.config.ts`.

## Test command surface
- Frontend default test command is `vitest run` via `package.json` (`scripts.test`).
- Frontend coverage command is `vitest run --coverage` via `package.json` (`scripts.coverage`).
- Frontend lint/type gate is `biome lint --fix && vue-tsc --noEmit` via `package.json` (`scripts.lint`).
- Server test command is `bun test` via `server/package.json` (`scripts.test`).

## Frontend test organization
- Data-focused tests are centralized in `src/data/tests` (`CharBuild.test.ts`, `leveled.test.ts`, `LevelUpCalculator.test.ts`).
- Utility tests are colocated with utils in `src/utils` (`pinyin-utils.test.ts`, `reward-utils.test.ts`).
- Naming convention is `*.test.ts` consistently across frontend and server (`src/data/tests/*.test.ts`, `server/src/**/*.test.ts`).
- No `*.spec.ts` files were found in `src` (pattern scan of `src` returned none).

## Vitest configuration behavior
- Current Vitest config defines `test.exclude` for `server/**/*.ts`, `externals/**/*.ts`, and `**/node_modules/**` in `vitest.config.ts`.
- No explicit `coverage.thresholds` are configured in `vitest.config.ts`.
- Coverage threshold targets are documented as policy in `AGENTS.md` (Lines 80%, Functions 80%, Branches 70%, Statements 80%), so enforcement appears policy-driven rather than config-enforced.

## Common assertion and case patterns
- Tests rely heavily on `describe/it/expect` with deterministic value assertions (`toBe`, `toEqual`, `toBeCloseTo`) in `src/data/tests/leveled.test.ts` and `src/data/tests/evaluateAST.test.ts`.
- Error-path validation is explicit via throw assertions (`toThrow`) in `src/data/tests/leveled.test.ts` and `src/data/tests/evaluateAST.test.ts`.
- Behavioral edge cases are common: parser errors, boundary values, and invalid inputs in `src/data/tests/evaluateAST.test.ts` and `src/data/tests/data-types.test.ts`.
- Large integration-style unit coverage exists for core calculators/domain logic in `src/data/tests/CharBuild.test.ts`.
- Server tests emphasize security and sanitization behavior (XSS protocol/tag filtering, URL safety) in `server/src/db/mod/guide.test.ts` and `server/src/util/html.test.ts`.

## Quality and risk observations
- Frontend tests are concentrated on data logic and utilities; UI component-level tests are limited in `src/components` (no `.test.ts` files there from current scan).
- Server has focused tests for auth/image/sanitization modules (`server/src/api/dna-auth.test.ts`, `server/src/db/mod/messageImage.test.ts`) but not full-route integration coverage from observed files.
- Since Vitest thresholds are not encoded in `vitest.config.ts`, CI/local drift is possible unless enforced externally per `AGENTS.md`.

## Practical execution workflow
- For frontend changes: run `pnpm lint` then `pnpm test`, and use `pnpm coverage` when validating threshold-sensitive work (`package.json`, `AGENTS.md`).
- For server changes: run `bun test` and `bun run lint` in `server` (`server/package.json`).
- Keep new tests in existing locations/patterns (`src/data/tests`, `src/utils`, `server/src/**`) to match discovery behavior used by current runners.
- Prefer explicit edge-case tests and deterministic assertions, mirroring existing high-signal files like `src/data/tests/evaluateAST.test.ts` and `server/src/util/html.test.ts`.
