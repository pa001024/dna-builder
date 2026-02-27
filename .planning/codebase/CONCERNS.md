# CONCERNS

## Scope
- Focused on technical debt, reliability, security, performance, and fragility risks with concrete repository evidence.
- Evidence references use repo-relative paths in backticks.

## High Priority Concerns

### 1) Password reset flow is brute-forceable and leaks sensitive codes
- Evidence:
- `server/src/db/mod/user.ts` uses 6-digit numeric code via `Math.random` (line ~268).
- `server/src/db/mod/user.ts` logs reset code in plaintext (`console.log(...${token})`, line ~290).
- `server/src/db/mod/user.ts` resolves reset by `token` only (line ~303), no per-attempt lockout seen in resolver flow.
- `server/src/db/schema.ts` stores reset token as plaintext (`token: text("token").notNull()`, line ~168), with uniqueness only on `userId` (line ~172), not on token.
- Risk: predictable token space + no visible attempt throttling + plaintext logging/storage.
- Action:
- Switch to cryptographically secure token generation (e.g., 32+ bytes).
- Store only token hash and compare hash server-side.
- Add per-IP/per-user rate limits and max-attempt counters.
- Remove token logging and add security audit logging without secrets.

### 2) JWT secret source and token lifetime policy are fragile
- Evidence:
- `server/src/db/yoga.ts` builds JWT secret from machine identity (`jwtToken = \`${machineIdSync()}\``, line ~34).
- `server/src/db/mod/user.ts` signs JWT without explicit expiry (`jwt.sign(..., jwtToken)`, line ~63).
- `server/src/api/dna-auth.ts` signs JWT without explicit expiry (`jwt.sign(..., jwtToken)`, line ~137).
- Risk: tokens may become invalid across host changes/redeploys; no explicit expiration increases long-lived credential risk.
- Action:
- Use dedicated environment secret(s), rotation-ready key strategy, and explicit `expiresIn`.
- Add refresh-token/session revocation model for long-lived auth.

### 3) GraphQL auth verification swallows token errors silently
- Evidence:
- `server/src/db/yoga.ts` catches JWT verification errors with empty catch block (`catch {}`, line ~49).
- Risk: hides auth anomalies/attacks and reduces observability for incident response.
- Action:
- Log structured warnings for invalid token events (without token contents).
- Add lightweight metrics counter for invalid auth attempts.

### 4) CORS policy appears overly permissive/implicit for production
- Evidence:
- `server/src/index.ts` configures CORS with `allowedHeaders: "*"` and `exposeHeaders: "*"` (lines ~26-27), and origin policy is commented out (`// origin: "*"`, line ~24).
- Risk: policy ambiguity and broad header exposure can increase attack surface and integration surprises.
- Action:
- Define explicit origin allowlist per environment.
- Narrow allowed/exposed headers to required set only.

## Medium Priority Concerns

### 5) HTML sanitization allows risky URL schemes in rendered chat content
- Evidence:
- `src/utils/html.ts` only allowlists tags/attrs (`href`, `src`) but does not validate URL protocols (lines ~4, ~7, ~26-29).
- `src/views/ChatRoom.vue` renders user content through `v-html="sanitizeHTML(item.content)"` (lines ~396, ~402).
- Risk: `javascript:` or other unsafe URI schemes may survive attribute allowlist and lead to scriptable links/content abuse.
- Action:
- Enforce protocol allowlist (`https:`, `http:`, constrained `data:image/...`) for `href`/`src`.
- Prefer battle-tested sanitizer policy (e.g., DOMPurify configured with URI policy).

### 6) AIAgent fallback path can render raw message HTML
- Evidence:
- `src/views/AIAgent.vue` fallback assigns raw content on render error (`message.renderedContent = message.content`, line ~203).
- `src/views/AIAgent.vue` template renders via `v-html="msg.renderedContent || msg.content"` (line ~639).
- Risk: rare parse/render exceptions can bypass markdown escaping path and inject raw HTML.
- Action:
- Sanitize fallback content before assignment/render.
- Keep markdown renderer constrained and fail-closed to escaped text.

### 7) Tauri command surface allows broad filesystem mutation with caller-supplied paths
- Evidence:
- `src-tauri/src/lib.rs` exposes commands `read_text_file`, `write_text_file`, `rename_file`, `delete_file` (lines ~1118, ~1130, ~1886, ~1911) using direct caller-supplied paths.
- `src-tauri/src/lib.rs` registers large invoke surface (`tauri::generate_handler![...]`, lines ~2306+).
- Risk: if renderer is compromised, attacker can pivot to local file read/write/delete with user privileges.
- Action:
- Restrict file commands to approved base directories and canonicalize paths.
- Reject traversal/absolute escapes; add permission gating per command category.

### 8) Runtime panic risk from `unwrap`/`expect` in desktop runtime paths
- Evidence:
- `src-tauri/src/lib.rs` contains many runtime `unwrap`/`expect` calls (20 `unwrap` matches; examples around lines ~131, ~137, ~158, ~2190, ~2357).
- Risk: unexpected runtime states can crash app instead of returning recoverable errors.
- Action:
- Replace with error propagation and user-safe error messages.
- Add targeted tests around startup/websocket/file-operation failure modes.

### 9) Interval lifecycle management is inconsistent and can leak work
- Evidence:
- `src/components/ActivityCalendar.vue` starts 1-second interval on mount (`setInterval`, line ~581) without visible cleanup in file.
- `src/store/ui.ts` `startTimer()` starts interval (`setInterval`, line ~94) with no stored handle/stop action.
- Risk: duplicate intervals (HMR/remount/re-init paths), unnecessary CPU wakeups, stale reactive updates.
- Action:
- Store timer IDs and clear them on unmount/dispose.
- Guard repeated `startTimer()` calls.

## Technical Debt / Fragility

### 10) Known unresolved correctness gap in combat calculation path
- Evidence:
- `src/data/CharBuild.ts` has explicit TODO in dynamic buff weapon attribute computation (`// TODO ... 可能有问题`, line ~734).
- Risk: silent stat miscalculation in edge cases, difficult-to-debug build inaccuracies.
- Action:
- Define failing test cases for multi-weapon dynamic buffs and implement missing branch logic.

### 11) Oversized files increase change risk and reduce reviewability
- Evidence:
- `src-tauri/src/lib.rs` ~2097 lines and ~44 tauri commands.
- `src/views/ScriptListView.vue` ~3677 lines.
- `server/src/db/schema.ts` ~644 lines.
- Risk: high cognitive load, merge conflicts, regression-prone edits.
- Action:
- Split by domain boundaries (auth/fs/network/script runtime/UI sections).
- Add ownership boundaries and smaller test targets per module.

### 12) Type-safety erosion in critical server glue code
- Evidence:
- `server/src/db/mod/index.ts` uses extensive `any` in schema merge and argument parsing.
- `server/src/db/schema.ts` uses multiple `as any` casts in SQL helper composition.
- `server/src/db/yoga.ts` uses `as any` for websocket payload headers and handler bridging.
- Risk: weak compile-time guarantees in auth/data-path plumbing where runtime failures are costly.
- Action:
- Introduce typed resolver context/args wrappers incrementally.
- Reduce `any` surface in schema utilities first (highest fan-out code).

## Suggested Remediation Order
1. Password reset hardening + remove secret logging.
2. JWT secret/lifetime policy + auth observability.
3. HTML URI sanitization and AIAgent fallback sanitization.
4. Tauri filesystem command sandboxing + unwrap reduction.
5. Timer cleanup consistency and large-file decomposition plan.
