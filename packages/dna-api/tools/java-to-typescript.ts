import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const JAVA_DIR = process.argv[2] || join(__dirname, "../java")
const OUTPUT_FILE = process.argv[3] || join(__dirname, "../src/type-generated.ts")

const JAVA_BUILTIN_TYPES = new Set([
    "String",
    "int",
    "Integer",
    "boolean",
    "Boolean",
    "long",
    "Long",
    "double",
    "Double",
    "float",
    "Float",
    "short",
    "Short",
    "byte",
    "Byte",
    "char",
    "Character",
    "Object",
    "void",
    "List",
    "Map",
    "Set",
    "Collection",
    "ArrayList",
    "HashMap",
    "HashSet",
    "Serializable",
    "IOException",
    "Exception",
    "RuntimeException",
    "Date",
    "Timestamp",
    "Drawable",
    "SpannableStringBuilder",
    "Spannable",
    "Parcelable",
    "Bundle",
    "Context",
    "Intent",
    "Activity",
    "View",
    "OnClickListener",
    "StringBuffer",
    "StringBuilder",
    "Bitmap",
    "Uri",
    "Rect",
    "Point",
    "PointF",
    "Color",
    "Paint",
    "Canvas",
    "Matrix",
    "Path",
    "LayoutParams",
    "Gravity",
    "Toast",
])

const TYPE_MAPPING: Record<string, string> = {
    String: "string",
    int: "number",
    Integer: "number",
    boolean: "boolean",
    Boolean: "boolean",
    long: "number",
    Long: "number",
    double: "number",
    Double: "number",
    float: "number",
    Float: "number",
    short: "number",
    Short: "number",
    byte: "number",
    Byte: "number",
    char: "string",
    Character: "string",
    Object: "any",
    HeadResponse: "unknown",
}

type ClassInfo = {
    name: string
    package: string
    filePath: string
    fields: FieldInfo[]
    innerClasses: ClassInfo[]
    isStatic: boolean
}

type FieldInfo = {
    name: string
    type: string
    rawType: string
    isList: boolean
    isMap: boolean
    listType?: string
    mapKeyType?: string
    mapValueType?: string
}

const processedTypes = new Set<string>()
const typeQueue: string[] = []

type SymbolTableEntry = {
    filePath: string
    className: string
    isInnerClass: boolean
    outerClassName?: string
}

const symbolTable = new Map<string, SymbolTableEntry>()

// function capitalizeFirstLetter(str: string): string {
//     return str.charAt(0).toUpperCase() + str.slice(1)
// }

function extractTypeName(typeStr: string): string {
    typeStr = typeStr.trim()

    const listMatch = typeStr.match(/^List<(.+)>$/)
    if (listMatch) {
        return extractTypeName(listMatch[1])
    }

    const arrayMatch = typeStr.match(/^ArrayList<(.+)>$/)
    if (arrayMatch) {
        return extractTypeName(arrayMatch[1])
    }

    const mapMatch = typeStr.match(/^Map<(.+),(.+)>$/)
    if (mapMatch) {
        return mapMatch[2].trim()
    }

    const nestedMatch = typeStr.match(/^[A-Za-z0-9_$]+\.([A-Za-z0-9_$]+)$/)
    if (nestedMatch) {
        return nestedMatch[1]
    }

    const multiLevelNestedMatch = typeStr.match(/^(?:[A-Za-z0-9_$]+\.)*([A-Za-z0-9_$]+)$/)
    if (multiLevelNestedMatch && typeStr.includes(".")) {
        return multiLevelNestedMatch[1]
    }

    return typeStr
}

