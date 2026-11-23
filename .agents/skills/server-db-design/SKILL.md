---
name: server-db-design
description: apps/server GraphQL resolver 与 SQL 查询设计规范（模块注册、getSubSelection 裁剪、drizzle relations + with、DTO 投影、codegen）。新增或改动 apps/server/src/db/mod/ 下任意模块时使用。
---

# Server 数据库查询设计

权威参考：`apps/server/src/db/mod/guide.ts`（relations + with + getSubSelection 完整示例）、`mod/index.ts`（模块注册与 getSubSelection 实现）、`src/db/schema.ts`（relations 声明位置）。

## 1. 模块结构与注册

每个 `db/mod/<name>.ts` 固定导出 `typeDefs`（gql 模板字符串）和 `resolvers` 对象：

```ts
export const typeDefs = /* GraphQL */ `
    type Foo { id: String!, ... }
    type Query { foo(id: String!): Foo }
    type Mutation { createFoo(input: FooInput!): Foo }
`
export const resolvers = {
    Query: { foo: async (_parent, args, context, info) => { ... } },
    Mutation: { createFoo: async (_parent, args, context) => { ... } },
}
```

注册：在 `mod/index.ts` 顶部 import，分别加进 `typeDefs` 和 `resolvers` 两个数组。

## 2. Resolver 签名

```ts
foo: async (_parent, args, context, info) => { ... }
```

- 一律四参；**只有用到 `getSubSelection` 才接收 `info`**，否则省略。
- 鉴权：直接检查 `context.user`，不满足时抛 `createGraphQLError("需要登录")`。
- 公开查询必须显式判断可见性字段，不要靠无鉴权来隐式暴露所有行。

## 3. 选择集裁剪（getSubSelection）

```ts
import { getSubSelection } from "."
```

```ts
const wantsAuthor = Boolean(getSubSelection(info, "author"))
const wantsNested = Boolean(getSubSelection(info, "items.author")) // 点路径
```

规则：

- 关联表/聚合查询前先判断；未选中则 `with` 传 `undefined`（不查该表）。
- 聚合结果喂多个标量时 OR 覆盖全部依赖字段：`a || b || c`。
- 排序依赖的统计字段不能裁。
- 测试里 `info` 传 `{}`：`getSubSelection` 缺选择集时返回 truthy（fail-open，保持未裁剪行为）——不要用它做安全判断。

## 4. drizzle 关系查询

关系集中声明在 `src/db/schema.ts` 末尾（`<Entity>Relations`）。**新增关系时双向都要声明。**

```ts
const row = await db.query.foos.findFirst({
    where: eq(schema.foos.id, id),
    with: {
        author: wantsAuthor ? true : undefined,
        items: wantsItems
            ? { orderBy: (t, { desc }) => [desc(t.createdAt)], limit: PAGE_SIZE }
            : undefined,
    },
})
```

- 有关系的表优先 `db.query.<table>.findMany/findFirst({ with })`；不要先查父表再按 id 手动拼子表。
- `with` 值可以是 `true`、`undefined`，或 `{ orderBy, limit, columns }`。
- 关系查询是 **async**；`db.select()...all()`/`.get()` 在 bun-sqlite 下是同步的。
- 聚合统计（计数/求和）用 `groupBy` 聚合查询，不要用 `with` 硬凑。
- 通用工具函数处理行类型时保留泛型扩展字段：

```ts
function sortRows<T extends BaseRow>(rows: readonly T[], ...): T[]
```

## 5. DTO 与投影

- 行 → DTO 用 `toXxxDto(row, ...extras)`，可选依赖缺省为空/0/null。
- 敏感字段在投影层过滤：公开查询只暴露公开字段，作者/管理员路径走独立投影函数。
- 私密原始字段不能出现在公开响应里，哪怕 schema 类型允许返回 null。

## 6. 错误与鉴权

- 一般错误：`createGraphQLError(message)` from `graphql-yoga`。
- 结构化错误码：`gqlError(code, message)`（定义在 `bug.ts`，可在模块内本地复制）：
  - `VALIDATION_FAILED` / `NOT_FOUND` / `FORBIDDEN` / `UNAUTHORIZED` / `CONFLICT` / `RATE_LIMITED` / `PAYLOAD_TOO_LARGE`
- 领域层抛自定义 Error 时，在 resolver 层捕获并转成 GraphQLError，不要把内部错误泄漏到响应。

## 7. typeDefs 与 codegen

- 改完 typeDefs 跑 `pnpm gen` 重新生成 `apps/web/src/api/gen/*`。
- 生成后**按业务实际消费裁剪字段选择集**：只保留前端真正用到的字段，删掉多余的。
  - Mutation 绝大多数只关心是否成功，按需裁到最小（只留 `id`，或直接把 typeDefs 返回类型改成 `Boolean`），不要返回整个对象。
  - Query 同理按页面实际渲染的字段裁，不要因为生成器展开了全量就默认保留。
- 生成器保留已有操作的手写字段选择；裁剪后再跑 `pnpm gen` 不会覆盖手写部分。
- 新增查询/变更后同步前端 `apps/web/src/api/*.ts` 的薄封装。

## 8. 测试与检查

- Resolver 测试用 `bind(resolvers.Query)`，以 `(args, context)` 调用，`info` 传 `{}`。
- 只跑受影响的测试文件，不要动辄全量。
- 类型检查：`cd apps/server && bun run lint`（`tsc --noEmit`）。
