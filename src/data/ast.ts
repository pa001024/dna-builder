export type ASTNodeType = "binary" | "unary" | "property" | "function" | "member_access" | "number"

export interface ASTNodeBase {
    type: ASTNodeType
}

export interface ASTBinary extends ASTNodeBase {
    type: "binary"
    operator: string
    left: ASTNode
    right: ASTNode
}

export interface ASTUnary extends ASTNodeBase {
    type: "unary"
    operator: string
    argument: ASTNode
}

export interface ASTProperty extends ASTNodeBase {
    type: "property"
    name: string
    namespace?: string // 命名空间 (从 xxx::yyy 中提取的 xxx)
}

export interface ASTFunction extends ASTNodeBase {
    type: "function"
    name: string
    namespace?: string // 命名空间 (从 xxx::yyy 中提取的 xxx)
    args: ASTNode[]
}

export interface ASTMemberAccess extends ASTNodeBase {
    type: "member_access"
    object: ASTNode // 被访问的对象 (属性, 函数返回值, 或另一个成员访问)
    property: string // 成员名称
}

export interface ASTNumber extends ASTNodeBase {
    type: "number"
    value: number
}

export type ASTNode = ASTBinary | ASTUnary | ASTProperty | ASTFunction | ASTMemberAccess | ASTNumber

export enum TokenType {
    NUMBER,
    IDENTIFIER, // [幻象]伤害, max 等
    OPERATOR, // +, -, *, /, %, //
    DOT, // . (成员访问)
    DOUBLE_COLON, // :: (命名空间访问)
    LPAREN, // (
    RPAREN, // )
    COMMA, // ,
    EOF,
}

export interface Token {
    type: TokenType
    value: string
    position: number
}

class Tokenizer {
    private input: string
    private position: number = 0
    private macros: Map<string, string>

    constructor(input: string, macros: Map<string, string>) {
        this.input = input
        this.macros = macros
    }

    getNextToken(): Token {
        this.skipWhitespace()

        if (this.position >= this.input.length) {
            return { type: TokenType.EOF, value: "", position: this.position }
        }

        const char = this.input[this.position]

        // 数字处理
        if (/\d/.test(char)) {
            let value = ""
            while (this.position < this.input.length && /[\d.]/.test(this.input[this.position])) {
                value += this.input[this.position]
                this.position++
            }
            return { type: TokenType.NUMBER, value, position: this.position - value.length }
        }

        // 标识符处理 (属性名或函数名)
        // 支持标准字符, 中文, 以及 [Tag]Name 格式
        if (/[a-zA-Z_\u4e00-\u9fa5[]/.test(char)) {
            let value = ""

            while (this.position < this.input.length) {
                const c = this.input[this.position]
                if (/[a-zA-Z0-9_\u4e00-\u9fa5[\]]/.test(c)) {
                    value += c
                    this.position++
                } else {
                    break
                }
            }

            // 检查是否是宏定义,进行精准匹配替换
            if (this.macros.has(value)) {
                const replacement = this.macros.get(value)!
                // 将替换的文本插入到输入流中
                this.input = this.input.slice(0, this.position - value.length) + replacement + this.input.slice(this.position)
                this.position -= value.length
                // 递归获取替换后的token
                return this.getNextToken()
            }

            return { type: TokenType.IDENTIFIER, value, position: this.position - value.length }
        }

        // 运算符处理

        // 处理多字符运算符
        if (char === "/") {
            if (this.position + 1 < this.input.length && this.input[this.position + 1] === "/") {
                this.position += 2
                return { type: TokenType.OPERATOR, value: "//", position: this.position - 2 }
            }
            this.position++
            return { type: TokenType.OPERATOR, value: "/", position: this.position - 1 }
        }

        if (char === "%") {
            this.position++
            return { type: TokenType.OPERATOR, value: "%", position: this.position - 1 }
        }

        if (/[+\-*]/.test(char)) {
            this.position++
            return { type: TokenType.OPERATOR, value: char, position: this.position - 1 }
        }

        // 标点符号处理
        if (char === ".") {
            this.position++
            return { type: TokenType.DOT, value: ".", position: this.position - 1 }
        }

        // 处理双冒号 ::
        if (char === ":") {
            if (this.position + 1 < this.input.length && this.input[this.position + 1] === ":") {
                this.position += 2
                return { type: TokenType.DOUBLE_COLON, value: "::", position: this.position - 2 }
            }
            throw new Error(`单个冒号 ':' 不支持,请使用 '::' 进行命名空间访问`)
        }
        if (char === "(") {
            this.position++
            return { type: TokenType.LPAREN, value: "(", position: this.position - 1 }
        }
        if (char === ")") {
            this.position++
            return { type: TokenType.RPAREN, value: ")", position: this.position - 1 }
        }
        if (char === ",") {
            this.position++
            return { type: TokenType.COMMA, value: ",", position: this.position - 1 }
        }

        throw new Error(`未知字符 '${char}' 位于位置 ${this.position}`)
    }

    private skipWhitespace() {
        while (this.position < this.input.length && /\s/.test(this.input[this.position])) {
            this.position++
        }
    }
}

class Parser {
    private tokens: Token[] = []
    private current: number = 0