function parseType(typeStr: string): FieldInfo["type"] {
    typeStr = typeStr.trim()

    if (typeStr === "?" || typeStr === "Object") {
        return "any"
    }

    const listMatch = typeStr.match(/^List<(.+)>$/)
    if (listMatch) {
        const innerType = listMatch[1].trim()
        const tsType = convertJavaTypeToTypeScript(innerType)
        return `${tsType}[]`
    }

    const arrayMatch = typeStr.match(/^ArrayList<(.+)>$/)
    if (arrayMatch) {
        const innerType = arrayMatch[1].trim()
        const tsType = convertJavaTypeToTypeScript(innerType)
        return `${tsType}[]`
    }

    const javaArrayMatch = typeStr.match(/^(\S+)\[\]$/)
    if (javaArrayMatch) {
        const baseType = javaArrayMatch[1].trim()
        const tsType = convertJavaTypeToTypeScript(baseType)
        return `${tsType}[]`
    }

    const mapMatch = typeStr.match(/^Map<(.+),(.+)>$/)
    if (mapMatch) {
        const keyType = mapMatch[1].trim()
        const valueType = mapMatch[2].trim()

        const tsKeyType = convertJavaTypeToTypeScript(keyType)
        const tsValueType = convertJavaTypeToTypeScript(valueType)

        return `Record<${tsKeyType}, ${tsValueType}>`
    }

    const nestedMatch = typeStr.match(/^[A-Za-z0-9_$]+\.([A-Za-z0-9_$]+)$/)
    if (nestedMatch) {
        const simpleName = nestedMatch[1]
        return `DNA${simpleName}`
    }

    const multiLevelNestedMatch = typeStr.match(/^(?:[A-Za-z0-9_$]+\.)*([A-Za-z0-9_$]+)$/)
    if (multiLevelNestedMatch && typeStr.includes(".")) {
        const simpleName = multiLevelNestedMatch[1]
        return `DNA${simpleName}`
    }

    return convertJavaTypeToTypeScript(typeStr)
}

function convertJavaTypeToTypeScript(javaType: string): string {
    javaType = javaType.trim()

    if (TYPE_MAPPING[javaType]) {
        return TYPE_MAPPING[javaType]
    }

    if (JAVA_BUILTIN_TYPES.has(javaType)) {
        return "unknown"
    }

    if (javaType === "?") {
        return "any"
    }

    const nestedMatch = javaType.match(/^[A-Za-z0-9_$]+\.([A-Za-z0-9_$]+)$/)
    if (nestedMatch) {
        const simpleName = nestedMatch[1]
        return `DNA${simpleName}`
    }

    const multiLevelNestedMatch = javaType.match(/^(?:[A-Za-z0-9_$]+\.)*([A-Za-z0-9_$]+)$/)
    if (multiLevelNestedMatch && javaType.includes(".")) {
        const simpleName = multiLevelNestedMatch[1]
        return `DNA${simpleName}`
    }

    return `DNA${javaType}`
}

function findJavaFile(packageName: string, className: string): string | null {
    const fileName = `${className}.java`

    if (packageName) {
        const packagePath = packageName.replace(/\./g, "/")
        const filePath = join(JAVA_DIR, packagePath, fileName)

        if (existsSync(filePath)) {
            return filePath
        }
    }

    if (className.includes(".")) {
        const parts = className.split(".")
        const outerClassName = parts[0]
        return findJavaFile(packageName, outerClassName)
    }

    function searchDirectory(dir: string): string | null {
        const files = readdirSync(dir, { withFileTypes: true })

        for (const file of files) {
            const fullPath = join(dir, file.name)

            if (file.isDirectory()) {
                const result = searchDirectory(fullPath)
                if (result) {
                    return result
                }
            } else if (file.name === fileName) {
                return fullPath
            }
        }

        return null
    }

    return searchDirectory(JAVA_DIR)
}

