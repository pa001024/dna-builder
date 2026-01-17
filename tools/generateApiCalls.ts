#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { $ } from "bun"
import { glob } from "glob"
import {
    type FieldDefinitionNode,
    type InputObjectTypeDefinitionNode,
    type NonNullTypeNode,
    type ObjectTypeDefinitionNode,
    parse,
    type TypeNode,
} from "graphql"

/**
 * 从服务器端API定义生成客户端API调用代码
 * 读取server/src/db/mod/下的所有文件，解析GraphQL typeDefs，生成对应的query和mutation调用代码
 */

// 配置
const SERVER_API_DIR = "server/src/db/mod"
const OUTPUT_DIR = "src/api/gen"
const OUTPUT_QUERY_FILE = "api-queries.ts"
const OUTPUT_MUTATION_FILE = "api-mutations.ts"

/**
 * 读取文件内容
 */
function readFile(filePath: string): string {
    return readFileSync(filePath, "utf-8")
}

/**
 * 写入文件
 */
function writeFile(filePath: string, content: string): void {
    writeFileSync(filePath, content, "utf-8")
}

/**
 * 创建目录（如果不存在）
 */
function ensureDir(dirPath: string): void {
    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true })
    }
}

/**
 * 从文件中提取GraphQL typeDefs
 */
