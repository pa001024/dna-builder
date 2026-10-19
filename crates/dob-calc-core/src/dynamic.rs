//! BUFF 动态属性（`code` 字段）的解释器。
//!
//! 数据包里有一批 BUFF 的 `code` 是一段 JS 片段，形如：
//!
//! ```js
//! if(weaponAttr) weaponAttr.追加伤害 *= enemy.等级<200 ? 1 : 1/(1+(enemy.等级-190)*0.05)
//! var c=char.基础攻击*(1+charMods.攻击)*(1+属性攻击), t=Math.floor(Math.min(攻击,c)/100); if(t>0){生命+=t*1000;攻击-=t*100}
//! if(技能范围>1)技能威力+=技能范围-1,技能范围=1
//! 召唤物独立增伤=(1+召唤物独立增伤)*(1+Math.max(0,召唤物攻击速度))-1
//! ```
//!
//! 上游用 `new Function("attr", "with(attr){…;return attr}")` 跑在浏览器里。
//! App 侧不可能内嵌 JS 引擎（体积 + 平台风险），但**不能**简单跳过——
//! 这些 BUFF 真实影响数字（如「权火将熄5熔」给同律武器加暴击/暴伤/触发、
//! 「法露茜Q」把攻击转化为生命）。因此这里实现一个覆盖数据实际用法的子集解释器：
//!
//! - 语句：`var a=1,b=2`（多声明）、`if(…) 语句`、`if(…){…}`、`if…else …`、`return`、表达式语句；
//! - 表达式：`a = b` / `a += b` 等赋值、逗号序列 `a+=1,b=2`（值为最后一项、副作用按序发生）、
//!   三元 `? :`、比较、`&&` / `||`、一元 `! - +`、`Math.min/max/floor/ceil/round/abs`、
//!   成员访问 `a.b`；
//! - 对象：`char` / `weapon` / `meleeWeapon` / `rangedWeapon` / `skillWeapon`（只读基础值），
//!   `weaponAttr` / `meleeWeaponAttr` / `rangedWeaponAttr` / `skillWeaponAttr`（可写武器面板），
//!   `charMods` / `meleeMods` / `rangedMods` / `skillMods`（只读 MOD 词条），`enemy`（只读）。
//!
//! 三处必须与 JS 语义严格一致的细节（否则数字会偏）：
//! 1. **未定义的标识符读作 0**（上游用 Proxy 把未配置词条兜成 0，避免 `NaN` 污染整段计算）；
//! 2. **`||` / `&&` 返回操作数本身而不是布尔值**，即 `(1+暴击)||0` 在暴击为 0 时给 1、为 0.5 时给 1.5；
//! 3. 对属性名的裸赋值（`生命 += …`）与对面板成员的赋值（`weaponAttr.追加伤害 *= …`）
//!    都要**回写**到对应表，后续语句与整场计算都能看到。

use std::collections::HashMap;
use std::sync::Arc;

use super::models::AttrMap;

/// `code` 的执行环境：一张可读写的属性视图 + 若干子对象。
///
/// 子对象表用 `Arc` 共享（写时复制）：同一条 `code` 链上的 `bases` / `mod_attrs`
/// 通常只读，逐条 code 传递不再复制整表。
pub struct CodeEnv<'a> {
    /// 角色属性（裸标识符赋值写这里）。
    pub attrs: &'a mut AttrMap,
    /// 武器 / 同律武器面板（`weaponAttr` / `meleeWeaponAttr` …），可写。
    pub field_attrs: Arc<HashMap<String, AttrMap>>,
    /// 只读基础值子对象（`char` / `weapon` / `meleeWeapon` / …）。
    pub bases: Arc<HashMap<String, AttrMap>>,
    /// 各槽位 MOD 词条（`charMods` / `meleeMods` / …），只读。
    pub mod_attrs: Arc<HashMap<String, AttrMap>>,
    /// 目标怪物（`enemy`），只读。
    pub enemy: AttrMap,
}

/// 执行结果。
#[derive(Debug, Clone, Default)]
pub struct CodeOutcome {
    /// 是否执行成功。
    pub ok: bool,
    /// 失败原因（供排查；调用方据此决定是否记日志）。
    pub error: Option<String>,
}

/// 解析结果缓存（同一 `code` 只解析一次；超上限整体清空）。
type ParsedCache = std::cell::RefCell<HashMap<String, std::rc::Rc<Result<Vec<Statement>, String>>>>;