function parseFieldDeclaration(line: string): FieldInfo | null {
    if (line.includes("(")) {
        return null
    }

    const accessModifiers = ["public", "private", "protected", "static", "final", "transient"]

    let cleanLine = line.trim()

    for (const modifier of accessModifiers) {
        cleanLine = cleanLine.replace(new RegExp(String.raw`^${modifier}\s+`), "")
    }

    const lastSemicolonIndex = cleanLine.lastIndexOf(";")
    cleanLine = cleanLine.substring(0, lastSemicolonIndex)

    const match = cleanLine.match(/^(\S+(?:<[^>]+>)?)\s+(\w+)(?:\s*=\s*.+)?$/)
    if (!match) {
        return null
    }

    const typeStr = match[1]
    const fieldName = match[2]

    const isList = typeStr.startsWith("List<") || typeStr.startsWith("ArrayList<")
    const isMap = typeStr.startsWith("Map<")

    let listType: string | undefined
    let mapKeyType: string | undefined
    let mapValueType: string | undefined

    if (isList) {
        const listInnerMatch = typeStr.match(/^List<(.+)>$/)
        if (listInnerMatch) {
            listType = listInnerMatch[1].trim()
        }
        const arrayInnerMatch = typeStr.match(/^ArrayList<(.+)>$/)
        if (arrayInnerMatch) {
            listType = arrayInnerMatch[1].trim()
        }
    } else if (isMap) {
        const innerMatch = typeStr.match(/^Map<(.+),(.+)>$/)
        if (innerMatch) {
            mapKeyType = innerMatch[1].trim()
            mapValueType = innerMatch[2].trim()
        }
    }

    return {
        name: fieldName,
        type: parseType(typeStr),
        rawType: typeStr,
        isList,
        isMap,
        listType,
        mapKeyType,
        mapValueType,
    }
}

function parseClassFile(filePath: string, innerClassName: string | null = null): ClassInfo | null {
    const content = readFileSync(filePath, "utf-8")
    const lines = content.split("\n")

    let packageName = ""
    let className = ""
    const isStatic = false

    const fields: FieldInfo[] = []
    const innerClasses: ClassInfo[] = []

    const outerClassMatch = content.match(/^package\s+([\w.]+);/m)
    if (outerClassMatch) {
        packageName = outerClassMatch[1]
    }

    if (innerClassName) {
        className = innerClassName
    } else {
        const classMatch = content.match(/^\s*(?:public\s+)?(?:static\s+)?class\s+(\w+)/m)
        if (classMatch) {
            className = classMatch[1]
        }
    }

    // const baseFileName = basename(filePath, ".java")

    let braceDepth = 0
    let inTargetClass = false

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()

        if (!inTargetClass) {
            if (trimmed.match(/\bclass\s+\w+/)) {
                inTargetClass = true
                const openBraces = (line.match(/{/g) || []).length
                const closeBraces = (line.match(/}/g) || []).length
                braceDepth += openBraces - closeBraces
            }
            continue
        }

        const openBraces = (line.match(/{/g) || []).length
        const closeBraces = (line.match(/}/g) || []).length
        braceDepth += openBraces - closeBraces

        if (braceDepth <= 0) {
            break
        }

        if (trimmed.match(/^(public|private|protected)?\s*(static)?\s*class\s+\w+/) && braceDepth === 2) {
            const innerClassMatch = trimmed.match(/^(?:public|private|protected)?\s*(static)?\s*class\s+(\w+)/)
            if (innerClassMatch) {
                const innerName = innerClassMatch[2]
                const innerStatic = innerClassMatch[1] !== undefined
                const innerStartLine = i + 1
                let innerBraceDepth = 1
                const innerFields: FieldInfo[] = []

                for (let j = innerStartLine; j < lines.length; j++) {
                    const innerLine = lines[j]
                    const innerTrimmed = innerLine.trim()

                    const innerOpenBraces = (innerLine.match(/{/g) || []).length
                    const innerCloseBraces = (innerLine.match(/}/g) || []).length
                    innerBraceDepth += innerOpenBraces - innerCloseBraces

                    if (innerBraceDepth <= 0) {
                        break
                    }

                    if (innerBraceDepth === 1) {
                        if (
                            innerTrimmed.match(/^(private|public|protected)?\s*(?:final|transient|static)?\s+\w+/) &&
                            !innerTrimmed.includes("(")
                        ) {
                            const field = parseFieldDeclaration(innerTrimmed)
                            if (field) {
                                innerFields.push(field)
                            }
                        }
                    }
                }

                innerClasses.push({
                    name: innerName,
                    package: packageName,
                    filePath: filePath,
                    fields: innerFields,
                    innerClasses: [],
                    isStatic: innerStatic,
                })
            }
            continue
        }

        if (braceDepth === 1) {
            if (trimmed.match(/^(private|public|protected|final|transient|static)?\s*\S+\s+\w+/) && !trimmed.includes("(")) {
                const field = parseFieldDeclaration(trimmed)
                if (field) {
                    fields.push(field)
                }
            }
        }
    }

    const result = {
        name: className,
        package: packageName,
        filePath,
        fields,
        innerClasses,
        isStatic,
    }

    for (const innerClass of result.innerClasses) {
        const innerClassSymbol = `${result.name}.${innerClass.name}`
        if (!symbolTable.has(innerClassSymbol)) {
            symbolTable.set(innerClassSymbol, {
                filePath: filePath,
                className: innerClass.name,
                isInnerClass: true,
                outerClassName: result.name,
            })
        }
    }

    return result
}

