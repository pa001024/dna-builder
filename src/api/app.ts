import { invoke } from "@tauri-apps/api/core"

export const MATERIALS = ["None", "Blur", "Acrylic", "Mica", "Mica_Dark", "Mica_Tabbed", "Mica_Tabbed_Dark"] as const
export async function applyMaterial(material: (typeof MATERIALS)[number]) {
    return (await invoke("apply_material", { material })) as string
}

export async function getOSVersion() {
    return await invoke<string>("get_os_version")
}

export async function getGameInstall() {
    return await invoke<string>("get_game_install")
}

export async function isGameRunning(isRun: boolean) {
    return await invoke<string>("is_game_running", { isRun })
}

export async function launchExe(path: string, params: string) {
    return await invoke<string>("launch_exe", { path, params })
}

export async function openExplorer(dir: string) {
    return await invoke<string>("launch_exe", { path: "explorer.exe", params: dir })
}

export async function importMod(gamebase: string, paths: string[]) {
    const data = await invoke<string>("import_mod", { gamebase, paths })
    return JSON.parse(data) as [string, number][]
}

export async function enableMod(srcdir: string, dstdir: string, files: string[]) {
    return await invoke<string>("enable_mod", { srcdir, dstdir, files })
}

export async function importPic(path: string) {
    return await invoke<string>("import_pic", { path })
}