/// 执行一段 `code`；对应上游 `LeveledBuff.applyDynamicAttr` 的可变部分。
pub fn run_code(code: &str, env: &mut CodeEnv<'_>) -> CodeOutcome {
    crate::prof!("dynamic::run_code");
    thread_local! {
        static PARSED: ParsedCache = std::cell::RefCell::new(HashMap::new());
    }
    let parsed = PARSED.with(|cache| {
        if let Some(found) = cache.borrow().get(code) {
            return found.clone();
        }
        let parsed = std::rc::Rc::new(parse_statements(code));
        let mut cache = cache.borrow_mut();
        if cache.len() >= 4096 {
            cache.clear();
        }
        cache.insert(code.to_string(), parsed.clone());
        parsed
    });
    let statements = match parsed.as_ref() {
        Ok(statements) => statements,
        Err(error) => {
            return CodeOutcome {
                ok: false,
                error: Some(error.clone()),
            };
        }
    };
    let mut scope: HashMap<String, f64> = HashMap::new();
    match exec_statements(statements, env, &mut scope) {
        Ok(()) => CodeOutcome {
            ok: true,
            error: None,
        },
        Err(error) => CodeOutcome {
            ok: false,
            error: Some(error),
        },
    }
}

// ============================ 语法树 ============================

#[derive(Debug, Clone)]
enum Statement {
    /// `var a = expr, b = expr`（每项按声明顺序求值）
    Var(Vec<(String, Expr)>),
    If {
        condition: Expr,
        then: Vec<Statement>,
        otherwise: Vec<Statement>,
    },
    Return(Expr),
    Expression(Expr),
}

#[derive(Debug, Clone)]
enum Expr {
    Number(f64),
    Ident(String),
    Member(Box<Expr>, String),
    /// 赋值；`operator` 为 `=` / `+=` / `-=` / `*=` / `/=`
    Assign {
        target: Box<Expr>,
        operator: String,
        value: Box<Expr>,
    },
    /// 逗号序列：全部求值，取最后一项的值
    Sequence(Vec<Expr>),
    Binary {
        operator: String,
        left: Box<Expr>,
        right: Box<Expr>,
    },
    Unary {
        operator: String,
        argument: Box<Expr>,
    },
    Ternary {
        condition: Box<Expr>,
        then: Box<Expr>,
        otherwise: Box<Expr>,
    },
    Call {
        name: String,
        args: Vec<Expr>,
    },
}

// ============================ 语法分析 ============================

fn parse_statements(input: &str) -> Result<Vec<Statement>, String> {
    crate::prof!("dynamic::parse_statements");
    let mut parser = CodeParser::new(input);
    let mut statements = Vec::new();
    loop {
        parser.skip_separators();
        if parser.is_eof() {
            break;
        }
        statements.push(parser.statement()?);
    }
    Ok(statements)
}

struct CodeParser {
    chars: Vec<char>,
    position: usize,
}

impl CodeParser {
    fn new(source: &str) -> Self {
        Self {
            chars: source.chars().collect(),
            position: 0,
        }
    }

    fn is_eof(&self) -> bool {
        self.position >= self.chars.len()
    }

    fn peek_char(&self) -> Option<char> {
        self.chars.get(self.position).copied()
    }

    fn peek_at(&self, offset: usize) -> Option<char> {
        self.chars.get(self.position + offset).copied()
    }

    fn advance(&mut self) -> Option<char> {
        let value = self.peek_char();
        if value.is_some() {
            self.position += 1;
        }
        value
    }

    fn skip_whitespace(&mut self) {
        while let Some(ch) = self.peek_char() {
            if ch.is_whitespace() {
                self.position += 1;
            } else {
                break;
            }
        }
    }

    /// 跳过空白与分号（JS 里空语句是合法的）。
    fn skip_separators(&mut self) {
        loop {
            self.skip_whitespace();
            if self.peek_char() == Some(';') {
                self.position += 1;
                continue;
            }
            break;
        }
    }

    /// 试探性匹配关键字（后面必须不是标识符字符，避免把 `iff` 当 `if`）。
    fn starts_with(&self, keyword: &str) -> bool {
        if !self.matches_prefix(keyword) {
            return false;
        }
        match self.chars.get(self.position + keyword.chars().count()) {
            Some(next) => !is_ident_char(*next),
            None => true,
        }
    }

    /// 纯前缀匹配，**不做**「后一个字符不是标识符」的约束。
    ///
    /// 运算符必须用这个：`x*=enemy.等级` 里 `*=` 后面紧跟标识符，
    /// 用 [Self::starts_with] 会误判成「不匹配」而把 `*` 交给上层报错。
    fn matches_prefix(&self, keyword: &str) -> bool {
        let count = keyword.chars().count();
        if self.position + count > self.chars.len() {
            return false;
        }
        for (offset, ch) in keyword.chars().enumerate() {
            if self.chars[self.position + offset] != ch {
                return false;
            }
        }
        true
    }

    fn consume(&mut self, keyword: &str) {
        self.position += keyword.chars().count();
    }