function addTypeToQueue(typeName: string) {
    if (processedTypes.has(typeName) || typeQueue.includes(typeName)) {
        return
    }

    if (JAVA_BUILTIN_TYPES.has(typeName)) {
        return
    }

    typeQueue.push(typeName)
}

function processClass(className: string): string | null {
    if (processedTypes.has(className)) {
        return null
    }

    if (JAVA_BUILTIN_TYPES.has(className)) {
        return null
    }

    processedTypes.add(className)

    const filePath = findJavaFile("", className)

    if (!filePath) {
        return null
    }

    const classInfo = parseClassFile(filePath)

    if (!classInfo) {
        return null
    }

    let result = ""

    for (const innerClass of classInfo.innerClasses) {
        // const innerTypeName = extractTypeName(`${classInfo.name}.${innerClass.name}`)
        // const innerTsName = `DNA${innerClass.name}`

        result += generateInterface(innerClass)
    }

    result += generateInterface(classInfo)

    return result
}

function collectReferencedTypes(classInfo: ClassInfo): string[] {
    const types: string[] = []

    for (const field of classInfo.fields) {
        if (field.listType) {
            const innerTypeName = extractTypeName(field.listType)
            if (!JAVA_BUILTIN_TYPES.has(innerTypeName)) {
                types.push(innerTypeName)
            }

            if (field.listType.includes(".")) {
                const outerClassName = field.listType.split(".")[0]
                if (!JAVA_BUILTIN_TYPES.has(outerClassName)) {
                    types.push(outerClassName)
                }
            }
        } else if (field.mapValueType) {
            const innerTypeName = extractTypeName(field.mapValueType)
            if (!JAVA_BUILTIN_TYPES.has(innerTypeName)) {
                types.push(innerTypeName)
            }

            if (field.mapValueType.includes(".")) {
                const outerClassName = field.mapValueType.split(".")[0]
                if (!JAVA_BUILTIN_TYPES.has(outerClassName)) {
                    types.push(outerClassName)
                }
            }
        } else if (!field.isList && !field.isMap) {
            const fieldTypeName = field.type.replace(/^DNA/, "")
            if (fieldTypeName !== field.type && fieldTypeName !== "any" && !JAVA_BUILTIN_TYPES.has(fieldTypeName)) {
                types.push(fieldTypeName)
            }

            if (field.rawType.includes(".")) {
                const outerClassName = field.rawType.split(".")[0]
                if (!JAVA_BUILTIN_TYPES.has(outerClassName)) {
                    types.push(outerClassName)
                }
            }
        }
    }

    return types
}

