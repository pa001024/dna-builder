# BUFF × MOD 互斥（`禁用` 字段）

MOD 与 BUFF 可能提供**同一份增益**（如 百首「全盛·振奋」与 BUFF「全盛·振奋」；海妖「羽翼·鼓舞·昂扬」/ 换生灵「昂扬」与 BUFF「羽翼·鼓舞·昂扬(雷)」）。
两边同时计入会重复计算，因此在 BUFF 数据上声明「装备这些 MOD 时本 BUFF 失效」。

## 数据字段

`packages/data/d/buff.data.ts` 的 `Buff.禁用?: number[]`：MOD id 列表。

```ts
{
    名称: "羽翼·鼓舞·昂扬(雷)",
    禁用: [56143, 56144], // 换生灵「昂扬」/ 海妖「羽翼·鼓舞·昂扬」
    attr: { 昂扬: 0.66 },
}
```

判定口径：**当前已装备 MOD（四槽 + 中枢 + 临时槽）的 id 命中列表任一即失效**，与 BUFF 等级 / 覆盖率无关。

数据标注约定：

- 同名 MOD（如 `全盛·振奋` / `全盛·安神` / `乘势` / `激扬寒波` / `色散成霓` / `紊乱气旋` / `磐石`）：列出**全部品质档**的 id；
  元素无关的 BUFF 列出全部元素变体。
- 海妖 / 换生灵 成对系列：海妖「羽翼·鼓舞·X」与换生灵「X」共享同一效果，列出**同元素**的两个 id
  （如 雷：`56143` + `56144`）。不同元素之间不互斥（来自不同来源的昂扬本就叠加）。
- 新增同类数据时，先在同名/后缀匹配的 MOD 上确认效果文案与数值确实是同一增益，再补 id；
  `packages/data/tests/buffDisable.test.ts` 会校验列表内 id 必须存在。

## 实现落点

| 端 | 位置 | 行为 |
|---|---|---|
| TS | `CharBuild.isBuffDisabled` / `equippedModIds` | 已装备 MOD id 集合随 `modsCache` 缓存；失效 BUFF 跳过属性汇总、乘法、减伤、条件 BUFF 聚合与动态 `code` |
| TS | `CharBuild.findBuffDisablingMod` | 返回命中的 MOD，供 UI tooltip |
| Rust | `BuildContext.buff_active` + `refresh_buff_activation` | 装配后与 MOD 增删（含自动配装增量路径、探测回滚）时重算；失效 BUFF 跳过同口径的汇总与 `code` |
| Python SDK | `build_state` 装配期过滤 | 无自动配装/收益增量路径，装配时按已装备 MOD id 过滤即可 |
| Go SDK | `BuildState` 装配期过滤 | 同 Python：装配 `buffs` / `dynamicBuffs` 前按已装备 MOD id 过滤 |
| UI | `BuffCell.vue` | 失效 BUFF 名称加删除线，禁用原因写进 `ShowProps` 的 tooltip（`note`），不额外显示徽章 |

`禁用` 是 BUFF 元信息：TS `LeveledBuff` 直接复制，Rust `BUFF_EXCLUDE_PROPERTIES` / Python `BUFF_EXCLUDE`、`BUFF_META_KEYS` /
Go `BuffExclude`、`BuffMetaKeys` 都必须排除它，避免被当成数值属性（它是 `number[]`，会被旧格式折叠逻辑误当词条）。

## 自动构筑语义

BUFF 列表在自动构筑中是固定的，候选 MOD 的收益按「追加后重算」得出。装备会禁用某个 BUFF 的 MOD 时，
该 MOD 只贡献自身词条，BUFF 的数值不再叠加，因此收益自然偏低。
典型表现：已选 BUFF「羽翼·鼓舞·昂扬(雷)」时，海妖「羽翼·鼓舞·决断」的收益高于「羽翼·鼓舞·昂扬」。

## 测试

- `packages/data/tests/buffDisable.test.ts`：数据 id 校验、失效判定、属性不重复叠加、`calcIncome` 收益差。
- `crates/dob-calc-core/tests/parity_buff_disable.rs`：`modules.json` 夹具缺 `禁用`，测试内注入字段后验证引擎行为与
  `calc_income_buff` 的 0 收益路径。
- `sdk/python/tests/test_buff_disable.py` / `sdk/go/buffdisable_test.go`：旧数据快照同样在测试内注入 `禁用`，
  断言装配期过滤与属性不重复叠加。
- 修改 `禁用` 标注后跑：`pnpm test`（data 包）、`cargo test --manifest-path crates/dob-calc-core/Cargo.toml`、
  `sdk/python` 的 pytest、`sdk/go` 的 `go test`。