    fn statement(&mut self) -> Result<Statement, String> {
        self.skip_whitespace();
        if self.starts_with("var") {
            self.consume("var");
            let mut declarations = Vec::new();
            loop {
                self.skip_whitespace();
                let name = self.identifier()?;
                self.skip_whitespace();
                if self.peek_char() != Some('=') || self.peek_at(1) == Some('=') {
                    return Err(format!("var {} 缺少 =", name));
                }
                self.advance();
                // 声明项的右值不含逗号序列（逗号是声明分隔符）
                let value = self.assignment()?;
                declarations.push((name, value));
                self.skip_whitespace();
                if self.peek_char() == Some(',') {
                    self.advance();
                    continue;
                }
                break;
            }
            return Ok(Statement::Var(declarations));
        }
        if self.starts_with("return") {
            self.consume("return");
            let value = self.expression()?;
            return Ok(Statement::Return(value));
        }
        if self.starts_with("if") {
            self.consume("if");
            self.skip_whitespace();
            if self.peek_char() != Some('(') {
                return Err("if 缺少 (".to_string());
            }
            self.advance();
            let condition = self.expression()?;
            self.skip_whitespace();
            if self.peek_char() != Some(')') {
                return Err("if 缺少 )".to_string());
            }
            self.advance();
            let then = self.block_or_statement()?;
            // `then` 与 `else` 之间可能有分号（`if(…)a+=1; else if(…)`）
            self.skip_separators();
            let otherwise = if self.starts_with("else") {
                self.consume("else");
                self.block_or_statement()?
            } else {
                Vec::new()
            };
            return Ok(Statement::If {
                condition,
                then,
                otherwise,
            });
        }
        Ok(Statement::Expression(self.expression()?))
    }

    fn block_or_statement(&mut self) -> Result<Vec<Statement>, String> {
        self.skip_whitespace();
        if self.peek_char() == Some('{') {
            self.advance();
            let mut statements = Vec::new();
            loop {
                self.skip_separators();
                match self.peek_char() {
                    Some('}') => {
                        self.advance();
                        break;
                    }
                    None => return Err("语句块缺少 }".to_string()),
                    _ => statements.push(self.statement()?),
                }
            }
            return Ok(statements);
        }
        Ok(vec![self.statement()?])
    }

    fn identifier(&mut self) -> Result<String, String> {
        self.skip_whitespace();
        let mut name = String::new();
        while let Some(ch) = self.peek_char() {
            if is_ident_char(ch) {
                name.push(ch);
                self.advance();
            } else {
                break;
            }
        }
        if name.is_empty() {
            Err(format!("位置 {} 处缺少标识符", self.position))
        } else {
            Ok(name)
        }
    }

    /// 表达式（含逗号序列，值与副作用同 JS）。
    fn expression(&mut self) -> Result<Expr, String> {
        let first = self.assignment()?;
        self.skip_whitespace();
        if self.peek_char() != Some(',') {
            return Ok(first);
        }
        let mut items = vec![first];
        while self.peek_char() == Some(',') {
            self.advance();
            items.push(self.assignment()?);
            self.skip_whitespace();
        }
        Ok(Expr::Sequence(items))
    }

    /// 赋值表达式（右结合）。
    fn assignment(&mut self) -> Result<Expr, String> {
        let left = self.ternary()?;
        self.skip_whitespace();
        // 长的运算符优先，避免把 `==` 当成 `=`
        let operator = if self.matches_prefix("+=") {
            Some("+=")
        } else if self.matches_prefix("-=") {
            Some("-=")
        } else if self.matches_prefix("*=") {
            Some("*=")
        } else if self.matches_prefix("/=") {
            Some("/=")
        } else if self.peek_char() == Some('=') && self.peek_at(1) != Some('=') {
            Some("=")
        } else {
            None
        };
        let Some(operator) = operator else {
            return Ok(left);
        };
        self.consume(operator);
        let value = self.assignment()?;
        Ok(Expr::Assign {
            target: Box::new(left),
            operator: operator.to_string(),
            value: Box::new(value),
        })
    }

    fn ternary(&mut self) -> Result<Expr, String> {
        let condition = self.logical_or()?;
        self.skip_whitespace();
        if self.peek_char() != Some('?') {
            return Ok(condition);
        }
        self.advance();
        let then = self.assignment()?;
        self.skip_whitespace();
        if self.peek_char() != Some(':') {
            return Err("三元表达式缺少 :".to_string());
        }
        self.advance();
        let otherwise = self.assignment()?;
        Ok(Expr::Ternary {
            condition: Box::new(condition),
            then: Box::new(then),
            otherwise: Box::new(otherwise),
        })
    }

