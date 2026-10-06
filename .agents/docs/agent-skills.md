# Agent 技能（远端 skill）机制

服务端统一下发的能力扩展。**技能库是文件系统里的普通目录** `server/skills/<技能名>/`（内含根级
`SKILL.md` 与可选附带文件），由 git 直接管理版本；服务端实时读取并**在下发时打包成 zip**，客户端 Agent
把包内容挂成技能资料目录，模型经 `skill` / `list_file` / `read_file` / `grep` 四个工具访问。注入格式与
加载纪律逐字对齐 ZCode（`D:\dev\ZCode-main` 的 `context/sections/skills.ts` 与 `tool/handlers/skill.ts`），
文件工具的切片语义是本项目自定义口径。

**没有写入接口**：新增 / 修改 / 删除技能都是普通提交（改 `server/skills/` 下的文件），回退用 git。
元数据（描述 / 适用时机 / 版本 / 启停 / 排序）全部来自 `SKILL.md` 的 frontmatter；**技能名以目录名为准**。

## 对齐 ZCode 的硬规则

1. **注入载体**：技能清单**不进系统提示词**——装配层把 `renderSkillPromptSection` 交给内核的
   `metaUserPrefix`，内核用 `<system-reminder>` 包裹后作为一条置于对话最前的 user 消息随每轮请求下发
   （对应 ZCode 的 meta_user / `skills_listing` 附件，见其 `message-history.ts` 与
   `system-reminder/source.ts` 的 `wrapSystemReminder`）。清单为空时整条前缀消息不下发。
2. **清单内容**：`renderSkillPromptSection`（`src/shared/skill-prompt.ts`）逐字复刻 ZCode 的
   `buildSkillsContent`——首行 `The following skills are available for use with the Skill tool:`，
   之后一行一个技能 `- name: 描述 - 适用时机 (file: /name/SKILL.md)`（按名称排序、描述截 250 字、
   整段超 20k 字符降级为只列名字与路径）。**不写使用规则、不复述工具说明**——用法与加载纪律全部
   在 `skill` 工具的 meta 里，提示词重复会互相打架。
3. **`skill` 工具输出**：`<skill_content name="...">` 包裹 `# Skill: 名` + 正文 +
   `Base directory for this skill: /名/`，正文里的 `${CLAUDE_SKILL_DIR}` / `${ZCODE_SKILL_DIR}`
   变量在加载时展开为基目录；`args` 参数接受但不回显（与 ZCode handler 一致）。
4. **模型可见文案（工具描述 / 清单 / 工具返回文本）不得出现「虚拟」文件系统之类措辞**——
   技能资料就是普通的目录与文件；「虚拟文件系统」只允许出现在代码注释与文档里。

## UI 层显式调用（`$` 提及，对齐 ZCode）

用户可以在输入框里键入 `$` 点名技能，不必等模型自己判断：

- **落盘形态与 ZCode 一致**：`[$名称](/名称/SKILL.md)`，且**只认这一种全写形态**。输入框是 Lexical
  富文本（`lexical` + `@lexical/plain-text` + `@lexical/history`，对齐 ZCode 的编辑器装配），提及渲染成
  chip（token 模式的 TextNode 子类，dbstyle 方章样式，icon 走 CSS mask 装饰），序列化直接落 canonical
  （`SkillMentionNode.getMarkdown`，对齐 ZCode 的 getMarkdown）。短写 `$名称` 已下线：`expandSkillMentions`
  与裸 `$名称` 行内解析均已删除，正文里只有 chip 才算提及。
- **Lexical 层 `src/utils/prompt-lexical.ts`**：`SkillMentionNode`（token 原子节点 / createDOM 写
  `--mention-mask` 供 icon 装饰）、`$getPromptMarkdown`（树转 canonical，段落以空行分隔）、
  `$getPromptSelectionMarkdown` + `$getAtomicPromptSelection`（复制 / 剪切把选区写为 canonical）、
  `$replaceActiveTriggerWithSkillMention`（`$查询串` 区间替换成 chip + 尾随空格，光标落空格后）、
  `$replaceEditorContent`（外部回填时 canonical 还原成 chip）、`registerPromptClipboard`。
- **纯逻辑层 `src/utils/skill-mention.ts`**（有单测）：`extractActiveSkillTrigger`（光标前的活动提及，
  面板触发判定只看光标所在文本节点，chip 天然定界）、`parseSkillMentions`（只认链接形态）、
  `collectSkillMentionNames`、`stripSkillMentions`、`filterSkillMentions`。
- **面板 `src/components/SkillMentionPanel.vue`**：单分组、按名称折叠、上下键 + Enter 采用 + Esc 关闭；
  首次打开自己补一次 `ensureAgentSkillsReady()`（注册表平时只在发送前刷新，否则第一次按 `$` 是空面板）。
- **交互接线在 `DBAskBox.vue`**：`registerPlainText` 接管 IME / 删除 / 纯文本粘贴，
  `registerHistory` 提供撤销栈，图片粘贴走 root 元素的 capture 监听（对齐 ZCode 的 PasteCapturePlugin）；
  面板打开时上下键 / Enter / Esc 以高优先级命令转发给 `skillPanelRef.handleKeydown`（返回 true 即消费），
  Esc 记录 dismissal——查询串不变不重新唤起；`mousedown.prevent` 保住编辑器焦点与光标。
- **气泡呈现**：`AgentChatMessages.vue` 用 `parseSkillMentions` 把 canonical 提及渲染成带图标的 chip，
  不把 `[$名称](/名称/SKILL.md)` 原文暴露给用户；落库内容仍是 canonical 原文。