function generateInterface(classInfo: ClassInfo): string {
    const tsName = `DNA${classInfo.name}`
    let result = `export interface ${tsName} {\n`

    for (const field of classInfo.fields) {
        if (field.type === "unknown") {
            continue
        }
        result += `    ${field.name}: ${field.type}\n`
    }

    result += "}\n\n"
    return result
}

function parseApiServiceFiles(): string[] {
    const apiServices: string[] = []

    function scanDirectory(dir: string) {
        const files = readdirSync(dir, { withFileTypes: true })

        for (const file of files) {
            const fullPath = join(dir, file.name)

            if (file.isDirectory()) {
                scanDirectory(fullPath)
            } else if (file.name.endsWith("ApiService.java")) {
                apiServices.push(fullPath)
            }
        }
    }

    scanDirectory(JAVA_DIR)
    return apiServices
}

function extractTypesFromApiService(filePath: string): string[] {
    const content = readFileSync(filePath, "utf-8")
    const types: string[] = []

    // 处理 List<T> 类型
    const listMatches = content.matchAll(/Observable<TimeBasicResponse<List<(\w+)>>>/g)
    for (const match of listMatches) {
        types.push(match[1])
    }

    // 处理普通类型
    const observableMatches = content.matchAll(/Observable<TimeBasicResponse<(\w+)>>/g)
    for (const match of observableMatches) {
        types.push(match[1])
    }

    // 处理 TimeBasicResponse<T>
    const timeBasicResponseListMatches = content.matchAll(/TimeBasicResponse<List<(\w+)>>/g)
    for (const match of timeBasicResponseListMatches) {
        types.push(match[1])
    }

    const timeBasicResponseMatches = content.matchAll(/TimeBasicResponse<(\w+)>/g)
    for (const match of timeBasicResponseMatches) {
        types.push(match[1])
    }

    return types
}

function generateCode(): string {
    let code = "// Auto-generated by java-to-typescript.ts\n\n"

    const apiServiceFiles = parseApiServiceFiles()

    const referencedTypes = new Set<string>()

    for (const apiServiceFile of apiServiceFiles) {
        const types = extractTypesFromApiService(apiServiceFile)
        for (const type of types) {
            referencedTypes.add(type)
        }
    }

    for (const type of referencedTypes) {
        addTypeToQueue(type)
    }

    while (typeQueue.length > 0) {
        const typeName = typeQueue.shift()!
        processClass(typeName)
    }

    const sortedTypes = Array.from(processedTypes).sort()

    for (const typeName of sortedTypes) {
        const filePath = findJavaFile("", typeName)
        if (filePath) {
            const classInfo = parseClassFile(filePath)
            if (classInfo) {
                const referenced = collectReferencedTypes(classInfo)
                for (const refType of referenced) {
                    referencedTypes.add(refType)
                }
            }
        }
    }

    processedTypes.clear()

    for (const type of referencedTypes) {
        addTypeToQueue(type)
    }

    const allTypesToGenerate = new Set(referencedTypes)

    while (typeQueue.length > 0) {
        const typeName = typeQueue.shift()!
        const tsCode = processClass(typeName)
        if (tsCode) {
            code += tsCode
        }

        const filePath = findJavaFile("", typeName)
        if (filePath) {
            const classInfo = parseClassFile(filePath)
            if (classInfo) {
                const referenced = collectReferencedTypes(classInfo)
                for (const refType of referenced) {
                    if (!allTypesToGenerate.has(refType)) {
                        allTypesToGenerate.add(refType)
                        addTypeToQueue(refType)
                    }
                }
            }
        }
    }

    return code
}

function main() {
    const code = generateCode()
    writeFileSync(OUTPUT_FILE, code, "utf-8")
    console.log(`Generated TypeScript types to ${OUTPUT_FILE}`)
}

main()
