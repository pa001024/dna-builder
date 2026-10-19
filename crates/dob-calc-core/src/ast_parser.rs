//! 构筑表达式引擎：逐条移植上游 `src/data/ast.ts` 的词法/语法分析，以及
//! `CharBuild.ts` 中 `evaluateAST` → `evaluate` / `evaluateIdentity` /
//! `evaluateMember` / `evaluateCustomFunction` / `mergeTemporaryAttributes` 的求值语义。
//!
//! 对应关系：
//! - `AstNode`              ↔ `ASTNode`（ast.ts 的 7 种节点）
//! - `parse_expression`     ↔ `parseAST`（错误文案逐条一致）
//! - [`evaluate_format`]    ↔ `CharBuild.evaluateExpression`（`{%}` / `{}` 占位符）
//! - [`ExprEnv`]            ↔ `AstEvalContext`（属性 / 技能 / 伤害 / 自定义变量与函数）
//! - [`evaluate_expression`] ↔ `evaluateAST`
//!
//! 语法树只在 Rust 内部使用：Dart 侧只需要表达式字符串与错误文案，
//! 因此 `AstNode` / `parse_expression` 不对外导出，也就无需引入 Freezed。
//!
//! 边界说明：上游把「值从哪来」交给了 `CharBuild` 的整条伤害模型
//! （`getDamage` / `getDef` / 召唤物继承 / DOT / 极性……）。本端口把这部分收敛为
//! 调用方装配的 [`ExprEnv`]：引擎负责语法与求值顺序，取值一律查表。
//! 换来的等价性——上游 `evaluateAST` 的参数（`inputattrs`、`scope`、
//! `temporaryAttributes`）在这里对应 `ExprEnv` 的各张表与 AST 自带的临时属性。
//!
//! 临时属性按上游语义在求值期生效：角色属性按平值加算（`固定攻击`→`攻击`、
//! `固定生命`→`生命`），武器属性按「武器基础属性 × 增量」缩放（见 `weaponAttributeBaseMap`）。

use std::collections::{HashMap, HashSet};

// ============================ AST ============================

/// 表达式语法树；对应 `ast.ts` 的 `ASTNode` 联合类型。
///
/// 对构筑模块（`crate`）开放：上游的伤害求值需要按字段调
/// `getDamage` / `getDef`，无法预先算成静态表，因此构筑侧要走同一棵 AST 自己求值。
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum AstNode {
    /// 数字字面量。
    Number(f64),
    /// 字段引用，如 `[攻击]`、`e::技能伤害`；`force_attr` 为 `!` 后缀。
    Property {
        name: String,
        namespace: Option<String>,
        force_attr: bool,
    },
    /// 函数调用，如 `max(1, 2)`、`e::hp(0.5)`。
    Function {
        name: String,
        namespace: Option<String>,
        args: Vec<AstNode>,
    },
    /// 成员访问，如 `[伤害].暴击`（用于改伤害结算方式）。
    MemberAccess {
        object: Box<AstNode>,
        property: String,
    },
    /// 字段临时属性，如 `[攻击]{增伤:0.2}`。
    TemporaryAttributes {
        target: Box<AstNode>,
        attributes: Vec<(String, AstNode)>,
    },
    /// 二元运算。
    Binary {
        operator: String,
        left: Box<AstNode>,
        right: Box<AstNode>,
    },
    /// 一元运算。
    Unary {
        operator: String,
        argument: Box<AstNode>,
    },
}

// ============================ 词法分析 ============================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TokenKind {
    Number,
    /// 属性名或函数名，含中文与 `[Tag]Name` 形态。
    Identifier,
    /// `+ - * / // %`
    Operator,
    /// `.` 成员访问
    Dot,
    /// `::` 命名空间
    DoubleColon,
    LParen,
    RParen,
    Comma,
    /// 单个 `:`（语法分析阶段会报错提示改用 `::`）
    Colon,
    LBrace,
    RBrace,
    /// `!` 强制属性后缀
    Bang,
    Eof,
}

#[derive(Debug, Clone)]
struct Token {
    kind: TokenKind,
    value: String,
}

/// 宏替换的最大展开次数。上游把替换文本插回输入流后递归扫描，
/// 自引用宏会一直递归到栈溢出；这里用一个上限把它变成可报错的边界。
const MAX_MACRO_EXPANSIONS: usize = 64;

/// 标识符首字符集合：`[a-zA-Z_\u4e00-\u9fa5·[]`
fn is_identifier_start(c: char) -> bool {
    c.is_ascii_alphabetic() || c == '_' || is_cjk(c) || c == '·' || c == '['
}

