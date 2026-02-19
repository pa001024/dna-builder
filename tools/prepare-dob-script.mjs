import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, "..")
const sourceExecutablePath = resolve(projectRoot, "src-tauri", "target", "release", "dob-script.exe")
const targetExecutablePath = resolve(projectRoot, "packages", "dob-script", "bin", "dob-script.exe")
const sourceOpenCvDllPath = resolve(projectRoot, "src-tauri", "opencv_world490.dll")
const targetOpenCvDllPath = resolve(projectRoot, "packages", "dob-script", "bin", "opencv_world490.dll")

/**
 * 校验构建产物是否存在。
 *
 * @param {string} filePath 文件绝对路径
 */
function ensureFileExists(filePath) {
    if (!existsSync(filePath)) {
        throw new Error(`未找到可执行文件: ${filePath}`)
    }
}

/**
 * 准备 npm 包内的可执行文件。
 */
function prepareExecutable() {
    ensureFileExists(sourceExecutablePath)
    ensureFileExists(sourceOpenCvDllPath)
    mkdirSync(dirname(targetExecutablePath), { recursive: true })
    copyFileSync(sourceExecutablePath, targetExecutablePath)
    copyFileSync(sourceOpenCvDllPath, targetOpenCvDllPath)
    const sizeInKb = (statSync(targetExecutablePath).size / 1024).toFixed(2)
    console.log(`已复制 dob-script.exe -> ${targetExecutablePath} (${sizeInKb} KB)`)
    const dllSizeInKb = (statSync(targetOpenCvDllPath).size / 1024).toFixed(2)
    console.log(`已复制 opencv_world490.dll -> ${targetOpenCvDllPath} (${dllSizeInKb} KB)`)
}

prepareExecutable()