    fn logical_or(&mut self) -> Result<Expr, String> {
        let mut left = self.logical_and()?;
        loop {
            self.skip_whitespace();
            if self.peek_char() == Some('|') && self.peek_at(1) == Some('|') {
                self.advance();
                self.advance();
                let right = self.logical_and()?;
                left = Expr::Binary {
                    operator: "||".to_string(),
                    left: Box::new(left),
                    right: Box::new(right),
                };
            } else {
                return Ok(left);
            }
        }
    }

    fn logical_and(&mut self) -> Result<Expr, String> {
        let mut left = self.comparison()?;
        loop {
            self.skip_whitespace();
            if self.peek_char() == Some('&') && self.peek_at(1) == Some('&') {
                self.advance();
                self.advance();
                let right = self.comparison()?;
                left = Expr::Binary {
                    operator: "&&".to_string(),
                    left: Box::new(left),
                    right: Box::new(right),
                };
            } else {
                return Ok(left);
            }
        }
    }

    fn comparison(&mut self) -> Result<Expr, String> {
        let mut left = self.additive()?;
        loop {
            self.skip_whitespace();
            // 三字符优先，否则 `!==` 会被读成 `!=` + `=`
            let operator = if self.matches_prefix("!==") {
                "!="
            } else if self.matches_prefix("===") {
                "=="
            } else if self.matches_prefix("!=") {
                "!="
            } else if self.matches_prefix("==") {
                "=="
            } else if self.matches_prefix("<=") {
                "<="
            } else if self.matches_prefix(">=") {
                ">="
            } else if self.peek_char() == Some('<') {
                "<"
            } else if self.peek_char() == Some('>') {
                ">"
            } else {
                return Ok(left);
            };
            self.consume(operator);
            let right = self.additive()?;
            left = Expr::Binary {
                operator: operator.to_string(),
                left: Box::new(left),
                right: Box::new(right),
            };
        }
    }

    fn additive(&mut self) -> Result<Expr, String> {
        let mut left = self.multiplicative()?;
        loop {
            self.skip_whitespace();
            let operator = match self.peek_char() {
                // `+=` / `++` 不是二元加，遇到就停下交给上层（赋值 / 报错）
                Some('+') if self.peek_at(1) != Some('+') && self.peek_at(1) != Some('=') => "+",
                Some('-') if self.peek_at(1) != Some('-') && self.peek_at(1) != Some('=') => "-",
                _ => return Ok(left),
            };
            self.advance();
            let right = self.multiplicative()?;
            left = Expr::Binary {
                operator: operator.to_string(),
                left: Box::new(left),
                right: Box::new(right),
            };
        }
    }

    fn multiplicative(&mut self) -> Result<Expr, String> {
        let mut left = self.unary()?;
        loop {
            self.skip_whitespace();
            let operator = match self.peek_char() {
                // `*=` 是赋值运算符，不能当二元乘
                Some('*') if self.peek_at(1) != Some('=') => "*",
                Some('/') if self.peek_at(1) != Some('=') => "/",
                Some('%') if self.peek_at(1) != Some('=') => "%",
                _ => return Ok(left),
            };
            self.advance();
            let right = self.unary()?;
            left = Expr::Binary {
                operator: operator.to_string(),
                left: Box::new(left),
                right: Box::new(right),
            };
        }
    }

    fn unary(&mut self) -> Result<Expr, String> {
        self.skip_whitespace();
        match self.peek_char() {
            Some('!') if self.peek_at(1) != Some('=') => {
                self.advance();
                let argument = self.unary()?;
                Ok(Expr::Unary {
                    operator: "!".to_string(),
                    argument: Box::new(argument),
                })
            }
            Some('-') => {
                self.advance();
                let argument = self.unary()?;
                Ok(Expr::Unary {
                    operator: "-".to_string(),
                    argument: Box::new(argument),
                })
            }
            Some('+') => {
                self.advance();
                self.unary()
            }
            _ => self.primary(),
        }
    }

    fn primary(&mut self) -> Result<Expr, String> {
        self.skip_whitespace();
        match self.peek_char() {
            Some('(') => {
                self.advance();
                let inner = self.expression()?;
                self.skip_whitespace();
                if self.peek_char() != Some(')') {
                    return Err("缺少 )".to_string());
                }
                self.advance();
                self.postfix(inner)
            }
            Some(ch) if ch.is_ascii_digit() || ch == '.' => {
                let value = self.number()?;
                self.postfix(Expr::Number(value))
            }
            Some(ch) if is_ident_char(ch) => {
                let name = self.identifier()?;
                self.member_call(Expr::Ident(name))
            }
            other => Err(format!("位置 {} 处意外的字符 {:?}", self.position, other)),
        }
    }