/// 标识符后续字符集合：`[a-zA-Z0-9_\u4e00-\u9fa5·[\]]`
fn is_identifier_part(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || is_cjk(c) || c == '·' || c == '[' || c == ']'
}

fn is_cjk(c: char) -> bool {
    ('\u{4e00}'..='\u{9fa5}').contains(&c)
}

/// 词法分析器；对应 `ast.ts` 的 `Tokenizer`。
struct Tokenizer<'m> {
    input: Vec<char>,
    position: usize,
    macros: &'m HashMap<String, String>,
    expansions: usize,
}

impl<'m> Tokenizer<'m> {
    fn new(input: &str, macros: &'m HashMap<String, String>) -> Self {
        Self {
            input: input.chars().collect(),
            position: 0,
            macros,
            expansions: 0,
        }
    }

    fn skip_whitespace(&mut self) {
        while self.position < self.input.len() && self.input[self.position].is_whitespace() {
            self.position += 1;
        }
    }

    fn next_token(&mut self) -> Result<Token, String> {
        self.skip_whitespace();
        if self.position >= self.input.len() {
            return Ok(Token {
                kind: TokenKind::Eof,
                value: String::new(),
            });
        }

        let ch = self.input[self.position];

        // 数字：连续的数字与小数点
        if ch.is_ascii_digit() {
            let start = self.position;
            while self.position < self.input.len()
                && (self.input[self.position].is_ascii_digit() || self.input[self.position] == '.')
            {
                self.position += 1;
            }
            return Ok(Token {
                kind: TokenKind::Number,
                value: self.input[start..self.position].iter().collect(),
            });
        }

        // 标识符（属性名或函数名）
        if is_identifier_start(ch) {
            let start = self.position;
            while self.position < self.input.len() && is_identifier_part(self.input[self.position])
            {
                self.position += 1;
            }
            let value: String = self.input[start..self.position].iter().collect();

            // 宏定义按标识符整体精准匹配：把替换文本插回输入流，再从同一位置重扫
            if let Some(replacement) = self.macros.get(&value).cloned() {
                self.expansions += 1;
                if self.expansions > MAX_MACRO_EXPANSIONS {
                    return Err(format!(
                        "宏 '{}' 替换次数超过上限 {}",
                        value, MAX_MACRO_EXPANSIONS
                    ));
                }
                self.input.splice(start..self.position, replacement.chars());
                self.position = start;
                return self.next_token();
            }

            return Ok(Token {
                kind: TokenKind::Identifier,
                value,
            });
        }

        // 运算符
        if ch == '/' {
            if self.position + 1 < self.input.len() && self.input[self.position + 1] == '/' {
                self.position += 2;
                return Ok(Token {
                    kind: TokenKind::Operator,
                    value: "//".to_string(),
                });
            }
            self.position += 1;
            return Ok(Token {
                kind: TokenKind::Operator,
                value: "/".to_string(),
            });
        }
        if ch == '%' || ch == '+' || ch == '-' || ch == '*' {
            self.position += 1;
            return Ok(Token {
                kind: TokenKind::Operator,
                value: ch.to_string(),
            });
        }

        // 标点
        if ch == '.' {
            self.position += 1;
            return Ok(Token {
                kind: TokenKind::Dot,
                value: ".".to_string(),
            });
        }
        if ch == ':' {
            if self.position + 1 < self.input.len() && self.input[self.position + 1] == ':' {
                self.position += 2;
                return Ok(Token {
                    kind: TokenKind::DoubleColon,
                    value: "::".to_string(),
                });
            }
            self.position += 1;
            return Ok(Token {
                kind: TokenKind::Colon,
                value: ":".to_string(),
            });
        }
        if ch == '(' {
            self.position += 1;
            return Ok(Token {
                kind: TokenKind::LParen,
                value: "(".to_string(),
            });
        }
        if ch == ')' {
            self.position += 1;
            return Ok(Token {
                kind: TokenKind::RParen,
                value: ")".to_string(),
            });
        }
        if ch == ',' {
            self.position += 1;
            return Ok(Token {
                kind: TokenKind::Comma,
                value: ",".to_string(),
            });
        }
        if ch == '{' {
            self.position += 1;
            return Ok(Token {
                kind: TokenKind::LBrace,
                value: "{".to_string(),
            });
        }
        if ch == '}' {
            self.position += 1;
            return Ok(Token {
                kind: TokenKind::RBrace,
                value: "}".to_string(),
            });
        }
        if ch == '!' {
            self.position += 1;
            return Ok(Token {
                kind: TokenKind::Bang,
                value: "!".to_string(),
            });
        }

        Err(format!("未知字符 '{}' 位于位置 {}", ch, self.position))
    }
}