function extractTypeDefs(fileContent: string): string | null {
    // 匹配 export const typeDefs = /* GraphQL */ `...` 格式
    const match = fileContent.match(/export\s+const\s+typeDefs\s*=\s*\/\*\s*GraphQL\s*\*\/\s*(`[^`]*`)/s)
    if (match) {
        // 移除模板字符串标记
        const typeDefs = match[1].slice(1, -1)
        return typeDefs
    }
    return null
}

/**
 * 解析GraphQL schema，提取所有类型定义和Query/Mutation字段
 */
function parseSchema(schema: string) {
    const ast = parse(schema)

    const queries: FieldDefinitionNode[] = []
    const mutations: FieldDefinitionNode[] = []
    const objectTypes: Map<string, ObjectTypeDefinitionNode> = new Map()
    const inputTypes: Map<string, InputObjectTypeDefinitionNode> = new Map()

    // 遍历所有定义
    for (const definition of ast.definitions) {
        if (definition.kind === "ObjectTypeDefinition") {
            const objDef = definition as ObjectTypeDefinitionNode

            if (objDef.name.value === "Query") {
                queries.push(...(objDef.fields || []))
            } else if (objDef.name.value === "Mutation") {
                mutations.push(...(objDef.fields || []))
            } else {
                // 保存所有其他对象类型
                objectTypes.set(objDef.name.value, objDef)
            }
        } else if (definition.kind === "InputObjectTypeDefinition") {
            // 保存所有输入类型
            const inputDef = definition as InputObjectTypeDefinitionNode
            inputTypes.set(inputDef.name.value, inputDef)
        }
    }

    return { queries, mutations, objectTypes, inputTypes }
}

/**
 * 将GraphQL类型节点转换为字符串表示
 */
function graphqlTypeToString(type: TypeNode): string {
    switch (type.kind) {
        case "NamedType":
            return type.name.value
        case "NonNullType":
            return `${graphqlTypeToString(type.type)}!`
        case "ListType":
            return `[${graphqlTypeToString(type.type)}]`
        default:
            return "any"
    }
}

/**
 * 将GraphQL类型转换为TypeScript类型字符串
 */
function graphqlTypeToTsType(type: TypeNode): string {
    // 处理标量类型映射
    const scalarMap: Record<string, string> = {
        String: "string",
        Int: "number",
        Float: "number",
        Boolean: "boolean",
        ID: "string",
    }

    switch (type.kind) {
        case "NamedType":
            return scalarMap[type.name.value] || type.name.value
        case "NonNullType":
            return graphqlTypeToTsType(type.type)
        case "ListType":
            return `${graphqlTypeToTsType(type.type)}[]`
        default:
            return "any"
    }
}

/**
 * 生成GraphQL字段的查询字符串，包括嵌套字段
 */
function generateGraphQLFields(typeName: string, allObjectTypes: Map<string, ObjectTypeDefinitionNode>, indent: number = 3): string {
    const objType = allObjectTypes.get(typeName)
    if (!objType) {
        return ""
    }

    let fieldsStr = ""
    // 每个缩进级别使用4个空格
    const indentStr = "    ".repeat(indent)

    for (const field of objType.fields || []) {
        const fieldName = field.name.value
        const fieldType = field.type

        // 标量类型列表
        const graphqlScalarTypes = new Set(["String", "Int", "Float", "Boolean", "ID"])

        // 提取字段类型名称
        function extractFieldTypeName(type: TypeNode): string {
            switch (type.kind) {
                case "NamedType":
                    return type.name.value
                case "NonNullType":
                    return extractFieldTypeName(type.type)
                case "ListType":
                    return extractFieldTypeName(type.type)
                default:
                    return ""
            }
        }

        const fieldTypeName = extractFieldTypeName(fieldType)

        // 如果是标量类型，直接输出字段名
        if (graphqlScalarTypes.has(fieldTypeName)) {
            fieldsStr += `${indentStr}${fieldName}\n`
        } else {
            // 如果是对象类型，递归生成嵌套字段
            fieldsStr += `${indentStr}${fieldName} {\n`
            fieldsStr += generateGraphQLFields(fieldTypeName, allObjectTypes, indent + 1)
            fieldsStr += `${indentStr}}\n`
        }
    }

    return fieldsStr
}

/**
 * 将GraphQL字段定义转换为客户端调用代码
 */
function generateClientCode(
    fields: FieldDefinitionNode[],
    isMutation: boolean = false,
    allObjectTypes: Map<string, ObjectTypeDefinitionNode>
): string {
    let code = ""

    // 标量类型列表
    const scalarTypes = new Set(["string", "number", "boolean"])

    for (const field of fields) {
        const fieldName = field.name.value
        const fieldType = field.type
        const args = field.arguments || []

        // 生成GraphQL查询字符串
        const gqlArgsStr = args.map(arg => `$${arg.name.value}: ${graphqlTypeToString(arg.type)}`).join(", ")
        const fieldArgsStr = args.map(arg => `${arg.name.value}: $${arg.name.value}`).join(", ")

        // 处理返回类型
        let returnTypeStr = graphqlTypeToTsType(fieldType)
        // 为自定义类型添加Types.前缀
        returnTypeStr = returnTypeStr.replace(/([A-Z]\w*)/g, match => {
            // 跳过标量类型
            if (["string", "number", "boolean", "any"].includes(match)) {
                return match
            }
            return `Types.${match}`
        })

        // 判断是否为标量类型
        const isScalar = scalarTypes.has(returnTypeStr.replace(/\[\]/g, ""))

        // 提取对象类型名称
        let objectTypeName = ""
        const graphqlScalarTypes = new Set(["String", "Int", "Float", "Boolean", "ID"])

        // 辅助函数：递归提取对象类型名称
        function extractObjectName(type: TypeNode): string {
            switch (type.kind) {
                case "NamedType":
                    return graphqlScalarTypes.has(type.name.value) ? "" : type.name.value
                case "NonNullType":
                    return extractObjectName(type.type)
                case "ListType":
                    return extractObjectName(type.type)
                default:
                    return ""
            }
        }

        objectTypeName = extractObjectName(fieldType)

        // 生成变量类型
        let varTypeStr = ""
        if (args.length > 0) {
            varTypeStr = args
                .map(arg => {
                    const argName = arg.name.value
                    const isRequired = arg.type.kind === "NonNullType"
                    const argTypeStr = graphqlTypeToTsType(arg.type)
                    // 为自定义类型添加Types.前缀
                    const finalTypeStr = argTypeStr.replace(/([A-Z]\w*)/g, match => {
                        // 跳过标量类型
                        if (["string", "number", "boolean", "any"].includes(match)) {
                            return match
                        }
                        return `Types.${match}`
                    })
                    return `${argName}${isRequired ? "" : "?"}: ${finalTypeStr}`
                })
                .join("; ")
        }

        const gqlQuery = isMutation ? "mutation" : "query"
        const clientFn = isMutation ? "typedMutation" : "typedQuery"

        // 生成函数名（驼峰式，首字母小写）
        const functionName = fieldName.charAt(0).toLowerCase() + fieldName.slice(1)

        // 构建GraphQL查询字符串
        let gqlQueryStr = gqlQuery
        if (gqlArgsStr) {
            gqlQueryStr += ` (${gqlArgsStr})`
        }
        gqlQueryStr += " {\n"
        gqlQueryStr += `        ${fieldName}`
        if (fieldArgsStr) {
            gqlQueryStr += `(${fieldArgsStr})`
        }

        // 根据是否为标量类型决定是否输出嵌套字段
        if (isScalar) {
            gqlQueryStr += "\n"
        } else {
            gqlQueryStr += " {\n"
            // 生成所有字段，包括嵌套字段
            gqlQueryStr += generateGraphQLFields(objectTypeName, allObjectTypes, 3)
            gqlQueryStr += "        }\n"
        }

        gqlQueryStr += "    }"

        // 构建完整的函数代码
        if (isMutation) {
            // 对于 mutation，保持原有格式
            code += `export const ${functionName}Mutation = ${clientFn}<
`
            code += `    ${returnTypeStr}`
            if (varTypeStr) {
                code += `, { ${varTypeStr} }`
            }
            code += `
>(/* GraphQL */ \`\n`
            code += `    ${gqlQueryStr}\n`
            code += `\`)

`
        } else {
            // 对于 query，使用新的柯里化格式
            code += `export const ${functionName}Query = ${clientFn}(
`
            code += `    /* GraphQL */ \`\n`
            code += `    ${gqlQueryStr}\n`
            code += `\` as const
`
            code += `)<
`
            code += `    ${returnTypeStr}`
            if (varTypeStr) {
                code += `, { ${varTypeStr} }`
            }
            code += `
>()
            
`
        }
    }

    return code
}