    /// 处理 `a.b.c` 与调用 `Math.floor(x)`；两者可交织（数据里只出现在末尾）。
    fn postfix(&mut self, expression: Expr) -> Result<Expr, String> {
        self.member_call(expression)
    }

    /// 成员访问 / 调用后缀链。
    fn member_call(&mut self, mut expression: Expr) -> Result<Expr, String> {
        loop {
            self.skip_whitespace();
            match self.peek_char() {
                Some('.') => {
                    self.advance();
                    let property = self.identifier()?;
                    expression = Expr::Member(Box::new(expression), property);
                }
                Some('(') => {
                    // 调用名取链上最后一段（`Math.floor` → `floor`）
                    self.advance();
                    let args = self.arguments()?;
                    let name = match &expression {
                        Expr::Ident(name) => name.clone(),
                        Expr::Member(_, property) => property.clone(),
                        _ => return Err("调用目标不是函数名".to_string()),
                    };
                    expression = Expr::Call { name, args };
                }
                _ => return Ok(expression),
            }
        }
    }

    fn number(&mut self) -> Result<f64, String> {
        let start = self.position;
        while let Some(ch) = self.peek_char() {
            if ch.is_ascii_digit() || ch == '.' {
                self.advance();
            } else {
                break;
            }
        }
        let text: String = self.chars[start..self.position].iter().collect();
        text.parse::<f64>()
            .map_err(|_| format!("无法解析数字 {:?}", text))
    }

    fn arguments(&mut self) -> Result<Vec<Expr>, String> {
        let mut args = Vec::new();
        self.skip_whitespace();
        if self.peek_char() == Some(')') {
            self.advance();
            return Ok(args);
        }
        loop {
            // 实参不参与逗号序列（逗号是分隔符）
            args.push(self.assignment()?);
            self.skip_whitespace();
            match self.peek_char() {
                Some(',') => {
                    self.advance();
                }
                Some(')') => {
                    self.advance();
                    return Ok(args);
                }
                other => return Err(format!("参数列表处意外的字符 {:?}", other)),
            }
        }
    }
}

/// 标识符字符：ASCII 字母数字下划线 `$`，以及所有非 ASCII（中文属性名）。
fn is_ident_char(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_' || ch == '$' || !ch.is_ascii()
}

// ============================ 求值 ============================

fn exec_statements(
    statements: &[Statement],
    env: &mut CodeEnv<'_>,
    scope: &mut HashMap<String, f64>,
) -> Result<(), String> {
    for statement in statements {
        match statement {
            Statement::Var(declarations) => {
                for (name, value) in declarations {
                    let computed = eval(value, env, scope)?;
                    scope.insert(name.clone(), computed);
                }
            }
            Statement::If {
                condition,
                then,
                otherwise,
            } => {
                if eval(condition, env, scope)? != 0.0 {
                    exec_statements(then, env, scope)?;
                } else {
                    exec_statements(otherwise, env, scope)?;
                }
            }
            Statement::Return(value) => {
                let _ = eval(value, env, scope)?;
            }
            Statement::Expression(expression) => {
                let _ = eval(expression, env, scope)?;
            }
        }
    }
    Ok(())
}

