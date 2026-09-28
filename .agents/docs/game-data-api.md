# 游戏数据 GraphQL 接口（gameData*）

把 `src/data/d/*.data.ts` 的全部数据集收敛到一个统一的 GraphQL 入口，供 MCP、脚本与第三方工具查询，
不必为每张表单独定义 GraphQL 类型。

## 代码位置

| 文件 | 职责 |
|---|---|
| `server/src/db/mod/gameData.ts` | GraphQL typeDefs / resolvers / `JSON` 标量 |
| `server/src/db/mod/gameDataRegistry.ts` | 数据模块登记表、数据集枚举、记录标准化、字段与取值统计 |
| `server/src/db/mod/gameDataQuery.ts` | 纯函数查询引擎（过滤 / 全文匹配 / 排序 / 投影 / 分页） |
| `server/src/db/mod/gameData.test.ts` | 三层测试：注册表、查询引擎、GraphQL 端到端 |
| `server/src/db/introspection.ts` | 内省查询识别（graphql-jit 守卫，见文末） |

## 查询入口

```graphql
query {
    # 1. 数据模块清单（= 一个数据文件），纯静态，不加载数据
    gameDataModules { id label file baseId locale variants }

    # 2. 数据集清单（= 模块里的一个可查询导出），省略 module 会加载全部数据（慢）
    gameDataSets(module: "char") { id exportName kind count locale variants }

    # 3. 顶层字段名（按需扫描，limit 控制归纳时最多扫多少条记录）
    gameDataFields(dataset: "mod", limit: 200)

    # 4. 统一查询
    gameData(input: {
        dataset: "mod"
        where: [{ field: "品质", op: EQ, value: "金" }, { field: "版本", op: LTE, value: "1.0" }]
        search: "不死鸟"
        sort: [{ field: "耐受", desc: true }]
        fields: ["id", "名称", "品质"]
        offset: 0
        limit: 20
    }) {
        dataset
        dataSet { id count kind }   # 未过滤的总数
        total count offset limit    # 过滤后的总数与本页信息
        items { key data }          # data 是 JSON 标量（已按 fields 投影）
    }

    # 5. 按记录键取单条（id / 名称 / name / Map 键）
    gameDataRecord(dataset: "mod", key: "11001") { key data }

    # 6. 字段去重取值（构建筛选项），按出现次数降序
    gameDataFieldValues(dataset: "mod", field: "品质", limit: 10) { value count }
}
```

前端调用由 `pnpm gen` 生成（`src/api/gen/api-queries.ts` 的 `gameDataQuery` / `gameDataSetsQuery` / …）。

## 数据集 id 口径

- 模块 id = 文件名去掉 `.data`（`char`、`charext.en`），语言后缀 `en / fr / jp / kr / tc` 用于识别本地化变体；
- 数据集 id 优先取模块 id：模块有 `default` 导出就用它，没有 `default` 但只有一个可查询导出时该导出占用模块 id；
- 其余导出用 `模块 id:导出名`（`pet:petEntrys`、`abyss:abyssDungeons`、`translations:translationsEn`）；
- 与主导出**引用相同**的具名导出不单独登记（`resource.data.ts` 的 `resourceData` 与 `default` 同源），
  但仍可用 `resource:resourceData` 这种别名查询；
- 语言变体可用 `gameDataModules` 的 `variants` 或数据集上的 `variants` 查（`charext` 有 6 个变体）。

## 查询语义

- **字段路径**：支持 `a.b`，遇到数组自动按元素下钻（`特质.名称` 取到所有特质名）。
- **宽松比较**：数字与数字字符串互认（`"1101"` 能命中 `1101`）；数组字段按元素逐个匹配，任一命中即算命中。
- **算子**：`EQ` / `NE` / `CONTAINS`（数组含元素、字符串含子串、对象按 JSON 文本包含）/ `IN` / `GT` / `GTE` /
  `LT` / `LTE`（可转数字时按数字比，否则按文本）/ `EXISTS`（存在且非空）。
- **全文匹配** `search`：大小写不敏感，跨字段递归扫描（键名也算，所以 `近战增伤` 能命中 `@近战增伤`），
  单条记录最多访问 2 万个节点、深度 6 层。
- **排序**：按 `sort` 顺序生效；字段缺值的记录恒排最后（不受 `desc` 影响），保证分页稳定。
- **投影** `fields`：只保留这些顶层字段（写 `a.b` 时取顶层 `a`）。
- **分页**：`limit` 默认 50、上限 500；`offset` 默认 0；`total` 是过滤后的总数。

## 性能与缓存

模块与记录都按需懒加载并缓存，未被查询的数据文件不会进内存：

| 操作 | 首次 | 命中缓存 |
|---|---|---|
| `gameDataSets(module: "char")` | ~10ms（只加载该模块） | ~4ms |
| `gameDataSets`（全量，165 个数据集） | ~1.7s（加载全部 79 个数据文件） | ~14ms |

因此**列举数据集时优先带 `module`**；只有做全量发现时才不带参数。

## 版本门限

服务端没有 `localStorage`，`applyVersionGate` 取到的是「不设门限」，所以接口返回**全部版本**的数据。
需要按版本筛选时用字段过滤：`where: [{ field: "版本", op: LTE, value: "1.0" }]`。

## 记录形态

记录统一标准化为 `{ key, data }`：

- `key` 依次取 `id / Id / ID / 名称 / name / Name / n / key`，都取不到时回退为数组序号或 Map 键；
- `data` 是原始条目对象；导出值是原始值时（如 `levelup:charLevelUpExpCost` 的纯数字数组）包装为 `{ value }`；
- 导出形态 `kind` 为 `array`（数组导出）/ `object`（普通对象导出，键作记录键）/ `map`（Map 导出）。

## JSON 标量

记录主体结构随数据集而异（中文键、嵌套对象、数组），无法静态建模，因此统一用 `JSON` 标量透传；
元信息（数据集 id、记录数、分页信封）仍是强类型。输出侧会深拷贝成 JSON 安全形态（`Map` → 对象、
`Set` → 数组、`Date` → ISO 文本、函数与 `undefined` 丢弃、环引用记成 `[Circular]`）。

前端生成代码把 `JSON` 映射为 `unknown`（`tools/generate-api-calls.ts` 的 `scalarMap`）。

## 注意事项

- **resolvers 里不要给非根类型写字段级 resolver**：`@pa001024/graphql-mobius` 把非根类型的字段建模成
  普通值（带参数的字段建模成 `(args) => value`），因此 `GameDataSet.fields` 这类需要父对象的字段解析器
  在类型上过不去。需要懒加载的信息一律做成 Query 字段（`gameDataFields` 就是这么来的）。
- **内省查询绕开 graphql-jit**：graphql v17 把参数默认值改成 `default: { value }`，而 graphql-jit 仍读 v16 的
  `defaultValue`，于是内省字段 `directives(includeDeprecated: Boolean!)` 被判成「必填参数未提供」，
  GraphiQL 直接报 `Error fetching schema`。`server/src/db/yoga.ts` 用 `useGraphQlJit({}, { enableIf })`
  把内省查询放行给默认执行器，回归测试在 `server/src/db/introspection.test.ts`。
- **graphql-jit 的字面量告警**是既有现象：它对所有 `parseLiteral` 形参个数 > 1 的标量都会打印
  `Scalar with variable inputs detected...`，graphql v17 的内置标量（String / Int / Boolean）也是这个形状，
  与自定义标量无关，不影响结果。