/**
 * 将GraphQL对象类型转换为TypeScript接口
 */
function generateTypeScriptInterface(objType: ObjectTypeDefinitionNode): string {
    let code = `export interface ${objType.name.value} {\n`

    // 遍历所有字段
    for (const field of objType.fields || []) {
        const fieldName = field.name.value
        const fieldType = graphqlTypeToTsType(field.type)
        const isRequired = field.type.kind === "NonNullType" && (field.type as NonNullTypeNode).type.kind === "NamedType"

        code += `    ${fieldName}${isRequired ? "" : "?"}: ${fieldType}\n`
    }

    code += `}\n\n`
    return code
}

/**
 * 将GraphQL输入类型转换为TypeScript接口
 */
function generateTypeScriptInput(inputType: InputObjectTypeDefinitionNode): string {
    let code = `export interface ${inputType.name.value} {\n`

    // 遍历所有字段
    for (const field of inputType.fields || []) {
        const fieldName = field.name.value
        const fieldType = graphqlTypeToTsType(field.type)
        const isRequired = field.type.kind === "NonNullType"

        code += `    ${fieldName}${isRequired ? "" : "?"}: ${fieldType}\n`
    }

    code += `}\n\n`
    return code
}

/**
 * 主函数
 */
async function main() {
    console.log("开始生成客户端API调用代码...")

    // 确保输出目录存在
    ensureDir(OUTPUT_DIR)

    // 读取所有服务器端API模块文件
    const files = await glob(`${SERVER_API_DIR}/*.ts`)

    const allQueries: FieldDefinitionNode[] = []
    const allMutations: FieldDefinitionNode[] = []
    const allObjectTypes: Map<string, ObjectTypeDefinitionNode> = new Map()
    const allInputTypes: Map<string, InputObjectTypeDefinitionNode> = new Map()

    // 遍历所有文件，解析schema
    for (const file of files) {
        console.log(`处理文件: ${file}`)
        const content = readFile(file)
        const typeDefs = extractTypeDefs(content)

        if (typeDefs) {
            try {
                const { queries, mutations, objectTypes, inputTypes } = parseSchema(typeDefs)
                allQueries.push(...queries)
                allMutations.push(...mutations)

                // 合并所有类型定义
                for (const [name, type] of objectTypes.entries()) {
                    if (!allObjectTypes.has(name)) {
                        allObjectTypes.set(name, type)
                    }
                }
                for (const [name, type] of inputTypes.entries()) {
                    if (!allInputTypes.has(name)) {
                        allInputTypes.set(name, type)
                    }
                }
            } catch (error) {
                console.error(`解析文件 ${file} 时出错:`, error)
            }
        }
    }

    // 生成TypeScript接口
    let typesCode = ""
    for (const [_name, objType] of allObjectTypes.entries()) {
        typesCode += generateTypeScriptInterface(objType)
    }
    for (const [_name, inputType] of allInputTypes.entries()) {
        typesCode += generateTypeScriptInput(inputType)
    }

    // 写入类型文件
    writeFile(`${OUTPUT_DIR}/api-types.ts`, typesCode)

    // 生成查询代码
    const queryCode = `import { typedQuery } from '@/api/query'
import type * as Types from './api-types'

${generateClientCode(allQueries, false, allObjectTypes)}`

    // 生成突变代码
    const mutationCode = `import { typedMutation } from '@/api/mutation'
import type * as Types from './api-types'

${generateClientCode(allMutations, true, allObjectTypes)}`

    // 写入文件
    writeFile(`${OUTPUT_DIR}/${OUTPUT_QUERY_FILE}`, queryCode)
    writeFile(`${OUTPUT_DIR}/${OUTPUT_MUTATION_FILE}`, mutationCode)

    await $`bun biome format --write ${OUTPUT_DIR}/*.ts`

    console.log(`\n生成完成！`)
    console.log(`查询文件: ${OUTPUT_DIR}/${OUTPUT_QUERY_FILE}`)
    console.log(`突变文件: ${OUTPUT_DIR}/${OUTPUT_MUTATION_FILE}`)
    console.log(`类型文件: ${OUTPUT_DIR}/api-types.ts`)
    console.log(`共生成 ${allQueries.length} 个查询和 ${allMutations.length} 个突变`)
    console.log(`共生成 ${allObjectTypes.size} 个对象类型和 ${allInputTypes.size} 个输入类型`)
}

// 运行主函数
main().catch(error => {
    console.error("生成过程中出错:", error)
})