fn eval(
    expression: &Expr,
    env: &mut CodeEnv<'_>,
    scope: &mut HashMap<String, f64>,
) -> Result<f64, String> {
    match expression {
        Expr::Number(value) => Ok(*value),
        Expr::Ident(name) => Ok(read_ident(name, env, scope)),
        Expr::Member(object, property) => {
            let Some(root) = root_ident(object) else {
                return Ok(0.0);
            };
            Ok(read_member(root, property, env))
        }
        Expr::Assign {
            target,
            operator,
            value,
        } => {
            let rhs = eval(value, env, scope)?;
            let current = eval(target, env, scope)?;
            let next = apply_operator(operator, current, rhs)?;
            write_back(target, next, env, scope);
            Ok(next)
        }
        Expr::Sequence(items) => {
            let mut last = 0.0;
            for item in items {
                last = eval(item, env, scope)?;
            }
            Ok(last)
        }
        Expr::Binary {
            operator,
            left,
            right,
        } => {
            let lhs = eval(left, env, scope)?;
            match operator.as_str() {
                // JS 的 `||` 返回第一个真值操作数，没有则返回最后一个
                "||" => {
                    if lhs != 0.0 {
                        return Ok(lhs);
                    }
                    return eval(right, env, scope);
                }
                // `&&` 返回第一个假值操作数，没有则返回最后一个
                "&&" => {
                    if lhs == 0.0 {
                        return Ok(lhs);
                    }
                    return eval(right, env, scope);
                }
                _ => {}
            }
            let rhs = eval(right, env, scope)?;
            let result = match operator.as_str() {
                "+" => lhs + rhs,
                "-" => lhs - rhs,
                "*" => lhs * rhs,
                "/" => {
                    if rhs == 0.0 {
                        0.0
                    } else {
                        lhs / rhs
                    }
                }
                "%" => {
                    if rhs == 0.0 {
                        0.0
                    } else {
                        lhs % rhs
                    }
                }
                "<" => bool_value(lhs < rhs),
                "<=" => bool_value(lhs <= rhs),
                ">" => bool_value(lhs > rhs),
                ">=" => bool_value(lhs >= rhs),
                "==" => bool_value(lhs == rhs),
                "!=" => bool_value(lhs != rhs),
                other => return Err(format!("未知的运算符 {}", other)),
            };
            Ok(result)
        }
        Expr::Unary { operator, argument } => {
            let value = eval(argument, env, scope)?;
            match operator.as_str() {
                "-" => Ok(-value),
                "!" => Ok(bool_value(value == 0.0)),
                other => Err(format!("未知的一元运算符 {}", other)),
            }
        }
        Expr::Ternary {
            condition,
            then,
            otherwise,
        } => {
            if eval(condition, env, scope)? != 0.0 {
                eval(then, env, scope)
            } else {
                eval(otherwise, env, scope)
            }
        }
        Expr::Call { name, args } => {
            let values = args
                .iter()
                .map(|arg| eval(arg, env, scope))
                .collect::<Result<Vec<f64>, String>>()?;
            // 数据里只出现 `Math.xxx`；裸调用按同名处理
            let short = name.rsplit('.').next().unwrap_or(name);
            match short {
                "min" => Ok(values.iter().copied().fold(f64::INFINITY, f64::min)),
                "max" => Ok(values.iter().copied().fold(f64::NEG_INFINITY, f64::max)),
                "floor" => Ok(values.first().copied().unwrap_or(f64::NAN).floor()),
                "ceil" => Ok(values.first().copied().unwrap_or(f64::NAN).ceil()),
                "round" => Ok(values.first().copied().unwrap_or(f64::NAN).round()),
                "abs" => Ok(values.first().copied().unwrap_or(f64::NAN).abs()),
                other => Err(format!("未知的函数 {}", other)),
            }
        }
    }
}

fn apply_operator(operator: &str, current: f64, rhs: f64) -> Result<f64, String> {
    match operator {
        "=" => Ok(rhs),
        "+=" => Ok(current + rhs),
        "-=" => Ok(current - rhs),
        "*=" => Ok(current * rhs),
        "/=" => Ok(if rhs == 0.0 { 0.0 } else { current / rhs }),
        other => Err(format!("未知的赋值运算符 {}", other)),
    }
}

fn read_ident(name: &str, env: &CodeEnv<'_>, scope: &HashMap<String, f64>) -> f64 {
    if let Some(value) = scope.get(name) {
        return *value;
    }
    // 子对象名（`weaponAttr` / `skillWeaponAttr` / `char` / `enemy` …）在读作裸标识符时
    // 对应 JS 里的一个对象，**恒为真值**。数据里这类名字只出现在 `if(weaponAttr)` 这种存在性判断上
    // （取成员一律走 `Expr::Member`），因此返回 1 与 JS 的 `if(obj)` 行为一致；
    // 当作数字参与算术是数据里不存在的写法。
    if is_object_root(name, env) {
        return 1.0;
    }
    env.attrs.get(name).copied().unwrap_or(0.0)
}

/// 该名字是否是当前环境里的子对象（基础值 / 面板 / MOD 槽位 / 怪物）。
fn is_object_root(name: &str, env: &CodeEnv<'_>) -> bool {
    env.field_attrs.contains_key(name)
        || env.bases.contains_key(name)
        || env.mod_attrs.contains_key(name)
        || name == "enemy"
}

fn read_member(root: &str, property: &str, env: &CodeEnv<'_>) -> f64 {
    if let Some(field) = env.field_attrs.get(root) {
        return field.get(property).copied().unwrap_or(0.0);
    }
    if let Some(base) = env.bases.get(root) {
        return base.get(property).copied().unwrap_or(0.0);
    }
    if let Some(mods) = env.mod_attrs.get(root) {
        return mods.get(property).copied().unwrap_or(0.0);
    }
    if root == "enemy" {
        return env.enemy.get(property).copied().unwrap_or(0.0);
    }
    // 未定义对象读 0（对齐上游的零值兜底）
    0.0
}