- **本地检索 / 会话命名要剥离提及**：`DBView` 的检索词与长度上限口径走 `stripSkillMentions`（否则一个
  chip 的 canonical 原文就能顶满关键词上限），`useDBChat` 的会话名同理——提及是给模型看的，
  让它参与全库模糊检索只会拖出一堆 `/ SKILL.md` 噪声命中。
- `skill` 工具的描述里已写明「用户 `$名称` 点名的技能属于用户已指定，必须先逐个加载」。

## 数据流（整包下发，绝不逐文件打 API）

1. **清单**：Agent 会话发送前 `ensureAgentSkillsReady()` 拉一次 `GET /api/v1/agent/skills`
   （只有元数据，无包体；注册表内存缓存 5 分钟，见 `src/api/agent/skills/registry.ts`）。
   服务端每次重新扫描技能目录（`listSkills`），改文件 / 加目录 / 删目录无需重启即生效。
2. **按需加载**：模型触达某个技能（调 `skill`、或文件工具访问到它的路径）时才下载
   `GET /api/v1/agent/skills/:name/package?sha=<清单 sha>`。服务端**实时打包**该技能目录成 zip
   （条目按路径排序、mtime 固定为 1980 epoch，故同一份内容必然产出同一份字节与 sha，内容寻址稳定）；
   URL 带 sha 做内容寻址，换内容后 URL 变化可绕过浏览器 / CDN 的旧包 HTTP 缓存。客户端算 sha256 与清单比对 →
   fflate 解压 → 剥 SKILL.md frontmatter → 写入落盘缓存（OPFS 优先 / IndexedDB 回退，复用
   `src/utils/data-pack/pack-storage.ts`，目录 `<根>/agent-skills/<技能名>/`，manifest.json 记 sha）。
3. **缓存命中**：落盘 manifest 的 sha 与服务端清单一致就直接读本地；不一致（服务端内容变了）自动重新下载。
4. 所有技能一律按需加载：清单里只有 `name: 描述`，没有全文注入模式。

## 约束与口径

- **注入纪律**：技能不存在时工具面与 meta_user 技能清单同时不出现（与 rag_enabled 的整段注入/消失同一口径）；
  装配层（`dbAgent.ts` / `buildAgent.ts`）把 `registry.getPromptSkills()` 快照交给 `metaUserPrefix`。
  容量面板把前缀消息的估算并入「系统提示词」一类（`buildContextEstimate` 的 `metaUser` 参数）。
- **技能目录约束**（`server/src/util/skill-source.ts` 的 `deriveSkillMeta`）：目录名小写 kebab-case ≤64；
  根级必须有 `SKILL.md`；frontmatter 的 `description` 必填 ≤1024 字；可认 `whenToUse`/`when_to_use`、
  `version`、`enabled`（`false` 时清单与下载都不出）、`sortOrder`；≤50 文件、单文件 ≤1MB、合计 ≤8MB。
  隐藏文件与 `__MACOSX` 忽略。不合法的技能目录只告警并跳过，不影响其余技能与清单接口。
- **read_file 切片语义**（`src/api/agent/skills/vfs.ts` 的 `renderReadFile`）：
  `slice` 正数取开头 N 行、负数取末尾 N 行（优先级最高）；`search` 文件内忽略大小写搜子串、
  每个命中附上下文（前 20 处）；`line` 行号（1 起）附近 ±N 行；`range` 控制上下文行数（默认 3，上限 20）；
  整读上限 2000 行 / 30000 字符，超出附续读提示。输出一律 cat -n 风格行号。
- **服务端库层**（`server/src/api/agent-skill-library.ts`）：扫描 `server/skills/` 下的一级目录；
  缓存的键是「文件路径 + 大小 + mtime」的指纹而非目录 mtime——⚠️ **改已有文件的内容不会更新目录 mtime**，
  用目录 mtime 当缓存键会把旧内容一直缓存下去（停用 / 改描述都不会生效）。包体按 sha 缓存，避免重复打包。
  根目录不存在时视为空库（首次部署无需预建目录）。`SKILLS_DIR` 环境变量可覆盖技能库位置。
- **权限**：全部接口公开——技能是提示词性质内容，未登录的自定义上游用户也要能加载。没有管理写入接口。
- ⚠️ `server/skills/` **是被 git 跟踪的**（不再依赖独立的 dob-skills 仓库，也不再走 admin 页上传 zip）；
  技能库 README 见 `server/skills/README.md`。

## 关键文件

| 层 | 文件 |
|---|---|
| 技能库（git 跟踪的目录） | `server/skills/<技能名>/SKILL.md`（说明见 `server/skills/README.md`） |
| server 接口 | `server/src/api/agent-skill.ts`（只读 REST 插件 `/api/v1/agent/skills`） |
| server 库层（扫描 / 缓存 / 实时打包） | `server/src/api/agent-skill-library.ts` |
| server 纯逻辑（frontmatter / 打包 / 元数据） | `server/src/util/skill-source.ts` |
| client REST 封装 | `src/api/agentSkill.ts` |
| 注册表（清单/加载/落盘编排） | `src/api/agent/skills/registry.ts` |
| 落盘缓存 | `src/api/agent/skills/skill-store.ts` |
| 纯逻辑（切片/搜索/解包） | `src/api/agent/skills/vfs.ts`、`frontmatter.ts`、`zip.ts` |
| 工具工厂 | `src/api/agent/tools/skill-files.ts` |
| `$` 提及纯逻辑 | `src/utils/skill-mention.ts` |
| `$` 提及面板 | `src/components/SkillMentionPanel.vue`（在 `DBAskBox.vue` 里接线） |
| admin 浏览页（只读） | `src/admin/AgentSkillManagement.vue`（`/admin/agent-skill`） |
| 单测 | client：`src/api/tests/agent/skill.test.ts`、`src/utils/skill-mention.test.ts`；server：`server/src/util/skill-source.test.ts` |
