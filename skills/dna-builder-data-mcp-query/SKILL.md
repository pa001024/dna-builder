---
name: dna-builder-data-mcp-query
description: Use when an AI agent needs to query game data via the dna-builder-data MCP server, including resolving `/local/*` static modules, fuzzy or exact record lookup, drop/source tracing, and real-time `missionsIngame` queries. Trigger this skill for requests about characters, weapons, mods, rewards, dungeons, quests, materials, progression tables, or "today/latest missions".
---

# DNA Builder Data MCP Query Skill

Use `dna-builder-data` MCP as the default data source for game data questions.

## Execute Query Flow

1. Classify the request:

- Query static game data -> use `resolve-data-module` + `query-data-module`.
- Query latest missions (today/real-time/密函) -> use `query-missions`.
- Mixed request -> run both flows and merge answers.

2. Resolve module first unless moduleId is already explicit and trusted.
3. Query with conservative defaults, then refine:

- First pass: `limit=10`, no `fields`, no `exactId`.
- Precision pass: add `fields` and/or `exactId`.
- Recall pass: increase `threshold` (for example `0.45` -> `0.6`) and broaden `query`.

4. Return normalized business fields when present (`reward`/`dungeon`/`abyss`/`raid` modules may include expanded fields).

## Tool Rules

### `resolve-data-module`

Call when module is unknown or ambiguous.

Input:

- `moduleName` (required): short keyword (`char`, `weapon`, `reward`, `quest`...).
- `query` (optional): user intent for better ranking.
- `source` (optional): keep `"local"`.

Output:

- `selected`: best module candidate.
- `candidates`: ranked fallback modules.

### `query-data-module`

Call after module resolution (or with known moduleId).

Input:

- `moduleId` (required): `/local/<dataset>`.
- `query` (optional): fuzzy text query.
- `exactId` (optional): strict ID/name/key match.
- `fields` (optional): field whitelist (dot path), used to reduce noise.
- `limit` (optional): `1..50`, default `10`.
- `threshold` (optional): `0..1`, default `0.3`.
- `includeRaw` (optional): include raw compressed record.

Output:

- `results[*].preview`: lightweight summary.
- `results[*].record`: normalized record (primary response payload).
- `results[*].rawRecord`: only when `includeRaw=true`.

### `query-missions`

Call for real-time missions only.

Input:

- `server` (optional): default `"cn"`.
- `query` (optional): keyword filter.
- `endpoint` (optional): override GraphQL endpoint.

Output:

- `latest.missions`: structured groups `角色` / `武器` / `魔之楔`.

## Choose Parameters

- Need exact object (ID/name known): set `exactId`, keep `threshold` low (`0.2~0.35`).
- Need broad discovery: omit `exactId`, raise `limit` (`20~50`), keep default `threshold`.
- Too many irrelevant hits: set `fields` to core keys, lower `threshold`.
- Too few hits: remove `fields`, raise `threshold`, simplify `query`.
- Need protocol/debug parity: set `includeRaw=true`.

## Use These Call Templates

Resolve module:

```json
{
    "tool": "resolve-data-module",
    "arguments": {
        "moduleName": "char"
    }
}
```

Query module:

```json
{
    "tool": "query-data-module",
    "arguments": {
        "moduleId": "/local/char",
        "query": "光",
        "fields": ["属性"],
        "limit": 10,
        "threshold": 0.3
    }
}
```

Query real-time missions:

```json
{
    "tool": "query-missions",
    "arguments": {
        "server": "cn",
        "query": ""
    }
}
```

## Handle Failures

- Error `未知本地模块` / `未知模块 ID`: rerun `resolve-data-module` and select from `candidates`.
- Empty results with `exactId`: remove `exactId`, switch to fuzzy query.
- Empty fuzzy results: retry with fewer `fields`, higher `threshold`, broader keyword.
- GraphQL mission error: retry with explicit `endpoint`; if still failing, report endpoint/server and stop guessing.

# 可查询模块清单

模块 ID 统一格式：`/local/<dataset>`。

## 本地静态模块（36 个）

1. `abyss`：深渊副本、层级、怪物、增益、奖励解压
2. `accessory`：角色饰品、武器饰品、武器皮肤
3. `achievement`：成就数据
4. `autochess`：自走棋相关配置（机器人装备）
5. `buff`：Buff 配置
6. `char`：角色基础与战斗配置
7. `convert`：魔之楔转换关系
8. `draft`：角色/武器/魔之楔/锻造/铸造/图纸数据
9. `dungeon`：副本、怪物、奖励解压
10. `dynquest`：派遣委托/突发任务/含任务剧情文本
11. `effect`：效果/词条定义
12. `fish`：鱼类与钓点
13. `hardboss`：周本/梦魇残声/动态奖励映射
14. `headsculpture`：头像
15. `levelup`：升级消耗、经验、换算
16. `map`：地图模块（当前为空）
17. `mod`：魔之楔/MOD
18. `monster`：怪物/敌人
19. `monstertag`：怪物标签
20. `mount`：载具
21. `npc`：NPC/含NPC对话文本
22. `partytopic`：派对话题
23. `pet`：魔灵及相关条目
24. `player`：玩家等级经验与经验来源
25. `quest`：任务/剧情/含任务剧情文本
26. `questchain`：任务链
27. `raid`：团本配置（含副本式奖励解压）
28. `region`：地区
29. `reputation`：声望
30. `resource`：资源道具
31. `reward`：奖励组与掉落树解压
32. `shop`：商店与来源映射
33. `subregion`：子地区
34. `title`：称号
35. `walnut`：密函静态配置与映射
36. `weapon`：武器

说明：`LOCAL_DATASETS` 中键数量按代码为 36（含 `map` 空模块）。

## 在线模块（实时）

- `query-missions`：查询 `missionsIngame` 最新密函，返回 `角色`/`武器`/`魔之楔` 三组。

## 特殊解压模块

以下模块返回的 `record` 附带业务解压字段，优先使用：

1. `reward`

- 额外字段：`typeText`、`dropModeText`、`details`、`leafRewardNames`

2. `dungeon`

- 额外字段：`monsterNames`、`specialMonsterNames`、`rewardsResolved`、`specialRewardsResolved`、`rewardSummary`

3. `abyss`

- 额外字段：`dungeonName`、`groupName`、`levelLabel`、`monsterNames`、`buffsResolved`、`rewardsResolved`

4. `raid`

- 复用副本解压逻辑，字段风格与 `dungeon` 接近

## 常用字段白名单模板（`fields`）

按场景选用，降低噪声：

1. 角色检索：`["名称", "元素", "职业", "武器类型", "技能.名称"]`
2. 武器检索：`["名称", "武器类型", "品质", "技能.名称"]`
3. 魔之楔检索：`["名称", "类型", "描述", "效果"]`
4. 副本掉落：`["名称", "id", "rewardSummary", "monsterNames", "rewardsResolved"]`
5. 奖励组追踪：`["id", "typeText", "dropModeText", "leafRewardNames", "details"]`
6. 任务检索：`["id", "名称", "描述", "前置任务", "奖励"]`

## 查询策略速查

1. 不知道模块：先 `resolve-data-module`
2. 只知道名字：先 fuzzy `query`，再用 `exactId` 二次确认
3. 结果太多：增加 `fields`，降低 `threshold`
4. 结果太少：移除 `fields`，提高 `threshold`，简化关键词
5. 要最新密函：直接 `query-missions`（无需 `resolve-data-module`）
