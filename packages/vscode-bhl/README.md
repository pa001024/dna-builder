# BHL Language for VS Code

为 `.bhl`（BuildHub Language，`crates/buildhub-core` 的规则语言）提供语法高亮与基础编辑配置。

纯声明式扩展：TextMate 语法 + `language-configuration.json`，**无需构建、无运行时依赖**。
语法口径对齐 `specs/buildhub-core.md` §3.3 与 `crates/buildhub-core/src/lexer.rs` / `parser.rs`。

## 安装

### 方式一：打包为 VSIX（推荐）

```bash
cd packages/vscode-bhl
pnpm run package
```

`package` 脚本等价于 `pnpm dlx @vscode/vsce package --no-dependencies`。
**必须带 `--no-dependencies`**：本目录是 workspace 成员（根 `package.json` 的
`workspaces` 含 `packages/*`），vsce 默认执行 `npm list --production --parseable`
做依赖探测，在成员目录里返回的是**仓库根目录**，会把整个仓库打进 VSIX。

生成 `bhl-language-0.1.0.vsix` 后，在 VS Code 中执行
`Ctrl+Shift+P` → `Extensions: Install from VSIX...` → 选择该文件。

### 方式二：扩展开发宿主（改语法时调试）

用 VS Code 直接打开 `packages/vscode-bhl` 目录，按 `F5`
（`.vscode/launch.json` 已配置），在新窗口打开任意 `.bhl` 文件即可。

修改 `syntaxes/bhl.tmLanguage.json` 后，在开发宿主窗口执行
`Developer: Reload Window` 即可看到效果。

## 覆盖的语法

| 类别 | 示例 |
|---|---|
| 行注释 | `// ...`、`# ...` |
| 符号字面量 | `sym"雷属性攻击"`、`named"..."`（前缀与内容分开着色） |
| 字符串 | `"lib/stack.bhl"`，含 `\n \t \r \" \\` 转义 |
| 数字 | `0.0`、`48.5`、`48.5e-2` |
| 声明关键字 | `module`、`import`、`from`、`schema`、`type`、`fn`、`const` |
| 控制关键字 | `if`、`then`、`else`、`match`、`let`、`in`、`not` |
| 构造器 / 常量 | `some`、`none`、`ok`、`err`、`true`、`false`、`inf`、`nan` |
| 类型 | `Num`、`Bool`、`Sym`、`Unit`、`Str`、`List<T>`、`Option<T>`、`Result<T,E>`、`Record{..open}`，以及 `schema` 声明名 |
| 内建函数 | `len`、`at`、`field`、`update`、`fold`、`map`、`filter`、`fix`、`choice`、`expected` 等（`builtins.rs` 全部内建） |
| 记录字段 / 访问 | `加成: Num`、`m.系列`、`c.char_id` |
| 开放记录 | `..open`、`..` |
| 运算符 | `->`、`=>`、`==`、`!=`、`<=`、`>=`、`&&`、`\|\|`、`+ - * / % < > =`、`\|`（lambda / pipe） |
| 通配符 | `_` |

> BHL 的 `//` 是**行注释**而不是整除运算符（与 `lexer.rs` 的 `skip_trivia` 一致）；
> pipe 运算符是单个 `|`（不是 `|>`）。

## 自定义配色

语法输出的都是标准 TextMate scope，任意主题都能直接覆盖。需要额外调整时可参考：

| scope | 含义 |
|---|---|
| `comment.line.double-slash.bhl` / `comment.line.number-sign.bhl` | 行注释 |
| `keyword.other.symbol-literal.bhl` | `sym` / `named` 前缀 |
| `string.quoted.symbol.bhl` | 符号字面量内容 |
| `string.quoted.double.bhl` | 字符串内容 |
| `constant.numeric.bhl` | 数字 |
| `keyword.other.declaration.bhl` | 声明关键字 |
| `keyword.control.bhl` | 控制关键字 |
| `keyword.other.constructor.bhl` | `some` / `ok` / `err` |
| `constant.language.bhl` | `true` / `false` / `none` / `inf` / `nan` |
| `entity.name.type.bhl` | 类型名 |
| `entity.name.function.bhl` | `fn` 声明名 |
| `entity.name.namespace.bhl` | `module` / `import` 别名 |
| `support.function.bhl` | 内建函数 |
| `variable.other.key.bhl` | 记录字段名 / 参数名（`name:` 形式） |
| `variable.other.member.bhl` | `.` 后的成员 |
| `punctuation.accessor.bhl` | 成员访问的 `.` |
| `punctuation.definition.open-record.bhl` | `..` |
| `keyword.other.open.bhl` | `..` 后的 `open` |
| `keyword.operator.bhl` | 运算符 |
| `variable.language.wildcard.bhl` | `_` |

## 目录

```
packages/vscode-bhl/
├── package.json                 # 语言 / 语法贡献点
├── language-configuration.json  # 注释、括号、自动闭合、wordPattern
├── syntaxes/bhl.tmLanguage.json # TextMate 语法
├── test/fixture.bhl             # 覆盖全部语法的示例文件
└── .vscode/launch.json          # F5 调试扩展
```