/// 把赋值结果写回：优先面板成员，其次基础值对象，最后角色属性。
fn write_back(target: &Expr, value: f64, env: &mut CodeEnv<'_>, scope: &mut HashMap<String, f64>) {
    match target {
        Expr::Ident(name) => {
            // 局部变量优先（`var` 声明过的名不再写属性表）
            if scope.contains_key(name) {
                scope.insert(name.clone(), value);
                return;
            }
            env.attrs.insert(name.clone(), value);
        }
        Expr::Member(object, property) => {
            let Some(root) = root_ident(object) else {
                return;
            };
            if let Some(field) = Arc::make_mut(&mut env.field_attrs).get_mut(root) {
                field.insert(property.clone(), value);
                return;
            }
            if let Some(base) = Arc::make_mut(&mut env.bases).get_mut(root) {
                base.insert(property.clone(), value);
                return;
            }
            if let Some(mods) = Arc::make_mut(&mut env.mod_attrs).get_mut(root) {
                mods.insert(property.clone(), value);
                return;
            }
            if root == "enemy" {
                env.enemy.insert(property.clone(), value);
            }
            // 其余未知对象忽略（上游会写进 sandbox，结果等同丢弃）
        }
        // 序列 / 调用等不能作为赋值目标，忽略
        _ => {}
    }
}

fn root_ident(expression: &Expr) -> Option<&str> {
    match expression {
        Expr::Ident(name) => Some(name),
        Expr::Member(object, _) => root_ident(object),
        _ => None,
    }
}

fn bool_value(flag: bool) -> f64 {
    if flag { 1.0 } else { 0.0 }
}