// ============================ 语法分析 ============================

/// 语法分析器；对应 `ast.ts` 的 `Parser`。
struct Parser {
    tokens: Vec<Token>,
    current: usize,
}

impl Parser {
    fn new(input: &str, macros: &HashMap<String, String>) -> Result<Self, String> {
        let mut tokenizer = Tokenizer::new(input, macros);
        let mut tokens = Vec::new();
        loop {
            let token = tokenizer.next_token()?;
            if token.kind == TokenKind::Eof {
                break;
            }
            tokens.push(token);
        }
        Ok(Self { tokens, current: 0 })
    }

    fn parse(&mut self) -> Result<AstNode, String> {
        if self.tokens.is_empty() {
            return Err("表达式为空".to_string());
        }
        let ast = self.parse_expression()?;
        if self.current < self.tokens.len() {
            if self.check(TokenKind::Colon) {
                return Err("单个冒号 ':' 不支持,请使用 '::' 进行命名空间访问".to_string());
            }
            return Err(format!("表达式末尾发现意外的标记 '{}'", self.peek_value()));
        }
        Ok(ast)
    }

    /// 表达式：`Term { (+|-) Term }`
    fn parse_expression(&mut self) -> Result<AstNode, String> {
        crate::prof!("ast_parser::parse_expression");
        let mut left = self.parse_term()?;
        loop {
            let operator = if self.match_operator("+") {
                "+"
            } else if self.match_operator("-") {
                "-"
            } else {
                break;
            };
            if self.operand_missing() {
                return Err(format!("运算符 '{}' 后缺少操作数", operator));
            }
            let right = self.parse_term()?;
            left = AstNode::Binary {
                operator: operator.to_string(),
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    /// 项：`Unary { (*|/|//|%) Unary }`
    fn parse_term(&mut self) -> Result<AstNode, String> {
        let mut left = self.parse_unary()?;
        loop {
            let operator = if self.match_operator("*") {
                "*"
            } else if self.match_operator("/") {
                "/"
            } else if self.match_operator("//") {
                "//"
            } else if self.match_operator("%") {
                "%"
            } else {
                break;
            };
            if self.operand_missing() {
                return Err(format!("运算符 '{}' 后缺少操作数", operator));
            }
            let right = self.parse_unary()?;
            left = AstNode::Binary {
                operator: operator.to_string(),
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn operand_missing(&self) -> bool {
        self.is_at_end()
            || self.check(TokenKind::Operator)
            || self.check(TokenKind::RParen)
            || self.check(TokenKind::Comma)
    }

    /// 一元运算：`- Unary | + Unary | Factor`
    fn parse_unary(&mut self) -> Result<AstNode, String> {
        if self.match_operator("-") || self.match_operator("+") {
            let operator = self.previous_value();
            let argument = self.parse_unary()?;
            return Ok(AstNode::Unary {
                operator,
                argument: Box::new(argument),
            });
        }
        self.parse_factor()
    }

    /// 因子：`(Expression) | Number | Identifier(Call/Prop)`
    /// 随后接 `::Identifier` / `.Identifier` / `{属性:表达式}` 后缀链。
    fn parse_factor(&mut self) -> Result<AstNode, String> {
        let mut node: AstNode;

        if self.match_kind(TokenKind::Number) {
            let raw = self.previous_value();
            // 上游用 parseFloat，非法字面量（如单个 "."）得到 NaN
            node = AstNode::Number(raw.parse::<f64>().unwrap_or(f64::NAN));
        } else if self.match_kind(TokenKind::Identifier) {
            let name = self.previous_value();
            if self.match_kind(TokenKind::DoubleColon) {
                let actual = self
                    .consume(TokenKind::Identifier, "命名空间 '::' 后缺少标识符")?
                    .value;
                if self.match_kind(TokenKind::LParen) {
                    let args = self.parse_arguments()?;
                    node = AstNode::Function {
                        name: actual,
                        namespace: Some(name),
                        args,
                    };
                } else {
                    node = self.apply_force_attr(AstNode::Property {
                        name: actual,
                        namespace: Some(name),
                        force_attr: false,
                    });
                }
            } else if self.match_kind(TokenKind::LParen) {
                let args = self.parse_arguments()?;
                node = AstNode::Function {
                    name,
                    namespace: None,
                    args,
                };
            } else {
                node = self.apply_force_attr(AstNode::Property {
                    name,
                    namespace: None,
                    force_attr: false,
                });
            }
        } else if self.match_kind(TokenKind::LParen) {
            let expression = self.parse_expression()?;
            self.consume(TokenKind::RParen, "表达式后缺少 ')'")?;
            node = expression;
        } else {
            return Err(format!("意外的标记: {}", self.peek_value()));
        }

        // 成员访问与临时属性后缀链，例如 [攻击]{增伤:0.1}.暴击
        loop {
            if self.match_kind(TokenKind::Dot) {
                let property = self
                    .consume(TokenKind::Identifier, "成员访问 '.' 后缺少属性名称")?
                    .value;
                node = AstNode::MemberAccess {
                    object: Box::new(node),
                    property,
                };
                continue;
            }
            if self.match_kind(TokenKind::LBrace) {
                if !matches!(
                    node,
                    AstNode::Property { .. }
                        | AstNode::MemberAccess { .. }
                        | AstNode::TemporaryAttributes { .. }
                ) {
                    return Err("临时属性只能应用于字段".to_string());
                }
                if self.check(TokenKind::RBrace) {
                    return Err("临时属性不能为空".to_string());
                }
                let mut attributes: Vec<(String, AstNode)> = Vec::new();
                let mut names: HashSet<String> = HashSet::new();
                loop {
                    let attribute = self
                        .consume(TokenKind::Identifier, "临时属性缺少属性名")?
                        .value;
                    self.consume(
                        TokenKind::Colon,
                        &format!("临时属性 '{}' 后缺少 ':'", attribute),
                    )?;
                    if !names.insert(attribute.clone()) {
                        return Err(format!("临时属性 '{}' 重复", attribute));
                    }
                    let value = self.parse_expression()?;
                    attributes.push((attribute, value));
                    if !self.match_kind(TokenKind::Comma) {
                        break;
                    }
                }
                self.consume(TokenKind::RBrace, "临时属性后缺少 '}'")?;
                node = AstNode::TemporaryAttributes {
                    target: Box::new(node),
                    attributes,
                };
                continue;
            }
            break;
        }

        Ok(node)
    }

    fn parse_arguments(&mut self) -> Result<Vec<AstNode>, String> {
        let mut args = Vec::new();
        if !self.check(TokenKind::RParen) {
            loop {
                args.push(self.parse_expression()?);
                if !self.match_kind(TokenKind::Comma) {
                    break;
                }
            }
        }
        self.consume(TokenKind::RParen, "函数参数后缺少 ')'")?;
        Ok(args)
    }

    /// `!` 后缀：把字段标记为强制按属性值解析。
    fn apply_force_attr(&mut self, node: AstNode) -> AstNode {
        let AstNode::Property {
            name, namespace, ..
        } = node
        else {
            return node;
        };
        let force_attr = self.match_kind(TokenKind::Bang);
        AstNode::Property {
            name,
            namespace,
            force_attr,
        }
    }

    fn check(&self, kind: TokenKind) -> bool {
        self.peek().map(|token| token.kind == kind).unwrap_or(false)
    }

    fn check_operator(&self, value: &str) -> bool {
        self.peek()
            .map(|token| token.kind == TokenKind::Operator && token.value == value)
            .unwrap_or(false)
    }

    fn is_at_end(&self) -> bool {
        self.current >= self.tokens.len()
    }

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.current)
    }

    fn peek_value(&self) -> String {
        self.peek()
            .map(|token| token.value.clone())
            .unwrap_or_default()
    }

    fn previous_value(&self) -> String {
        if self.current == 0 {
            String::new()
        } else {
            self.tokens
                .get(self.current - 1)
                .map(|token| token.value.clone())
                .unwrap_or_default()
        }
    }

    fn advance(&mut self) {
        if !self.is_at_end() {
            self.current += 1;
        }
    }

    fn match_kind(&mut self, kind: TokenKind) -> bool {
        if self.check(kind) {
            self.advance();
            true
        } else {
            false
        }
    }

    fn match_operator(&mut self, value: &str) -> bool {
        if self.check_operator(value) {
            self.advance();
            true
        } else {
            false
        }
    }

    fn consume(&mut self, kind: TokenKind, message: &str) -> Result<Token, String> {
        if self.check(kind) {
            let token = self.peek().cloned().unwrap_or(Token {
                kind: TokenKind::Eof,
                value: String::new(),
            });
            self.advance();
            Ok(token)
        } else {
            Err(message.to_string())
        }
    }
}

/// 解析表达式；对应 `parseAST`。仅在 Rust 内部使用（Dart 侧只拿求值结果与错误文案）。
pub(crate) fn parse_expression(
    input: &str,
    macros: &HashMap<String, String>,
) -> Result<AstNode, String> {
    Parser::new(input, macros)?.parse()
}

/// `weaponAttributeBaseMap`：武器属性 → 该武器的基础属性名。
pub(crate) fn weapon_attribute_base(name: &str) -> Option<&'static str> {
    match name {
        "攻击" => Some("基础攻击"),
        "暴击" => Some("基础暴击"),
        "暴伤" => Some("基础暴伤"),
        "触发" => Some("基础触发"),
        "攻速" => Some("射速"),
        "装填" => Some("基础装填"),
        "弹匣" => Some("基础弹匣"),
        "弹药" => Some("基础弹药"),
        _ => None,
    }
}

/// `temporaryFlatAttributeMap`：临时属性里按平值折叠进基础属性的映射。
///
/// 上游的临时属性名是 `CharAttr`/`WeaponAttr` 的平面键名（如 `攻击`），
/// 而表达式字段名带方括号（如 `[攻击]`），两者靠本节的两个辅助函数打通。
pub(crate) fn temporary_flat_attribute(name: &str) -> &str {
    match name {
        "固定攻击" => "攻击",
        "固定生命" => "生命",
        other => other,
    }
}

/// 平面属性名 → 表达式字段名（`攻击` → `[攻击]`）；已是字段名时原样返回。
pub(crate) fn attribute_field_name(name: &str) -> String {
    if name.starts_with('[') {
        name.to_string()
    } else {
        format!("[{}]", name)
    }
}

/// 去掉字段名的方括号（`[攻击]` → `攻击`）。
pub(crate) fn strip_brackets(name: &str) -> &str {
    name.strip_prefix('[')
        .and_then(|rest| rest.strip_suffix(']'))
        .unwrap_or(name)
}

/// 判断平面属性名与表达式字段名是否指向同一属性（`攻击` ↔ `[攻击]`）。
pub(crate) fn attribute_matches(plain: &str, field: &str) -> bool {
    plain == field || attribute_field_name(plain) == field
}

#[cfg(test)]
mod tests {
    use super::*;

    fn number(value: f64) -> AstNode {
        AstNode::Number(value)
    }

    #[test]
    fn parses_precedence_and_parens() {
        // 10 + 4 * 5 = 30
        let ast = parse_expression("10 + 4 * 5", &HashMap::new()).unwrap();
        assert_eq!(
            ast,
            AstNode::Binary {
                operator: "+".to_string(),
                left: Box::new(number(10.0)),
                right: Box::new(AstNode::Binary {
                    operator: "*".to_string(),
                    left: Box::new(number(4.0)),
                    right: Box::new(number(5.0)),
                }),
            }
        );
    }

    #[test]
    fn parses_namespace_force_attr_and_member() {
        let ast = parse_expression("e::[技能伤害]!.暴击", &HashMap::new()).unwrap();
        assert_eq!(
            ast,
            AstNode::MemberAccess {
                object: Box::new(AstNode::Property {
                    name: "[技能伤害]".to_string(),
                    namespace: Some("e".to_string()),
                    force_attr: true,
                }),
                property: "暴击".to_string(),
            }
        );
    }

    #[test]
    fn parses_temporary_attributes() {
        let ast = parse_expression("[攻击]{增伤:0.2}", &HashMap::new()).unwrap();
        assert!(matches!(ast, AstNode::TemporaryAttributes { .. }));
    }

    #[test]
    fn reports_upstream_parse_errors() {
        // `[`/`]` 是标识符字符（`ast.ts:110-115`）：未闭合方括号仍是合法标识符。
        assert!(parse_expression("[攻击", &HashMap::new()).is_ok());
        assert!(parse_expression("", &HashMap::new()).is_err());
        assert!(parse_expression("10+", &HashMap::new()).is_err());
        assert!(parse_expression("(1+2", &HashMap::new()).is_err());
        assert!(parse_expression("伤害{", &HashMap::new()).is_err());
        assert!(parse_expression("a::", &HashMap::new()).is_err());
    }

    #[test]
    fn tokenizer_expands_macros() {
        let mut macros = HashMap::new();
        macros.insert("DPH".to_string(), "[伤害]".to_string());
        let ast = parse_expression("DPH", &macros).unwrap();
        assert!(matches!(ast, AstNode::Property { .. }));
    }
}