    constructor(input: string, macros: Map<string, string>) {
        const tokenizer = new Tokenizer(input, macros)
        let token = tokenizer.getNextToken()
        while (token.type !== TokenType.EOF) {
            this.tokens.push(token)
            token = tokenizer.getNextToken()
        }
    }

    public parse(): ASTNode {
        if (this.tokens.length === 0) {
            throw new Error("表达式为空")
        }
        const ast = this.parseExpression()
        if (this.current < this.tokens.length) {
            throw new Error(`表达式末尾发现意外的标记 '${this.peek().value}'`)
        }
        return ast
    }

    // 表达式: Term { (+|-) Term }
    private parseExpression(): ASTNode {
        let left = this.parseTerm()

        while (this.match(TokenType.OPERATOR, "+") || this.match(TokenType.OPERATOR, "-")) {
            const operator = this.previous().value

            // 检查运算符后是否有足够的操作数
            if (this.isAtEnd() || this.check(TokenType.OPERATOR) || this.check(TokenType.RPAREN) || this.check(TokenType.COMMA)) {
                throw new Error(`运算符 '${operator}' 后缺少操作数`)
            }

            const right = this.parseTerm()
            left = {
                type: "binary",
                operator,
                left,
                right,
            }
        }

        return left
    }

    // 项: Unary { (*|/|//|%) Unary }
    private parseTerm(): ASTNode {
        let left = this.parseUnary()

        while (
            this.match(TokenType.OPERATOR, "*") ||
            this.match(TokenType.OPERATOR, "/") ||
            this.match(TokenType.OPERATOR, "//") ||
            this.match(TokenType.OPERATOR, "%")
        ) {
            const operator = this.previous().value

            // 检查运算符后是否有足够的操作数
            if (this.isAtEnd() || this.check(TokenType.OPERATOR) || this.check(TokenType.RPAREN) || this.check(TokenType.COMMA)) {
                throw new Error(`运算符 '${operator}' 后缺少操作数`)
            }

            const right = this.parseUnary()
            left = {
                type: "binary",
                operator,
                left,
                right,
            }
        }

        return left
    }

    // 一元运算: - Unary | Factor
    private parseUnary(): ASTNode {
        if (this.match(TokenType.OPERATOR, "-") || this.match(TokenType.OPERATOR, "+")) {
            const operator = this.previous().value
            const right = this.parseUnary()
            return {
                type: "unary",
                operator,
                argument: right,
            }
        }
        return this.parseFactor()
    }