/// 构造 `enemy` 子对象。
pub fn enemy_attr_map(level: f64) -> AttrMap {
    let mut map = AttrMap::new();
    map.insert("等级", level);
    map
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env_of<'a>(attrs: &'a mut AttrMap) -> CodeEnv<'a> {
        CodeEnv {
            attrs,
            field_attrs: Arc::new(HashMap::new()),
            bases: Arc::new(HashMap::new()),
            mod_attrs: Arc::new(HashMap::new()),
            enemy: AttrMap::new(),
        }
    }

    #[test]
    fn plain_attribute_assignment_writes_back() {
        let mut attrs = AttrMap::new();
        attrs.insert("生命", 100.0);
        let mut env = env_of(&mut attrs);
        let outcome = run_code("生命 += 50", &mut env);
        assert!(outcome.ok, "{:?}", outcome.error);
        assert_eq!(env.attrs.get("生命").copied().unwrap(), 150.0);
    }

    #[test]
    fn comma_sequence_applies_all_side_effects() {
        // 上游「妮弗尔夫人Q」的写法
        let mut attrs = AttrMap::new();
        attrs.insert("技能范围", 1.5);
        attrs.insert("技能威力", 1.0);
        let mut env = env_of(&mut attrs);
        let outcome = run_code("if(技能范围>1)技能威力+=技能范围-1,技能范围=1", &mut env);
        assert!(outcome.ok, "{:?}", outcome.error);
        assert_eq!(env.attrs.get("技能威力").copied().unwrap(), 1.5);
        assert_eq!(env.attrs.get("技能范围").copied().unwrap(), 1.0);
    }

    #[test]
    fn multi_var_declaration_and_math_calls() {
        // 上游「法露茜Q」的写法
        let mut attrs = AttrMap::new();
        attrs.insert("攻击", 250.0);
        let mut env = env_of(&mut attrs);
        Arc::make_mut(&mut env.bases).insert(
            "char".to_string(),
            [("基础攻击".to_string(), 500.0)].into_iter().collect(),
        );
        let outcome = run_code(
            "var c=char.基础攻击*(1+charMods.攻击)*1,t=Math.floor(Math.min(攻击,c)/100);if(t>0){生命+=t*1000;攻击-=t*100}",
            &mut env,
        );
        assert!(outcome.ok, "{:?}", outcome.error);
        // t = floor(min(250, 500) / 100) = 2
        assert_eq!(env.attrs.get("生命").copied().unwrap(), 2000.0);
        assert_eq!(env.attrs.get("攻击").copied().unwrap(), 50.0);
    }

    #[test]
    fn or_returns_operand_not_boolean() {
        // `(1+暴击)||0`：暴击为 0 → 1；暴击为 0.5 → 1.5
        let mut attrs = AttrMap::new();
        attrs.insert("暴击", 0.0);
        let mut env = env_of(&mut attrs);
        assert!(run_code("攻击 = (1+暴击)||0", &mut env).ok);
        assert_eq!(env.attrs.get("攻击").copied().unwrap(), 1.0);

        let mut attrs = AttrMap::new();
        attrs.insert("暴击", 0.5);
        let mut env = env_of(&mut attrs);
        assert!(run_code("攻击 = (1+暴击)||0", &mut env).ok);
        assert_eq!(env.attrs.get("攻击").copied().unwrap(), 1.5);
    }

    #[test]
    fn undefined_identifiers_read_zero() {
        let mut attrs = AttrMap::new();
        let mut env = env_of(&mut attrs);
        let outcome = run_code("攻击 = 不存在的属性 + 5", &mut env);
        assert!(outcome.ok, "{:?}", outcome.error);
        assert_eq!(env.attrs.get("攻击").copied().unwrap(), 5.0);
    }

    #[test]
    fn member_write_targets_field_panel() {
        // 上游「追加伤害BUG」的写法
        let mut attrs = AttrMap::new();
        let mut env = env_of(&mut attrs);
        Arc::make_mut(&mut env.field_attrs).insert(
            "weaponAttr".to_string(),
            [("追加伤害".to_string(), 2.0)].into_iter().collect(),
        );
        env.enemy.insert("等级", 200.0);
        let outcome = run_code(
            "if(weaponAttr)weaponAttr.追加伤害*=enemy.等级<200?1:1/(1+(enemy.等级-190)*0.05)",
            &mut env,
        );
        assert!(outcome.ok, "{:?}", outcome.error);
        let value = env
            .field_attrs
            .get("weaponAttr")
            .unwrap()
            .get("追加伤害")
            .copied()
            .unwrap();
        assert!((value - 2.0 / 1.5).abs() < 1e-12, "{value}");
    }

    #[test]
    fn else_if_chain_picks_matching_branch() {
        // 上游「狩月人之阶3」的写法
        let mut attrs = AttrMap::new();
        attrs.insert("技能范围", 2.7);
        attrs.insert("技能耐久", 1.5);
        let mut env = env_of(&mut attrs);
        let outcome = run_code(
            "if(技能范围>技能耐久)技能无视防御+=Math.min(0.42,0.07*Math.floor((技能范围-技能耐久)/0.1));else if(技能耐久>技能范围)属性穿透+=0.5",
            &mut env,
        );
        assert!(outcome.ok, "{:?}", outcome.error);
        // (2.7 - 1.5) / 0.1 = 12 → 0.07*12 = 0.84 → min(0.42, ...) = 0.42
        assert!((env.attrs.get("技能无视防御").copied().unwrap() - 0.42).abs() < 1e-12);
        assert_eq!(env.attrs.get("属性穿透"), None);
    }

    #[test]
    fn compound_buff_with_braces_and_multiple_writes() {
        // 上游「权火将熄5熔」的写法
        let mut attrs = AttrMap::new();
        let mut env = env_of(&mut attrs);
        Arc::make_mut(&mut env.field_attrs).insert(
            "skillWeaponAttr".to_string(),
            [
                ("暴击".to_string(), 1.0),
                ("暴伤".to_string(), 2.0),
                ("触发".to_string(), 0.5),
            ]
            .into_iter()
            .collect(),
        );
        Arc::make_mut(&mut env.bases).insert(
            "meleeWeapon".to_string(),
            [
                ("基础暴击".to_string(), 0.22),
                ("基础暴伤".to_string(), 2.2),
                ("基础触发".to_string(), 0.22),
            ]
            .into_iter()
            .collect(),
        );
        Arc::make_mut(&mut env.mod_attrs).insert(
            "meleeMods".to_string(),
            [("暴击".to_string(), 1.0)].into_iter().collect(),
        );
        let outcome = run_code(
            "if(skillWeaponAttr){skillWeaponAttr.暴击+=meleeWeapon.基础暴击*0.25*(1+meleeMods.暴击||0);skillWeaponAttr.暴伤+=meleeWeapon.基础暴伤*0.25*(1+meleeMods.暴伤||0);skillWeaponAttr.触发+=meleeWeapon.基础触发*0.25*(1+meleeMods.触发||0)}",
            &mut env,
        );
        assert!(outcome.ok, "{:?}", outcome.error);
        let panel = env.field_attrs.get("skillWeaponAttr").unwrap();
        // 0.22 * 0.25 * (1 + 1) = 0.11
        assert!((panel.get("暴击").copied().unwrap() - 1.11).abs() < 1e-12);
        // 暴伤：meleeMods.暴伤 未定义 → (1+0) = 1 → 2.2*0.25 = 0.55
        assert!((panel.get("暴伤").copied().unwrap() - 2.55).abs() < 1e-12);
        assert!((panel.get("触发").copied().unwrap() - 0.555).abs() < 1e-12);
    }

    #[test]
    fn ternary_and_temporary_reference_free() {
        let mut attrs = AttrMap::new();
        attrs.insert("昂扬", 0.0);
        let mut env = env_of(&mut attrs);
        assert!(run_code("攻击 = 昂扬 > 0 ? 1 : 2", &mut env).ok);
        assert_eq!(env.attrs.get("攻击").copied().unwrap(), 2.0);
    }
}
