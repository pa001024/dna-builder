import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, "..")
const sourceExecutablePath = resolve(projectRoot, "src-tauri", "target", "release", "examples", "dob-script.exe")
const targetExecutablePath = resolve(projectRoot, "packages", "dob-script", "bin", "dob-script.exe")
const sourceOpenCvDllPath = resolve(projectRoot, "src-tauri", "target", "release", "opencv_world490.dll")
const targetOpenCvDllPath = resolve(projectRoot, "packages", "dob-script", "bin", "opencv_world490.dll")
const sourceDirectMLDllPath = resolve(projectRoot, "src-tauri", "target", "release", "examples", "DirectML.dll")
const targetDirectMLDllPath = resolve(projectRoot, "packages", "dob-script", "bin", "DirectML.dll")

/**
 * 校验构建产物是否存在。
 *
 * @param {string} filePath 文件绝对路径
 */
function ensureFileExists(filePath) {
    if (!existsSync(filePath)) {
        throw new Error(`未找到构建产物: ${filePath}`)
    }
}

/**
 * 准备 npm 包内的可执行文件。
 */
function prepareExecutable() {
    ensureFileExists(sourceExecutablePath)
    ensureFileExists(sourceOpenCvDllPath)
    ensureFileExists(sourceDirectMLDllPath)
    mkdirSync(dirname(targetExecutablePath), { recursive: true })
    copyFileSync(sourceExecutablePath, targetExecutablePath)
    copyFileSync(sourceOpenCvDllPath, targetOpenCvDllPath)
    copyFileSync(sourceDirectMLDllPath, targetDirectMLDllPath)
    const sizeInKb = (statSync(targetExecutablePath).size / 1024).toFixed(2)
    console.log(`已复制 dob-script.exe -> ${targetExecutablePath} (${sizeInKb} KB)`)
    const dllSizeInKb = (statSync(targetOpenCvDllPath).size / 1024).toFixed(2)
    console.log(`已复制 opencv_world490.dll -> ${targetOpenCvDllPath} (${dllSizeInKb} KB)`)
    const directMlDllSizeInKb = (statSync(targetDirectMLDllPath).size / 1024).toFixed(2)
    console.log(`已复制 DirectML.dll -> ${targetDirectMLDllPath} (${directMlDllSizeInKb} KB)`)
}

prepareExecutable()