    // 因子: (Expression) | Number | Identifier(Call/Prop) -> (::Identifier| .Identifier)*
    private parseFactor(): ASTNode {
        let node: ASTNode

        if (this.match(TokenType.NUMBER)) {
            node = {
                type: "number",
                value: parseFloat(this.previous().value),
            }
        } else if (this.match(TokenType.IDENTIFIER)) {
            const name = this.previous().value
            let namespace: string | undefined

            // 检查是否有命名空间前缀 (xxx::yyy)
            if (this.match(TokenType.DOUBLE_COLON)) {
                namespace = name
                const nextToken = this.consume(TokenType.IDENTIFIER, "命名空间 '::' 后缺少标识符")
                const actualName = nextToken.value

                // 检查是否为函数调用
                if (this.match(TokenType.LPAREN)) {
                    const args: ASTNode[] = []
                    if (!this.check(TokenType.RPAREN)) {
                        do {
                            args.push(this.parseExpression())
                        } while (this.match(TokenType.COMMA))
                    }
                    this.consume(TokenType.RPAREN, "函数参数后缺少 ')'")
                    node = {
                        type: "function",
                        name: actualName,
                        namespace,
                        args,
                    }
                } else {
                    // 属性
                    node = {
                        type: "property",
                        name: actualName,
                        namespace,
                    }
                }
            } else {
                // 检查是否为函数调用
                if (this.match(TokenType.LPAREN)) {
                    const args: ASTNode[] = []
                    if (!this.check(TokenType.RPAREN)) {
                        do {
                            args.push(this.parseExpression())
                        } while (this.match(TokenType.COMMA))
                    }
                    this.consume(TokenType.RPAREN, "函数参数后缺少 ')'")
                    node = {
                        type: "function",
                        name,
                        args,
                    }
                } else {
                    // 属性
                    node = {
                        type: "property",
                        name,
                    }
                }
            }
        } else if (this.match(TokenType.LPAREN)) {
            const expr = this.parseExpression()
            this.consume(TokenType.RPAREN, "表达式后缺少 ')'")
            node = expr
        } else {
            throw new Error(`意外的标记: ${this.peek().value}`)
        }

        // 处理成员访问链 (例如: Obj.Prop.SubProp)
        while (this.match(TokenType.DOT)) {
            const propertyToken = this.consume(TokenType.IDENTIFIER, "成员访问 '.' 后缺少属性名称")
            node = {
                type: "member_access",
                object: node,
                property: propertyToken.value,
            }
        }

        return node
    }

    // 辅助方法
    private match(type: TokenType, value?: string): boolean {
        if (this.check(type, value)) {
            this.advance()
            return true
        }
        return false
    }

    private check(type: TokenType, value?: string): boolean {
        if (this.isAtEnd()) return false
        const token = this.peek()
        if (token.type !== type) return false
        if (value && token.value !== value) return false
        return true
    }

    private advance(): Token {
        if (!this.isAtEnd()) this.current++
        return this.previous()
    }

    private isAtEnd(): boolean {
        return this.current >= this.tokens.length
    }

    private peek(): Token {
        return this.tokens[this.current]
    }

    private previous(): Token {
        return this.tokens[this.current - 1]
    }

    private consume(type: TokenType, message: string): Token {
        if (this.check(type)) return this.advance()
        throw new Error(message)
    }
}

export type MacroReplacement = (input: string) => string
export type MacroMap = Map<string, string>

export function parseAST(input: string, macros?: Record<string, string> | MacroMap | MacroReplacement): ASTNode {
    let macrosMap: MacroMap = new Map()

    // 如果传入的是函数,先应用于整个输入(向后兼容)
    if (typeof macros === "function") {
        input = macros(input)
    } else if (macros instanceof Map) {
        // 如果传入的是 Map,用于词法分析阶段的精准替换
        macrosMap = macros
    } else if (macros) {
        // 如果传入的是 Record,转换为 Map
        macrosMap = new Map(Object.entries(macros))
    }

    const parser = new Parser(input, macrosMap)
    return parser.parse()
}
